# Local workspace archives

Use Connections → Workspace backup and restore while signed in as the local
workspace owner. The shared `dev-user` fallback cannot export or restore. Archive
actions require a loopback URL and an exact same-origin POST. Configured remote
databases are unsupported and fail closed.

Download a backup before replacing workspace records. Choose a JSON file, review
the replacement notice, check the confirmation and select Restore. Selecting a
file alone does not restore it. Both upload and download are limited to 20 MiB.
Legacy partial exports with a bare `version: 2` are rejected; they never contained
enough data for this restore contract.

## Version 1 completeness contract

The envelope is `format: "prospector-workspace"`, `version: 1`, `sourceOwner`,
`tables` and `checksum`. Every listed collection must be present, even when empty.
Rows contain only the explicit columns in `src/lib/server/archive.ts`, never
`user_id`. SHA-256 covers canonical JSON of every envelope field except checksum.
It detects accidental corruption, not authenticity: someone who can edit the
file can calculate a new checksum. Restore therefore validates its complete
structure, types, enums, embedded JSON, uniqueness and references independently.

| Collections | Included data |
| --- | --- |
| `workspaces`, `knowledge_items` | Company, interview, proposals/confirmed answers and supporting metadata |
| `market_proposals`, `draft_plays` | Market proposals, decisions, reasons and draft/confirmed plays |
| `product_configurations`, `profile_configurations` | Configuration snapshots, digests and activation history |
| `discovery_runs`, `prospecting_runs`, `signals` | Run records, outcomes, retrieved evidence and provenance |
| `prospects`, `review_commands`, `contacts` | Prospect assessments, review decisions/replay history and contact identities |
| `outreach_packages`, `outreach_messages`, `delivery_events` | Copy, exact approval timestamps, message/delivery history and restore audit records |
| `suppressions`, `identity_merges` | Suppression records and historical merged/deleted contact identifiers |
| `operating_state`, `enrichment_grants` | Spend ledger and completed enrichment history; only grants with `spent_at` and a completed provider status are portable |

No authentication users/sessions/accounts/verification values, operator secret
store, environment configuration, vault keys, active provider grants, grant
expiry authority, message leases/tokens or active schedules are exported. The
current schema has no attachment/object store or separate interview-version
ledger: data it never recorded cannot be recovered. Unknown public tables or
new columns in included tables fail closed until the completeness contract is
reviewed. Migration/auth/secret tables are explicitly excluded.

The archive is **unencrypted** and contains company/contact/message data. Store
it privately. This format excludes designated credential stores; it cannot detect
credentials that someone pasted into ordinary notes, evidence or message text.
Credential and owner-access recovery remain separate. A backup does not recreate
sign-in credentials, a vault key or provider configuration on another machine.

## Restore behavior

Restore targets the current server-authenticated owner. Imported owner metadata
is only an ID-remapping input, never access authority. Cross-owner restores
remap row IDs and relationships; established seed IDs retain their local identity
convention. Another owner's records cannot be overwritten by imported IDs.

Validation, collision checks, replacement and safety resets execute on one
PGlite transaction. No clearing happens outside it. SQL errors, thrown failures
and an observed request abort roll back the whole transaction. A lost response
after commit is not proof of rollback; inspect the workspace before retrying.
Crash durability depends on Lane A's durable PGlite storage; this branch does
not alter the original in-memory database bootstrap.

Existing target suppressions are unioned with the archive, never cleared. Existing
contact-specific suppressions with known mailboxes also retain email protection.
Historical merge tombstones remain available. Package approval becomes draft;
sendable/sent/compose-handoff message states become blocked and acknowledgements
are cleared. Original status and acknowledgement are saved as
`archive_restore_package` / `archive_restore_message` delivery audit events.
The package event's `message_id` references its package; other delivery events
reference their message. Original approval/dispatched timestamps remain intact.

The monthly budget becomes zero, active grants are revoked, completed grant
history is restored with no expiry authority, leases are absent and the stored
schedule flag becomes off. Existing credentials remain untouched. The archive
code never calls a provider, sends mail or starts a run. It does not cancel a
provider operation already in progress outside its transaction: restore only
while manual work is idle. No imported approval is permission to send.

## Integration requirements before using this as a recovery release

1. **Lane A:** keep `getPglite()` returning the same durable, migrated instance.
   `archive-db.ts` is an isolated transaction adapter; `db.ts` and its tagged
   `Sql` / `.query()` API are unchanged. It can later delegate to an additive
   `transaction<T>((sql: Sql) => Promise<T>): Promise<T>` API that pins every
   callback query to one connection, serializes local operations and rolls back
   on throw. Never emulate this with pooled `BEGIN`/`COMMIT` calls.
2. **Lane A/B seed integration:** in `ensureWorkspace` in `server/seed.ts`, change
   the interview insert's conflict action to `ON CONFLICT (user_id, question_id)
   DO NOTHING`, or provide an equally explicit versioned metadata migration.
   The baseline currently overwrites question/evidence/inference/sort-order on
   every read. Lane C avoids an immediate post-restore refetch, but reload still
   alters those historical fields until this integration fix lands. Test restore
   → ordinary workspace read → export for metadata equality.
3. **Lane B:** combine only this lane's `exportArchive` / `restoreArchive` blocks
   in `fns.ts` with B's workflow changes. Remove automatic `useTickSchedule`
   dispatch and gate provider work server-side. Baseline `tickSchedule` scans
   inbox/Apollo before checking the schedule flag. Turning the stored flag off
   alone does not prevent those unrelated reload effects.
4. **Lane D:** retain `scripts/archive-regression.test.mjs` in the canonical
   script glob. It runs the actual named TypeScript cases directly. Re-run
   install/build/typecheck/lint/full tests after integrating A/B. Use fictional
   fixtures and stubbed providers only.

Focused commands, from `operator/`:

```sh
node --experimental-strip-types src/lib/server/archive-request.test.ts
node --experimental-strip-types src/lib/server/archive.test.ts
node --test scripts/archive-regression.test.mjs
```

The implementation log records actual results. Authenticated browser/server
acceptance, hard process-kill recovery on durable storage, Mac/owner recovery
drills and real-provider acceptance are not established by source review or
authored tests.
