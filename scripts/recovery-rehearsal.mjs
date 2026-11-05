#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `LA Chef coordinated recovery rehearsal preflight

Usage:
  node scripts/recovery-rehearsal.mjs \\
    --database <source-database> \\
    --backup-path <absolute-.bak-path> \\
    --proof-root <absolute-private-upload-root> \\
    --proof-snapshot-path <absolute-new-snapshot-path> \\
    --manifest <absolute-new-manifest.json>

Planning-only option:
  --skip-sqlcmd-check  Create the manifest without claiming tool readiness.

This command validates and pairs the SQL backup and private proof-storage
paths in an immutable PLANNED manifest.
It does not execute SQL backup, file copy, restore, or deletion operations.
`;

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function requireAbsolute(filePath, label) {
  const value = requiredString(filePath, label);
  if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  return path.resolve(value);
}

function isSameOrInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertMissing(filePath, label) {
  try {
    await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; choose a new path to prevent overwrite.`);
}

async function validatedProofRoot(proofRoot) {
  const details = await lstat(proofRoot).catch(error => {
    if (error?.code === 'ENOENT') throw new Error('Proof storage root does not exist.');
    throw error;
  });
  if (details.isSymbolicLink() || !details.isDirectory()) {
    throw new Error('Proof storage root must be a real directory, not a link or file.');
  }
  return realpath(proofRoot);
}

function recoverySetId(createdAt, databaseName) {
  const timestamp = createdAt.replaceAll('-', '').replaceAll(':', '').replace('.', '');
  const database = databaseName.toLowerCase().replaceAll('_', '-');
  return `${timestamp}-${database}`;
}

function pairingChecksum(planWithoutChecksum) {
  return createHash('sha256').update(JSON.stringify(planWithoutChecksum)).digest('hex');
}

export async function verifySqlcmdAvailable(
  runner = (command, args) => spawnSync(command, args, { stdio: 'ignore' }),
) {
  const result = await runner('sqlcmd', ['-?']);
  if (result?.status !== 0) {
    throw new Error('sqlcmd is required for a staging recovery rehearsal preflight.');
  }
}

export async function buildRecoveryPlan(options) {
  const databaseName = requiredString(options?.databaseName, 'Source database name');
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error('Source database name may contain only letters, numbers, and underscores.');
  }
  if (/^LA_CHEF_RESTORE_VERIFY_/i.test(databaseName)) {
    throw new Error('Source database cannot be a recovery verification database.');
  }

  const backupPath = requireAbsolute(options?.backupPath, 'SQL backup path');
  if (path.extname(backupPath).toLowerCase() !== '.bak') {
    throw new Error('SQL backup path must end in .bak.');
  }
  const suppliedProofRoot = requireAbsolute(options?.proofRoot, 'Proof storage root');
  await validatedProofRoot(suppliedProofRoot);
  const proofRoot = suppliedProofRoot;
  const proofSnapshotPath = requireAbsolute(
    options?.proofSnapshotPath,
    'Proof snapshot path',
  );
  const manifestPath = requireAbsolute(options?.manifestPath, 'Manifest path');

  if (isSameOrInside(proofSnapshotPath, proofRoot) || isSameOrInside(proofRoot, proofSnapshotPath)) {
    throw new Error('Proof snapshot path must be outside the proof storage root.');
  }
  if (isSameOrInside(backupPath, proofRoot) || isSameOrInside(manifestPath, proofRoot)) {
    throw new Error('Backup and manifest paths must be outside the proof storage root.');
  }

  await Promise.all([
    assertMissing(backupPath, 'SQL backup path'),
    assertMissing(proofSnapshotPath, 'Proof snapshot path'),
    assertMissing(manifestPath, 'Recovery manifest'),
  ]);

  const now = options?.now instanceof Date ? options.now : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Recovery plan timestamp is invalid.');
  const createdAt = now.toISOString();
  const planWithoutChecksum = {
    schemaVersion: 1,
    recoverySetId: recoverySetId(createdAt, databaseName),
    status: 'PLANNED',
    createdAt,
    scope: 'reservation-and-billing-recovery',
    database: {
      name: databaseName,
      backupPath,
      backupScript: 'operations/sql-server/backup.sql',
      restoreScript: 'operations/sql-server/restore-verification.sql',
    },
    proofStorage: {
      sourcePath: proofRoot,
      snapshotPath: proofSnapshotPath,
    },
    manifestPath,
  };

  return {
    ...planWithoutChecksum,
    pairingChecksumSha256: pairingChecksum(planWithoutChecksum),
  };
}

export async function writeRecoveryManifest(plan) {
  const manifestPath = requireAbsolute(plan?.manifestPath, 'Manifest path');
  await mkdir(path.dirname(manifestPath), { recursive: true });

  let handle;
  try {
    handle = await open(manifestPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('Recovery manifest already exists; it will not be overwritten.');
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };

  const names = new Map([
    ['--database', 'databaseName'],
    ['--backup-path', 'backupPath'],
    ['--proof-root', 'proofRoot'],
    ['--proof-snapshot-path', 'proofSnapshotPath'],
    ['--manifest', 'manifestPath'],
  ]);
  const parsed = {};
  for (let index = 0; index < argv.length;) {
    const argument = argv[index];
    if (argument === '--skip-sqlcmd-check') {
      parsed.skipSqlcmdCheck = true;
      index += 1;
      continue;
    }
    const key = names.get(argument);
    const value = argv[index + 1];
    if (!key || value === undefined || value.startsWith('--')) {
      throw new Error(`Unknown or incomplete argument: ${argument ?? '(missing)'}`);
    }
    if (parsed[key] !== undefined) throw new Error(`Duplicate argument: ${argument}`);
    parsed[key] = value;
    index += 2;
  }
  return parsed;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  if (!options.skipSqlcmdCheck) await verifySqlcmdAvailable();
  const plan = await buildRecoveryPlan(options);
  await writeRecoveryManifest(plan);
  process.stdout.write(
    `Recovery rehearsal plan created: ${plan.manifestPath}\n`
      + `Recovery set: ${plan.recoverySetId}\n`
      + `Status: ${plan.status}\n`,
  );
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch(error => {
    process.stderr.write(`Recovery preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
