# Cloud outreach persistence lane

- Branch: `codex/cloud-outreach-persistence`
- Base: `38d86681cd7a8e9f5be70b56365d9be2a786f0ad` (`origin/main` at implementation start)
- Scope: disposable-D1, provider-neutral outreach persistence candidate only; no runtime composition or operational activation.

## Files

- `site/db/schema.ts`
- `site/drizzle/0010_governed_outreach.sql`
- `site/drizzle/0012_governed_outreach_outbox.sql`
- `site/drizzle/0013_governed_outreach_lease.sql`
- `site/drizzle/0014_governed-outreach-authority.sql`
- `site/drizzle/0015_governed-outreach-pre-call.sql`
- `site/drizzle/0016_governed-outreach-attempt-preparation.sql`
- `site/drizzle/meta/0010_snapshot.json`
- `site/drizzle/meta/0012_snapshot.json`
- `site/drizzle/meta/0013_snapshot.json`
- `site/drizzle/meta/0014_snapshot.json`
- `site/drizzle/meta/0015_snapshot.json`
- `site/drizzle/meta/0016_snapshot.json`
- `site/drizzle/meta/_journal.json` (explicit candidate entries)
- `site/domain/outreach-repository.ts`
- `site/domain/outbox.ts`
- `site/tests/helpers/outreach-fixture.mjs`
- `site/tests/outreach-persistence.test.mjs`
- `docs/implementation-lanes/cloud-outreach-persistence.md`

Existing 0000–0009 migration and snapshot bytes are unchanged.

## Focused validation

- Original recovery: `cd site && node --test tests/outreach-persistence.test.mjs` — 6 passed, 0 failed.
- Review closure: `cd site && node --test tests/outreach-persistence.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs` — 16 passed, 0 failed (15 outreach tests and one source-only importer check).
- The two later-version parent-fence tests also passed as a focused 2/2 run; the observed-candidate positive approval test passed independently.
- `cd site && ./node_modules/.bin/eslint domain/outreach-repository.ts tests/outreach-persistence.test.mjs tests/helpers/outreach-fixture.mjs` — passed.
- `git diff --check` — passed.
- Outbox/lease candidate: `cd site && node --test tests/outreach-persistence.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs` — 24 passed, 0 failed after the final additive lease edits.
- `cd site && npx eslint domain/outbox.ts db/schema.ts tests/outreach-persistence.test.mjs tests/helpers/outreach-fixture.mjs` — passed.
- Delivery-authority closure: `cd site && node --test tests/outreach-persistence.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs` — 33 passed, 0 failed. The disposable fixture applies the real 0010→0011→0012→0013→0014 chain.
- `cd site && npx eslint domain/outreach-repository.ts domain/outbox.ts db/schema.ts tests/helpers/outreach-fixture.mjs tests/outreach-persistence.test.mjs` and `git diff --check` — passed after the final authority changes.
- Pre-call recheck candidate: `cd site && node --test tests/outreach-persistence.test.mjs tests/migration-cloudflare-importer-compatibility.test.mjs` — **41 passed, 0 failed** on the final exact diff. Coverage includes the positive path, exact replay/contention, hostile input, forged stored digests, stale lease generations, exact expiry, wrong owner/holder, populated-0014 unsafe ancestry, all bound source/Claim Guardrail invalidation, both approval revocations, stop/suppression, unsubscribe/sender rotation, later Message/Package versions, newer eligibility, profile/play/product/company lifecycle changes, zero effects, and importer compatibility. Touched lint, migration metadata JSON, and `git diff --check` passed. Final independent security and test reviews returned GO with no remaining high/medium blocker for this bounded inert candidate.
- Inert attempt-preparation candidate: the same focused command passed **45 passed, 0 failed** after additive 0016. Coverage adds populated-0015 upgrade without backfill, exact/concurrent preparation and replay, clock rollback, expiry, wrong owner/holder/generation/receipt and hostile input, zero-row rejection after post-receipt source/Claim Guardrail/suppression changes, forged stored preparation digests, immutable rows, absence of premature future event kinds, blocked raw `Dispatching`, and blocked lease recovery after preparation. Touched lint, migration metadata JSON, and `git diff --check` passed. Final independent schema and security/privacy re-reviews returned GO with no high or medium finding. Canonical preflight and the full suite remain intentionally unused under the lane hold.

## Limitations and deferred surface

