# PROspector local operator

This is the one-owner local app from `operator-os`. It runs at **http://127.0.0.1:8080** with a private on-disk PGlite database. It needs Node **22.13 or newer**. It has no sandbox assets, OAuth, hosted project, or `DATABASE_URL` requirement.

## First launch

```sh
cd operator
npm ci
npm run owner:setup
npm run build
npm start
```

Choose a unique 16–128 character owner password at the hidden terminal prompt. Open the exact URL above and unlock with that password. Enrollment is local CLI only; there is no public signup or first-visitor ownership race. The fixed local email is an internal identifier, not an email-delivery destination. Do not pass passwords in command arguments or environment variables. For automation, setup also accepts one password line on stdin.

The server binds only IPv4 loopback. `localhost`, alternate ports, reverse proxies, foreign Host/Origin, and forwarded authority headers are deliberately unsupported. Do not expose this process using a tunnel or proxy. Owner sessions are HttpOnly/SameSite=Strict, persist for seven days, and are revoked on logout; no dev-user, bearer, sandbox OAuth, or hosted gate bypass exists. `VITE_AUTH_ENABLED=false` cannot disable owner checks.

For source development after enrollment, use `npm run dev`. Production `npm start` uses the built Node server; `npm run build` copies PGlite's package-supplied WASM/data assets into its server bundle and never runs a remote database migration. `DATABASE_URL` must be unset. `npm run preview` is the same local launcher. The desktop launcher is outside this supported path.

## Stop, data and recovery

Stop with **Ctrl-C** in the launch terminal and wait for exit before starting another process. Only one process can open a data directory. Never run dev and production against the same directory simultaneously.

Default data directory:

- macOS: `~/Library/Application Support/PROspector/operator`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/prospector/operator`

For an alternate installation or isolated test, export `OPERATOR_DATA_DIR` as an **absolute path outside the checkout** before **all** setup/start/recovery commands. `.env.example` is documentation; it is not automatically loaded. Symlinked data paths are rejected; resolve them to their physical path first (for example macOS `/private/tmp`, rather than `/tmp`). The selected directory is private mode 0700; database and configuration files use 0600.

Keep these together: `database/`, `owner.json` (owner ID, password hash and session signing material), and `operator.vault` (local encryption key). The vault encrypts saved provider values with AES-256-GCM. OS file permissions protect the key; this is not an OS keychain or protection from another process running as your OS user. No portable plaintext credential export is added.

For a local safety backup, stop the app and copy the **entire private directory** to protected storage with the same permissions. Keep it out of Git, cloud sharing and public folders. Restore the whole matching directory while stopped; do not mix one database with another owner's file or key. The app also provides a versioned JSON workspace archive in Settings. It includes workspace records/history and suppressions, excludes credentials, and restores atomically after validation. Restore resets live approvals and keeps terminal handoff history; it rejects an older archive that would erase an already recorded handoff. Keep a current export before recovery. Use the complete stopped-process directory backup when recovering credentials or the vault.

- **Forgotten password:** stop the app, keep a protected backup, then run `npm run owner:reset` using the same data directory. It preserves the owner ID, workspace and vault, rotates session signing material, and invalidates old sessions. Setup/reset holds the database lock for the whole operation.
- **Missing/corrupt owner or vault file:** restore the matching protected backup. Do not delete the database or generate a replacement vault key; ciphertext cannot be recovered without its original key. Runtime decryption reports missing/malformed-key errors and never creates a key.
- **“Database is locked” after a crash:** first verify every operator process using this directory is stopped. Back up the directory. Only then remove the empty `.database.lock` directory with `rmdir` and restart. There is no automatic stale-lock takeover and no reset command.
- **Migration failure:** stop, preserve the data directory and error, and fix the new migration or restore a complete stopped-process backup with its matching application version. Each migration and its journal entry are atomic. Applied migrations are tracked by filename: never edit or remove an applied SQL file; add a new migration. Existing rows are never automatically erased or reassigned.
- **Legacy key:** if a prior explicit vault file must be preserved, `OPERATOR_VAULT_PATH` may name its absolute private path outside the checkout. A legacy `operator/.data/operator.vault` is not silently abandoned; move it outside the checkout while stopped and point to it explicitly. Include this external key in protected backups. In-memory databases from the old fallback cannot be recovered after their process exits.

## Integration and verification

The existing `Sql` tagged-template and `query(text, params)` API remains unchanged. The additive API is:

```ts
const sql = await getSql();
await sql.transaction(async (tx) => {
  await tx`insert into example (value) values (${"fictional"})`;
  await tx.query("update example set value = $1", ["fictional update"]);
  // Return commits; throwing/rejecting rolls back all writes.
});
```

Use **only `tx` inside the callback**, await all work, and do not retain it after return. Nested transactions reject. PGlite uses its native transaction; the Postgres-compatible path pins one pool connection for BEGIN/COMMIT/ROLLBACK. Archive restore uses this callback; do not send separate BEGIN/COMMIT through pooled `sql.query`. `closeDatabase()` is for controlled shutdown/test teardown after outstanding operations finish, not live HMR reset. The remote Postgres path is retained for API compatibility but is not exercised or supported by the local launcher.

```sh
npm run build
npm run typecheck
npm run test:foundation
npm run lint
npm test
```

The focused foundation command uses only fictional temporary records, real loopback HTTP, separate server processes and an in-process credential stub. It checks owner denial, foreign-origin rejection, session/logout/password recovery, and workspace/prospect/contact/package approval/review history/suppression/vault continuity. It does not call any external provider.

Lane A does not change workflow or archive functions in `fns.ts`. Combine Lane B's manual-only/effect safeguards, Lane C's archive implementation and Lane D's general verification repairs before treating this as the completed local release. Do not enter real provider credentials during foundation testing. Linux verification does **not** complete the required Mac launch, owner workflow, provider quality or recovery acceptance.
