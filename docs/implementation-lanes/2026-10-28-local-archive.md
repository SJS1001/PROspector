# Lane C — local workspace backup and restore

## Source and ownership

- Owner-authorized local app work only, `operator/`; no hosted target accessed.
- Source: `operator-os`, PR #125, `2d476b9d2e6bc37f1352444dd95de58b5537f798`.
- Fix branch: `codex/local-archive-transactional`, target `operator-os`.
- GitHub connector verified PR #125 head matched the expected SHA on 2026-10-28. Shell `git fetch origin` failed (exit 128: runtime proxy port 8080 unavailable). Retrieved source through the GitHub connector and reconstructed Git objects, verifying every retrieved blob, complete source tree `6efc6976c206a996b278f2481e393f2cdc28f379`, and exact source commit SHA before branching. This initial connector fallback was followed by successful `git fetch origin`, explicit fetch of operator-os/checklist refs, `git ls-remote`, and `git fetch --refetch origin operator-os` with broader execution permissions. Source still matched exactly; full Git ancestry was fetched before commit.
- Checklist read from `codex/local-completion-checklist:docs/LOCAL-APP-TASKS.md`, blob `2be1c441019579981ab675427a3113735ae17f43`; source branch was not replaced. The checklist names backup LOCAL-04 and verification LOCAL-05.
- Scope: new archive modules/tests, only `exportArchive` / `restoreArchive` in `fns.ts`, archive UI/hook and focused documentation. No `db.ts`, auth, schema/migration, workflow, CSV or CI changes.
- Read AGENTS and continuation, greenfield baseline, state/roadmap, active Phase 2 activation/reviews, 02-22/02-99 and dependency summary, LOCAL_DEMO composition and CI policy. Current owner authorization controls this local-app lane; hosted plan acceptance remains unchanged.

## Action log

1. Inspected runtime network policy (enforced restricted HTTP; no VPN), source and current archive implementation. Node `v24.19.0` meets minimum 22.13.
2. Found export uses a partial read-model snapshot and restore updates interview answers only; no complete restore, reference validation or atomic replacement exists.
3. Delegated new archive modules/tests to requested `gpt-6.1-terra` / high reasoning because the implementation handles data safety. Delegated independent adversarial review to requested `gpt-6-astra` / high reasoning. Tool configuration exposes requested models/effort; no independent effective-model telemetry is exposed. Parent effective model is not exposed. These are two scoped sub-agents, not other session lanes.
4. Dependency attempts: default-cache offline `npm ci` exited 1 (ENOTCACHED); bounded online install with workspace cache exited 1 (npm exit-handler failure while proxy unavailable). Correct-cache offline attempt also exited 1 (ENOTCACHED). These attempts are superseded: sandbox network/subprocess restrictions were resolved with approved broader execution permissions, and `npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000 --cache /workspace/.npm` completed exit 0, installing 479 packages in 18 seconds. No lockfile change.

5. Implemented 19-collection complete portable archive, explicit exclusions, checksum and full pre-mutation validation, owner remapping/collision checks, suppression union, completed enrichment ledger and one pinned PGlite transaction. No db.ts/schema edits.
6. Added local-only authenticated exact-origin POST checks, staged file selection/confirmation and stale-file-read protection. Export and restore no longer call the mutating workspace read model. Restore does not automatically refetch it.
7. Independent stronger-reasoning review found and closed lost approval classification, incomplete spent history, relationship/collision validation, invalid PostgreSQL text/timestamps and async file selection race. Original statuses/acknowledgement now survive in restore audit events. Source fixes passed real database regressions.

## Final verification evidence

Environment: approved Codex cloud Linux execution, Node v24.19.0, fictional in-memory PGlite databases only. Broader execution permissions were needed for configured-proxy network and Node child processes; initial sandbox errors are not counted as application failures or passes.

| Command (from operator/) | Actual result |
| --- | --- |
| Lockfile npm ci command above | Exit 0; 479 packages installed; package-lock unchanged |
| `node --experimental-strip-types src/lib/server/archive-request.test.ts` | Exit 0; 5 named cases passed / 0 failed |
| `node --experimental-strip-types src/lib/server/archive.test.ts` | Exit 0; 11 named PGlite cases passed / 0 failed |
| `npm run build` | Exit 0; client/server bundles built; no DATABASE_URL, migration script safely skipped remote DB |
| `npm run typecheck` | Exit 0 after correcting two test query type annotations |
| Focused eslint on archive modules/tests, archive panel and archive launcher | Exit 0; no findings |
| `npm test` | Exit 1; 197 script tests, 179 passed / 18 failed; both added archive wrappers passed. Script failures prevent chained domain stage |
| Separate exact domain/auth/retrieval command from package.json | Exit 0; 64 passed / 0 failed, 16 suites |
| `npm run lint` | Exit 1; one pre-existing no-empty error in app-data/client.server.ts:281 and six pre-existing warnings |
| `git diff --check` | Exit 0 |