- This is code-only candidate work, not Phase 06-02 acceptance and not a hosted validation claim.
- No provider adapter/call, dispatch worker, runtime handler/route, schedule, credential, real prospect data, or external export is present.
- Additive candidate migration 0012 and the provider-neutral repository atomically consume one exact current Message approval and append one immutable Pending outbox item/event. Exact replay returns that item without another write.
- Additive migration 0013 preserves the committed 0012 bytes and evolves only the event trigger. The repository can reserve a short, exclusive lease after the scheduled time; two simultaneous holders produce one winner, same-holder replay appends nothing, expired lease recovery increments generation, backdated/stale-holder transitions fail, and lease expiry cannot exceed either immutable approval. Every result explicitly denies provider invocation and the seam exposes no dispatch or finalization method.
- Sender connection rows are append-only metadata snapshots. Additive 0014 requires the exact two configured Gmail scopes and a deterministic, immutable verified-address manifest. Canonical and exact send-as alias addresses are permitted only when sealed into that manifest; values are opaque `vault-ref:` references, never credentials. No code in this lane creates a real connection.
- Enqueue/claim resolve Company, Contact, exact selected email, and preserved alias scope; unrelated exact-email suppression/stop state does not block another Contact. Organization and confirmed-domain scope remain fail-closed until their authoritative equivalence resolver exists.
- Additive 0014 records immutable recipient jurisdiction/claimed-basis acknowledgements, Package-bound current source evidence, attested contact-freshness caps, working-unsubscribe checks, sender capability/address evidence, and approval revocations. Enqueue, new leases, and same-holder replay fail closed when those authorities or current lifecycle/suppression/stop/drift state change. Generic unsubscribe history deliberately cannot record `redeemed`; atomic redemption plus durable suppression remains later work.
- Additive 0015 persists one immutable, exact-lease pre-call **recheck receipt** only after its transaction-local trigger rechecks the current approvals, artifact lineage, every bound source and Claim Guardrail, recipient/contact freshness, eligibility, sender/scopes/address, unsubscribe, lifecycle, drift, suppression, stop, and fence tuple. The receipt is capped to the earliest authority expiry, stores identifiers plus a repository-recomputed digest of its referenced material rather than message/address/credential material, and always records `provider_invocation_authorized=0`. The database trigger independently certifies current relational and absence predicates at insertion; the digest is not a bearer capability or a substitute for that check. Exact replay is read-only, revalidates both current authority and canonical digests, and a competing creator can produce only one row.
- Migration 0015 also closes the prior raw `Leased → Dispatching` and terminal-event transition path. Receipt creation leaves the item `Leased`; it is audit evidence, not a bearer capability. Sequential provider-attempt evidence, a fresh post-receipt recheck, evidence-gated transitions, DeliveryUnknown reconciliation, and atomic unsubscribe redemption remain required before any MailPort composition or terminal-state writer.
- Additive 0016 records one complete immutable `prepared_no_invocation` preparation for the exact current 0015 receipt. The single row contains the stable attempt identity plus receipt/lease fence, every transaction-local authority predicate is rechecked at insertion, and repository replay recomputes its canonical digest. The row permanently records zero provider authority and zero provider calls, and the outbox remains `Leased`. Once it exists, an additional database trigger blocks lease recovery; a separately reviewed append-only abandon/reprepare contract is required before recovery can be enabled. Future provider/outcome event kinds are intentionally absent rather than prematurely encoded. This is a fail-closed limitation, not evidence of a provider attempt.
- Canonical preflight, full `npm test`, build, deployment, hosted migration application, and CI validation remain pending under the lane hold.

## Independent-review closure

- Repository scope and all command/lookup inputs are closed, deeply captured
  before admission or hashing awaits. Accessors, sparse arrays, symbol/extra
  fields and cyclic/oversized structures fail closed. Later caller mutation
  cannot change the stored snapshot, artifact digest, bindings, acknowledgement,
  suppression or admitted workspace. Operation identities include workspace.
- Artifact binding triggers require the exact configuration, current assessment,
  approved review, candidate run/submission source lineage, Profile guardrail,
  selected verified Contact observation and eligibility snapshot. Message
  bindings must match the row's exact Package version, not another version in
  the workspace. Audit completion requires the complete binding set and seals
  it against later appends.
- Every later-version insert also checks its immutable root inside the same
  transaction: a Message's caller-supplied Package ID must equal its stored
  parent, and a Package's caller-supplied Prospect/Contact/Profile tuple must
  equal its stored root. Mismatches roll back command, bindings and audit rather
  than persisting a digest that names different ancestry. Valid version-two
  writes and exact replay retain the original parent.
- Both approval kinds recheck current approved Prospect and Passed assessment,
  observed/qualified candidate ancestry, active configuration and exact revisions,
  Company/Product/Play/Profile availability, latest eligibility/review/artifacts,
  source availability, guardrail/drift state, receipt-backed selected Contact
  evidence and exact freshness expiry. These checks execute as migration
  triggers in the same D1 batch as command, approval and audit, so a configuration
  change or suppression committed immediately before the batch wins.
- The freshness bounds are the existing durable Phase 5 defaults: 30 days for
  mailbox-verified email and 90 days for source-verified email/business phone.
  Approval creation is implemented; a later revocation/history projection and
  activation capability remain separate work.
- The suppression reader validates kind/channel pairs and uses a single
  recursive database read over the same-kind, channel-compatible alias union.
  Approval compares selected persisted contact-point digests and the Contact's
  existing identity digest, including tombstone aliases. An unrelated exact
  email prohibition does not block another Contact.
- Company suppression applies to the workspace's single Company; the existing
  `companies_workspace_unique` unique index is asserted by the focused suite.
  The schema has no authoritative Organization/domain-equivalence resolver.
  Any such unresolved tombstone returns the explicit
  `outreach_repository_conflict:unresolved_suppression_scope` error for approval.
  This is a missing-resolution block, not a claim that the unrelated subject
  matched. An exact typed resolver is still required before runtime composition.
- D1's expression-depth limit is preserved: current-authority predicates are
  split into bounded statements in the same atomic trigger, and the nested
  contact check directly rejects invalid selected points. No predicate or
  test was weakened to bypass the limit.

## Candidate migration / release hold

Migrations 0010–0016 remain unaccepted candidates. The original 0000–0009 SQL,
snapshots and accepted manifest/evidence are untouched. Existing authority
fixtures still apply exactly 0000–0009; this lane's disposable helper then
applies the real candidate chain 0010–0016 in order, including independently
owned 0011. Journal assertions
select entries explicitly; no candidate changes accepted migration evidence.

The unchanged target verifier requires the exact accepted ten-file migration
inventory, so the additional 0010 intentionally produces
`migration_manifest_mismatch` at that boundary. This is a blocked release
readiness condition, not a local implementation failure. No target verifier
change, migration relocation, accepted-manifest rewrite, preflight, hosted
migration or activation was performed. Future release requires separate,
exact candidate acceptance; local tests do not supply that authority.
