# Local interview progression

**Date:** 2026-09-05
**Status:** local-demo-only candidate
**Authority:** owner-authorized bounded local implementation

## Outcome

The guarded local demo can now continue after an explicit interview decision.
The owner must press **Continue interview**; reload, confirmation, or hierarchy
changes never create another question automatically. The server recomputes a
deterministic queue over the current commercial hierarchy in this order:

1. Company identity; then
2. each Product capability, followed depth-first by that Product's Market
   Plays, Customer Profiles, and Offer decisions; then
3. the next Product subtree.

Every level uses stable `created_at, id` traversal. A current Confirmed
Knowledge Version at the exact scope and kind satisfies a slot. An Accept,
Correct, or Reject decision satisfies it only when joined to the exact
interview answer, question, and confirmation lineage. Unrelated manual reviews
do not count. Rescope does not complete the source slot; any resulting
Confirmed Knowledge belongs only to the selected target. Proposed Knowledge
without a review does not count. The queue is recalculated on every read and
advance, so added hierarchy branches and changed Knowledge are not hidden
behind an earlier snapshot.

## Command and trust boundary

`advance_local_interview` accepts only `idempotencyKey` and
`expectedQueueDigest`. The digest binds the owned workspace and revision,
hierarchy IDs/parents/revisions/order, current confirmed Knowledge, reviewed
slots, selected session/revision/destination, next slot, and exact prerequisite
version digests. Exact replay is resolved against the successful authority
command before the current session is recomposed; changed-payload key reuse
conflicts. The question issuer validates the old and new destinations and uses
the authority-command INSERT as a transaction-local fence. A closed JSON
manifest must exactly match the live workspace revision, hierarchy, current
Confirmed Knowledge, and exact interview decision lineage. Any interleaving
change leaves the command, question, session, and audit untouched.

Only current Confirmed Knowledge on the next scope and its ancestors is bound
as a question prerequisite; sibling Product branches are never causal
authority. Those exact prerequisite IDs and digests are rechecked inside the
final decision transaction. Supersession leaves the decision, Knowledge
Version, Offer, and audit untouched.

The action and queue projection exist only when the server's existing
`isLocalDemoRequest` boundary proves Vite development mode,
`TRUSTED_IDENTITY_PROVIDER=local-demo`, `LOCAL_DEMO=1`, disabled Access mode,
and a loopback request. Mutations additionally retain owner admission,
same-origin/Fetch-Metadata checks, bounded JSON, and one-time CSRF. Hosted,
disabled, outsider, malformed, stale, and cross-origin shapes fail closed.

## Owner-input rule

Generated missing-slot questions contain no evidence claim and no recommended
value. They are marked `requiresOwnerInput`; the UI disables **Use
recommendation** and requires an owner-written value and reason. The repository
also rejects a forged recommendation answer. An Offer is created only when the
later exact `hierarchy_completion_offer` proposal receives an explicit Accept,
Correct, or Rescope decision. Reject advances the queue and creates no Offer.

## Verification

Focused coverage proves stable multi-branch order, confirmed-slot skipping,
Proposed-not-confirmed behavior, rejection advancement, hierarchy/digest drift,
stale zero-write behavior, forged-recommendation rejection, prerequisites,
session transition/race guards, Offer reach/materialization, local-demo route
derivation, outsider/disabled/cross-origin/malformed rejection, reload and
completion, and unchanged forbidden operational rows.

Client validation accepts only the closed local-progression shape, a lowercase
64-character digest, consistent ready/complete counts, an exact next-slot
shape, and explicit owner-input/Knowledge-kind fields. Malformed projections
enter the neutral reload state and expose no mutation control. The Continue
control is exercised for one bounded dispatch, pending disable/loading
behavior, and React escaping of hostile hierarchy names.

This lane adds no provider, research crawler, LLM, hosted target, production
identity, credential, prospecting, schedule, export, email, phone, or outbound
effect. It earns no hosted or formal phase acceptance credit.
