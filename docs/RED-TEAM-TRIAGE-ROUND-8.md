# Red-Team Triage — Round 8

Date: 2026-07-29

Target: application commit `ebdf08a`, private Sites version 8, exact source
`8af82949ad7b9a064836477cf656eea94bab9392`.

Security identified one remaining HIGH migration-integrity case: a newer HMAC
workspace could coexist with and hide an older SHA workspace whose knowledge
still appeared confirmed. The finding was accepted.

Owner resolution now checks both subjects. If both exist, the current workspace
wins and the detached legacy workspace is quarantined idempotently. Unbound
derived knowledge is superseded, its sessions and questions are retired, one
audit event is appended, and historical Answers and Confirmations are preserved.
The test constructs both workspaces and issues concurrent reads, then proves the
legacy knowledge is superseded, its session archived, the current decision still
authoritative, and only one quarantine audit exists.

Build, lint, the five-test suite, React Doctor 100/100, and private version 8
deployment all pass. Authenticated hosted lifecycle proof remains pending and
is not claimed complete.