The full command's 18 failures are the baseline template/metadata/skill/auth fixtures: missing .grok skill/assets/app-env and the old migration-path assertion. None was deleted, skipped or weakened. The archive launcher contributes two passing script cases; its children execute 5 request cases and 11 real database cases (do not double-count those as 16 extra top-level script cases). Initial sandboxed `node --test` output only reported file-level results; only the later permission-enabled full results above count as canonical evidence.

Database cases cover every included table into an empty second database; full relational equivalence subject to explicit safety normalization; all-table cross-owner references; retained suppressions and unaffected other-owner data; credential/active-grant/lease exclusions; historical spent grants; malformed/version/checksum/schema/JSON/enum/reference/Unicode/timestamp rejection before deletion; injected exceptions; abort before mutation, after deletion and during/after insertion; concurrent restore serialization; and history retained through repeated export/restore. Tests and archive modules invoke no provider or sending ports. They do not prove cancellation of pre-existing provider work.

## Independent review disposition

Requested reviewer: gpt-6-astra / high; source and actual evidence reviewed independently. No unresolved high/medium finding in the scoped archive implementation. Reviewer independently confirmed focused lint exit 0; parent ran full verification. This is code and synthetic local runtime evidence, not owner, Mac, real-principal/browser or provider acceptance.

## Required integration and remaining limitations

See operator/ARCHIVES.md for the precise format, exclusions and recovery runbook.

- **A transaction/storage:** keep the same migrated PGlite instance or adapt archive-db.ts to additive `transaction<T>((sql: Sql) => Promise<T>): Promise<T>`. All callback queries must use one connection; rollback on throw; preserve existing tag/query API. Remote DB fails closed. Durable restart/process-kill proof depends on A and was not performed here.
- **A/B seed metadata:** baseline `ensureWorkspace` overwrites historical question/evidence/inference/sort-order on each normal read. Replace that conflict-update with `ON CONFLICT (user_id, question_id) DO NOTHING` (or explicit versioned metadata migration). This lane avoids immediate post-restore refetch but ordinary reload still needs that fix. Verify restore → getWorkspace → export equality after integration.
- **B manual effects:** baseline shell auto-invokes tickSchedule; that function reads inbox/Apollo before checking scheduleEnabled. Remove automatic dispatch and preserve server-side manual gates. Disabling the stored schedule flag in this transaction does not repair B's broader mount behavior.
- **Combine fns.ts patches:** take only exportArchive and restoreArchive blocks plus removal of their unused INTERVIEW import from this lane, preserving all B-owned function boundaries. This lane also changes only the archive hook in workspace.ts and archive UI in settings-view.tsx; preserve B's CSV/workflow/connection edits.
- **D verification:** retain archive-regression.test.mjs in the canonical scripts glob; repair the existing 18 harness/fixture failures and one lint error in D's lane, then re-run complete commands on the combined head.
- JSON is unencrypted, capped at 20 MiB, and has no authenticity signature. Designated secrets/auth/active grants/schedules are excluded; arbitrary secret text pasted into user notes cannot be detected automatically. Legacy partial v2 snapshots cannot be upgraded into complete backups.
- Real authenticated browser/owner isolation, owner/Mac recovery acceptance, crash recovery on A's durable storage and real provider quality remain unperformed. LOCAL-05 is not globally complete while the full test/lint commands fail. Hosted plan credit is unchanged.

No actual SMTP delivery, paid reveal/provider spending, deployment, merge, repository settings, secrets changes, hosted provisioning, original Sites access, automation or reminder occurred. Stop after the draft PR is open and these results are recorded; no CI polling is required.

## Exact final checkpoint

- Final direct PGlite rerun after source/type/lint corrections: exit 0, 11/11, 44.93 seconds. Final build rerun: exit 0. CI runner policy verifier: exit 0; no GitHub-hosted jobs found; no workflow changed.
- SHA-256 of the staged `git diff --cached -- operator` at verification checkpoint: `18276e4b92e58ac94cae2606444a815360741a021390bbcc82c5427c429d946a`. The commit containing this log binds that reviewed diff and source base.
- Separate domain stage executed exactly: `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts src/lib/domain/qualify.test.ts src/lib/server/retrieve.test.ts`.
- Operator build assets were generated locally only and kept out of the commit. Scratch/logs remain outside the repository; the commands, counts, outcomes, review and integration limits above are the portable handoff.
