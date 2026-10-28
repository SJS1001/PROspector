# App launcher and final local setup — 2026-10-28

The owner accepted personal local use by instruction and authorized a macOS menu bar launcher plus final GitHub integration. No additional owner acceptance walkthrough is required.

## Delivered

- Native **App launcher** uses OPUS Master Control's dark material, mint accents and compact panel styling. OPUS itself is unchanged.
- One click starts the built PROspector frontend/backend together and opens the browser. Open reuses a running instance; Stop and Restart use graceful termination of the registered service only.
- Launcher opens at login; backend starts on demand. Details contains logs, backups and help. Quitting the launcher leaves the backend running.
- Installer registers per-user launch agents and installs an ad-hoc signed app in `~/Applications`. No admin access or distribution signing is needed for this personal installation.
- Existing workspace, owner and vault remain in the private user-data directory. A complete stopped-data backup was made before switching process management; all 1,098 file hashes matched. This private backup stays outside Git.

See [daily use, updates and recovery](../../operator/launcher/README.md).

## Verification

- Full `npm test`: **267 script + 64 source tests passed**, zero failures. Includes nine new controller cases covering idempotent startup, foreign-port ownership, ordered graceful restart, missing build/registration, startup failure, readiness, stale lock and stop timeout. No forced kill or automatic lock removal.
- `npm run lint`: zero errors, three existing unused-symbol warnings.
- Optimized native Swift compilation, ad-hoc signing and installation passed on the owner's arm64 Mac.
- Actual installed helper start/stop passed. Native UI Start, Stop, Restart and Open passed; Restart replaced the loopback server process, while Open preserved its PID. Expanded Details and compact panel were visually checked without clipped controls. HTTP root returned 200.
- Existing application source and production bundle are unchanged by this launcher work. Earlier application build/typecheck, keyboard/reflow/recovery and browser workflow evidence remains scoped to the source recorded in the integration handoff. This turn did not repeat the full browser workflow suite.
- `git diff --check` passed. Scope from main is `docs/` and `operator/`; hosted `site/` and workflow settings are unchanged.

Login startup is registered but a physical logout/reboot was not performed. The backup was verified byte-for-byte; this turn did not restore over the owner's data. Full data restore and fictional workflow recovery have earlier automated evidence. Live provider result quality, provenance and cost remain unmeasured and optional; no provider calls, email delivery or hosted deployment were performed for this setup.

## GitHub integration

PR [#131](https://github.com/SJS1001/PROspector/pull/131) is the consolidated local release. Its target is `main`, which is an ancestor of this candidate. This incorporates the local app without altering the hosted application. The final merge commit and post-merge checkout comparison are recorded in the external handoff and completion response, avoiding a self-referential commit claim.

## Remaining owner action

Use **App launcher → Start PROspector** (or Open when already running). Before choosing live research, privately configure any missing provider credentials in Settings and decide your own usage limits. Keep the private data backup covered by your normal encrypted backup system. No further acceptance drill is required.
