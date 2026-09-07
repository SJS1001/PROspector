# Person discovery C4: synthetic runtime/browser acceptance

**Base:** `8b0a95b`
**Scope:** issue #6, C4 only
**Status:** local synthetic acceptance candidate; not Phase 5 completion

## Delivered contract

C4 is a separate browser lane from A0/A1. It applies migrations `0000` through
`0019` to one per-run, project-local, canonical absolute Miniflare state. A
guarded acceptance-only seed creates one disposable Approved Prospect from
explicit current authority ancestry rather than onboarding. Product, play,
profile, Offer, effective configuration, assignment, submission, candidate,
assessment, and owner review all join; neither prospecting nor product discovery
schedules are created.

The person-discovery service exists only when the exact generated C4 binding,
Vite development mode, local-demo identity provider, `LOCAL_DEMO=1`, and loopback
host all agree. It is deterministic, secretless, provider-neutral, and contains
no network primitive. Without that complete conjunction—including A0/A1 and
ordinary or hosted paths—the existing endpoint has no service and remains
reject-only.

Real Chromium exercises `/contacts` directly: select the Approved Prospect,
start discovery, inspect Jordan Synthetic's retained provenance, explicitly
choose Create new person, and record initial email and phone verification intent.
A suggestion remains a distinct candidate row rather than being promoted into a
Contact row, and an intent never creates evidence, eligibility, or a verification
receipt. Two isolated owner contexts race the same immutable decision: one POST
wins, one receives `409`, both refresh to the authoritative result, and neither
retries. A real runtime restart against the same state must hydrate that result.
The same journey checks keyboard/status focus, serious/critical Axe results,
360px reflow, hydration/error overlays, and zero non-loopback browser requests.

## Verification boundary

The post-browser verifier opens persisted SQLite read-only and permits only the
expected synthetic authority and person-discovery rows. It requires exact counts
for the single workspace/company/product/play/Offer/prospect/contact lineage, two
suggestions and provenance rows, one terminal owner decision, and two verification
intents. It independently requires zero schedules, contact point observations,
eligibility snapshots, verification receipts, enrichment grants/reservations/
spend/provider quotes, outreach packages/messages/outbox, exports, R2 objects,
multipart uploads, and all other non-allowlisted nonempty application tables.

This evidence does not select a provider, create a credential, contact a real
person, enable prospecting, export data, send/call, alter hosted state, or satisfy
Phase 5 activation.
