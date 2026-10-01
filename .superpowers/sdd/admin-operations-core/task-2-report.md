# Task 2 Report: Private Proof Storage And Upload Validation

## Status

COMPLETE

## Commit

- `5a5ee54190981c32b3ccdf2e348617d1bc694963`
- Message: `feat: add private payment proof storage`

## Changed Files

- `.gitignore`
- `backend/.env.example`
- `backend/.env.staging.example`
- `backend/.env.production.example`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/src/config/environment.ts`
- `backend/src/config/uploads.ts`
- `backend/src/services/proof-storage.service.ts`
- `backend/src/middleware/payment-proof-upload.middleware.ts`
- `backend/src/services/proof-storage.service.test.ts`

## RED Evidence

Command:

```text
npx.cmd tsx --test src/services/proof-storage.service.test.ts
```

Observed expected failure before production implementation:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../src/services/proof-storage.service.js
tests 1
pass 0
fail 1
```

The failure was caused by the missing Task 2 storage module, not by a malformed assertion.

## GREEN Evidence

Focused command:

```text
npx.cmd tsx --test src/services/proof-storage.service.test.ts
```

Result: 7 tests passed, 0 failed. Coverage includes JPEG/PNG/WebP signatures, exact 5 MiB acceptance, one-byte-over rejection, mismatch and random-byte cleanup, generated keys, original-name isolation, open/delete behavior, and traversal resistance.

Full backend command:

```text
npm.cmd test
```

Result: 15 tests passed, 0 failed.

Build command:

```text
npm.cmd run build
```

Result: TypeScript production build completed successfully.

## Dependency Audit

Command:

```text
npm.cmd audit --omit=dev
```

Result:

```text
found 0 vulnerabilities
```

## Self-Review

- Final storage paths always use a server-generated UUID and validated extension.
- Original filenames are metadata only and cannot affect destination paths.
- Storage keys must match the private `payment-proofs/<uuid>.<extension>` namespace.
- File identity is determined from content signatures, not only multipart metadata.
- Validation rejects unsupported, mismatched, and oversized files and deletes their temporary files.
- Save failures also attempt temporary-file cleanup.
- Multer accepts one `proof` file and enforces the 5,242,880-byte multipart limit.
- The upload root is required configuration and sample files contain placeholders only.
- Runtime upload contents are ignored without ignoring source or environment templates.
- No static/public route exposes the upload root.
- Commit used explicit Task 2 path limits; unrelated dirty and staged paths were not included.

## Concerns

- Existing developer-local `backend/.env` files must add `PAYMENT_PROOF_UPLOAD_ROOT` before starting the backend because the setting is intentionally required.
- Filesystem storage is suitable for the current single-host deployment; a future horizontally scaled deployment will need shared/object storage behind the same `ProofStorage` interface.

## Fix Round 1

### Status

COMPLETE

### Findings Addressed

- Registered best-effort temporary cleanup for request abort and response finish, error, and close. A successful storage save removes the same path first; lifecycle cleanup then treats `ENOENT` as harmless.
- Added real multipart HTTP tests through Express and the existing error handler for declared MIME mismatch, unsupported extension, the 5 MiB Multer limit, unexpected fields, multiple files, and downstream errors.
- Added storage tests for stat/read failure, persistence failure, cleanup failure masking, validated-byte substitution, non-regular paths, private modes, and symlink substitution where no-follow flags are supported.
- Upload roots and proof directories are created/chmodded to `0700`; completed temporary uploads and final proof files are chmodded to `0600` where the platform supports POSIX modes.
- Validation and open use file descriptors, regular-file checks, and `O_NOFOLLOW` where the runtime exposes it.
- Validation reads at most 5,242,881 bytes and stores a bounded in-memory copy. Persistence writes that validated copy with exclusive creation instead of reopening or renaming the unchecked temporary pathname.
- Cleanup and descriptor-close failures are logged best-effort and cannot replace the primary validation or storage error.
- Removed the unrelated `**/.vscode/` ignore entry introduced in the prior Task 2 commit.
- Added `engines.node: >=22.22.3` to backend package metadata and lockfile metadata.

### RED Evidence

Initial focused fix run produced six expected failures:

