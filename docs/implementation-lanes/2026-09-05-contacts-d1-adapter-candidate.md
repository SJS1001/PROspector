# Contacts D1 command-service candidate

Date: 2026-09-05

## Scope

This local-only candidate composes the existing Contacts command-service seam with the existing D1 enrichment and identity repositories. It is intentionally not imported by the production route. The production boundary remains reject-only unless a later composition supplies independently verified Phase 4 acceptance, controlled-enrichment activation, and the separate run/split predicates.

The adapter accepts only server-derived workspace and principal context plus the handler's closed commands. It does not accept provider configuration, credentials, operation keys, budget authority, assignments, contact values, source locators, candidate sets, or partition material from the browser.

## Enrichment behavior

- Grant creation reads the sole current approved prospect and compares its authoritative prospect revision with the browser concurrency value.
- The issuance call receives the authoritative workspace snapshot revision, not the browser prospect revision.
- Operation, maximum unit count, price ceiling, currency, provider descriptor, and expiry come from current persisted authority. Expiry is the immutable quote expiry, avoiding replay drift from a newly calculated TTL.
- A provider port must carry the exact server-only binding brand and persisted descriptor before reservation. An absent or mismatched port makes no reservation, event, budget, or provider call.
- A matching provider can run only after the existing reservation authority validates all four budget accounts and an evidence assignment. The adapter does not create or repair those prerequisites.
- The returned operation result is derived from a re-read terminal D1 event whose acknowledgement digest is independently recomputed. Timeout or ambiguity returns `reconciliation_required`; there is no automatic retry.

## Identity behavior

The adapter resolves an owner/workspace-scoped persisted suggestion and derives its subject kind. Merge secondaries are the sorted persisted candidates other than the explicitly selected primary. Split source, moved associations, and destination identity come only from the persisted proposed partition. The existing identity domain and D1 transaction enforce revisions, idempotency, suppression preservation, association invalidation, uniqueness, and replay.

Unbound suppression data, zero-impact suggestions, stale revisions, scope mismatches, and uniqueness/transaction failures remain blocked or conflicting. No internal candidate, association, lineage, or partition material is returned.

## Deliberate limitations

- This is not production composition and performs no hosted or external activation.
- Phase 4 acceptance and controlled-enrichment activation remain mandatory handler gates.
- Stage 2 also needs separately provisioned evidence assignments and all four budget accounts; this adapter never forges them.
- The UI's complete immutable grant-authority display and identity impact display remain separate approval work, so run and split stay default-denied there.
- No real provider, contact, prospecting, export, email, telephone, credential, or hosted effect is enabled.
- This candidate does not complete Plan 05-07 and earns no `05-07-SUMMARY.md` or phase credit.
