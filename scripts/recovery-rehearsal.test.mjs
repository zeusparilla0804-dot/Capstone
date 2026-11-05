import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  buildRecoveryPlan,
  verifySqlcmdAvailable,
  writeRecoveryManifest,
} from './recovery-rehearsal.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./recovery-rehearsal.mjs', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'la-chef-recovery-'));
  const proofRoot = path.join(root, 'uploads');
  await mkdir(path.join(proofRoot, 'payment-proofs'), { recursive: true });

  return {
    root,
    proofRoot,
    backupPath: path.join(root, 'sql-backups', 'la-chef-staging.bak'),
    proofSnapshotPath: path.join(root, 'proof-snapshots', 'la-chef-staging'),
    manifestPath: path.join(root, 'manifests', 'la-chef-staging.json'),
  };
}

test('buildRecoveryPlan creates one non-secret recovery-set identity for SQL and proof storage', async () => {
  const paths = await fixture();
  const plan = await buildRecoveryPlan({
    databaseName: 'la_chef_staging',
    ...paths,
    now: new Date('2026-10-18T02:03:04.567Z'),
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.status, 'PLANNED');
  assert.equal(plan.createdAt, '2026-10-18T02:03:04.567Z');
  assert.match(plan.recoverySetId, /^20261018T020304567Z-la-chef-staging$/);
  assert.equal(plan.database.name, 'la_chef_staging');
  assert.equal(plan.database.backupPath, path.resolve(paths.backupPath));
  assert.equal(plan.proofStorage.sourcePath, path.resolve(paths.proofRoot));
  assert.equal(plan.proofStorage.snapshotPath, path.resolve(paths.proofSnapshotPath));
  assert.equal(plan.manifestPath, path.resolve(paths.manifestPath));
  assert.match(plan.pairingChecksumSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(plan), /password|secret|token/i);
});

test('buildRecoveryPlan rejects unsafe, ambiguous, or overwrite-prone paths', async () => {
  const paths = await fixture();
  const base = {
    databaseName: 'la_chef_staging',
    ...paths,
    now: new Date('2026-10-18T02:03:04.567Z'),
  };

  await assert.rejects(
    buildRecoveryPlan({ ...base, databaseName: 'LA_CHEF_RESTORE_VERIFY_20261018' }),
    /source database/i,
  );
  await assert.rejects(
    buildRecoveryPlan({ ...base, backupPath: 'relative.bak' }),
    /absolute/i,
  );
  await assert.rejects(
    buildRecoveryPlan({ ...base, backupPath: path.join(paths.root, 'backup.zip') }),
    /\.bak/i,
  );
  await assert.rejects(
    buildRecoveryPlan({
      ...base,
      proofSnapshotPath: path.join(paths.proofRoot, 'snapshots', 'copy'),
    }),
    /outside.*proof/i,
  );

  await mkdir(paths.proofSnapshotPath, { recursive: true });
  await assert.rejects(buildRecoveryPlan(base), /already exists/i);
});

test('writeRecoveryManifest creates a new immutable planned manifest without overwriting', async () => {
  const paths = await fixture();
  const plan = await buildRecoveryPlan({
    databaseName: 'la_chef_staging',
    ...paths,
    now: new Date('2026-10-18T02:03:04.567Z'),
  });

  await writeRecoveryManifest(plan);
  const stored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
  assert.deepEqual(stored, plan);

  await assert.rejects(writeRecoveryManifest(plan), /already exists/i);
  await writeFile(paths.manifestPath, 'operator evidence', 'utf8');
  await assert.rejects(writeRecoveryManifest(plan), /already exists/i);
  assert.equal(await readFile(paths.manifestPath, 'utf8'), 'operator evidence');
});

test('CLI prepares a manifest only after all recovery-set paths are supplied', async () => {
  const paths = await fixture();
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    scriptPath,
    '--database', 'la_chef_staging',
    '--backup-path', paths.backupPath,
    '--proof-root', paths.proofRoot,
    '--proof-snapshot-path', paths.proofSnapshotPath,
    '--manifest', paths.manifestPath,
    '--skip-sqlcmd-check',
  ]);

  assert.equal(stderr, '');
  assert.match(stdout, /Recovery rehearsal plan created/i);
  assert.match(stdout, /PLANNED/);
  const stored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
  assert.equal(stored.status, 'PLANNED');
});

test('verifySqlcmdAvailable requires a successful sqlcmd probe', async () => {
  const calls = [];
  await verifySqlcmdAvailable((command, args) => {
    calls.push([command, args]);
    return { status: 0 };
  });
  assert.deepEqual(calls, [['sqlcmd', ['-?']]]);

  await assert.rejects(
    verifySqlcmdAvailable(() => ({ status: 1, error: new Error('missing') })),
    /sqlcmd.*required/i,
  );
});

test('CLI help states that it does not execute backup, copy, restore, or delete operations', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, '--help']);

  assert.equal(stderr, '');
  assert.match(stdout, /preflight/i);
  assert.match(stdout, /does not execute SQL backup, file copy, restore, or deletion/i);
});

test('CI and deployment guidance keep the recovery preflight under regression coverage', async () => {
  const [workflow, deployment, inventory] = await Promise.all([
    readRepositoryFile('.github/workflows/ci.yml'),
    readRepositoryFile('docs/DEPLOYMENT.md'),
    readRepositoryFile('docs/RELEASE_FILE_INVENTORY.md'),
  ]);

  assert.match(workflow, /node --test \.\.\/scripts\/recovery-rehearsal\.test\.mjs/);
  assert.match(deployment, /node scripts\/recovery-rehearsal\.mjs/);
  assert.match(deployment, /PLANNED.*does not.*complete.*rehearsal/is);
  assert.match(inventory, /scripts\/recovery-rehearsal\.mjs/);
  assert.match(inventory, /scripts\/recovery-rehearsal\.test\.mjs/);
});