```text
unexpected field: expected 400, received 500
multiple files: expected 400, received 500
downstream error: temporary upload remained
cleanup lifecycle: helper did not exist
cleanup masking: EPERM replaced the primary read error
validated-byte substitution: changed pathname bytes were persisted
```

An additional lifecycle RED test emitted an unhandled response `error` before the response-error cleanup listener was added.

### GREEN Evidence

Focused command:

```text
npx.cmd tsx --test src/services/proof-storage.service.test.ts src/middleware/payment-proof-upload.middleware.test.ts
```

Result: 20 passed, 0 failed, 3 skipped. The skips are Windows-only checks for POSIX mode bits and `O_NOFOLLOW`; the corresponding implementation is exercised on supporting platforms.

Full backend command:

```text
npm.cmd test
```

Result: 28 passed, 0 failed, 3 skipped.

Build command:

```text
npm.cmd run build
```

Result: TypeScript build passed.

Production audit command:

```text
npm.cmd audit --omit=dev
```

Result: `found 0 vulnerabilities`.

### Fix Commit

- `e482b108e1e28a41c304d69c17982e8d5cdd8c8e`
- Message: `fix: harden private payment proof storage`

### Fix-Round Concerns

- The current workstation runs Node `22.22.0`, slightly below the newly declared project minimum `22.22.3`; verification passed, but deployment and CI should use Node `22.22.3` or newer.
- POSIX permission-bit and no-follow assertions are skipped on Windows because those semantics are not exposed there; descriptor regular-file validation remains active cross-platform.

## Fix Round 2

### Status

COMPLETE

### Findings Addressed

- Added non-skipped Windows-capable junction/symlink tests for both the temporary upload path and stored proof directory.
- Every path component beneath the configured private root is checked with `lstat`; symbolic links and Windows junction/reparse links are rejected.
- `realpath` must match the expected path beneath the real private root, preventing component redirection that lexical containment alone cannot detect.
- Descriptor `fstat` identity is compared with path entries before use while retaining `O_NOFOLLOW` where supported.
- Safe cleanup performs the same containment/link checks and therefore refuses to follow a substituted junction to delete an external target.
- Validation repeats descriptor and path checks after the bounded read and rejects size, modification-time, or identity changes during validation.
- Validated and stored `byteSize` now comes from `bytes.byteLength`, matching the exact buffer persisted rather than the initial stat value.
- Stored-file deletion now applies private-path checks before unlinking.
- Scoped `git diff --check` is clean; the reported trailing blank-line issue is removed.

### RED Evidence

The focused service test initially produced three expected failures:

```text
stale byte metadata: expected 29, received 999
stored directory junction: missing expected rejection
temporary directory junction: missing expected rejection
```

These failures reproduced the reviewer findings on the Windows test host without skipping the junction threat.

### GREEN Evidence

Focused command:

```text
npx.cmd tsx --test src/services/proof-storage.service.test.ts src/middleware/payment-proof-upload.middleware.test.ts
```

Result: 23 passed, 0 failed, 2 skipped. Only POSIX permission-bit checks are skipped on Windows; both junction tests run and pass.

Full backend command:

```text
npm.cmd test
```

Result: 31 passed, 0 failed, 2 skipped.

Build command:

```text
npm.cmd run build
```

Result: TypeScript build passed.

Production audit command:

```text
npm.cmd audit --omit=dev
```

Result: `found 0 vulnerabilities`.

Whitespace command:

```text
git diff --check -- <Task 2 paths>
```

Result: passed with no whitespace errors.

### Fix Commits

- Implementation: `161e3556871d4977447565d6d8602a1b5897a43a`
- Message: `fix: reject payment proof path substitutions`
- Report finalization: recorded by the report-only child commit containing this line.

### Fix-Round Concerns

- Node does not expose an `openat`-style API on Windows. The implementation uses the strongest available checks: component `lstat`, expected `realpath`, descriptor regular-file validation, and pre/post descriptor identity checks. A same-user attacker with precise concurrent filesystem mutation may still present a residual race that cannot be fully closed with current Node filesystem APIs.
- The local runtime remains Node `22.22.0`; CI and deployment should use the declared minimum Node `22.22.3` or newer.
