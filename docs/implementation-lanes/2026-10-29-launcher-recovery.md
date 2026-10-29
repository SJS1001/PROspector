# Launcher recovery and Anthropic workspace support

The old empty-directory database lock survived a Mac reboot and blocked the
app after it began listening. The lock now uses a SQLite exclusive transaction
held for the lifetime of PGlite. The OS releases it on process death; the lock
file remains in place. Launcher Stop checks ownership instead of file existence.
An older directory lock fails closed; follow the documented one-time recovery
procedure before upgrading an installation that crashed on the old version.

Settings now accepts an optional Anthropic workspace ID and sends it as
`anthropic-workspace-id` only for Anthropic requests. Unrelated settings saves
preserve the ID; explicitly clearing it removes it. Existing key encryption and
data locations are unchanged.

## Verification — 2026-10-29

- Standard operator tests: 271 script tests and 64 source tests passed.
- Production build and TypeScript checks passed; lint had zero errors and the
  three existing warnings.
- Lock tests covered concurrent starts, same-process probes, unsafe files,
  legacy locks, and SIGKILL followed by acquisition without cleanup.
- Three real PGlite archive-recovery tests passed, including SIGKILL and restart
  without removing a lock file.
- Full HTTP durable restart test passed: settings and workspace ID persisted,
  secret ciphertext digest remained equal, and no automatic provider work ran.
- Mocked provider tests verified header inclusion/omission, provider isolation,
  validation, clearing, and actionable error text.
- Installed the updated macOS launcher; its Start and Restart returned running.
  Settings returned HTTP 200 and the new workspace field was inspected in the
  running app. The app was left running.

A complete stopped-data backup was hash-verified before installation. No real
provider request or Mac reboot was performed. The owner's Anthropic workspace
ID must still be supplied before live provider acceptance. This maintenance
work does not change formal phase credit or hosted-environment gates.
