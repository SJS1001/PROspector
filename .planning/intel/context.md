# Synthesized Context Notes

## Initial adversarial contract review

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-2026-07-29.md

Verbatim notes:

> Two independent clean reviews attacked the agreed product/plan before implementation. Both returned `BLOCKED`. This is the ground-truthed disposition, not a dismissal of the reports.
>
> The prior consensus described intent but not schemas, state transitions, job semantics, rubric anchors, exports, or tests. Added `IMPLEMENTATION-SPEC.md` and measurable wave gates.
>
> ADR-0004 is conditional. Wave 0 must prove identity, D1/R2, schedules, runner callback, Gmail OAuth, secrets, observability, and export/restore before sensitive import.
>
> Official regulator guidance makes clear that outreach requirements vary and can include consent, identification, unsubscribe, lawful-basis, and objection handling. ADR-0005 deliberately leaves jurisdictional legal judgment with the operator while enforcing universal product controls.

## Fixture-only implementation convergence

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-IMPLEMENTATION.md

Verbatim notes:

> The implementation red-team loop converged on an honest **fixture-only private pilot**, not a completed operational system.
>
> Until those inputs exist, “complete” means the planning, adversarial consensus, private fixture deployment, and truthful capability report are complete. It does not mean the product roadmap or any Wave gate is complete.
>
> This PASS applies only to the honest, private, synthetic capability-pilot boundary. It does not change the Wave 0 blocked result or authorize live data and external effects.

The recorded external inputs were a controlled Google OAuth account/client, hosted scheduler and Runner callback proof or a host decision, authenticated multi-principal D1/R2 isolation/durability proof, and export/restore recovery drill input.

## Contract hardening after review round 2

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-2.md

Verbatim notes:

> Verdict received: `BLOCKED` from both product and security attackers. All blocker/high claims were checked against the cited artifacts. This file records the resolution before the next clean review.
>
> Outreach Package approval missing | valid | Added canonical package digest, owner review/approval, expiry/revocation/invalidation, Package Review workflow, and mutation tests. Message approval remains separate.
>
> Active configuration rollover undefined | valid | Added impact preview, replacement snapshot activation, schedule rollover, in-flight disposition, requalification, invalidation, pause, and history rules.
>
> Browser CSRF undefined | valid | Added secure session cookie/rotation plus Origin, Fetch Metadata, session-bound token, and foreign-origin tests for every consequential action.
>
> Ambiguous Gmail outcome could duplicate | valid | Added deterministic reconciliation marker, explicit `DeliveryUnknown`, no automatic retry after possible acceptance, and owner resolution.

## Domain correction after review round 3

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-3.md

Verbatim notes:

> Product Market Discovery had no representable configuration | valid | Split Product Discovery Configuration from Profile Effective Configuration. Product configuration has no Play/Profile/Offer dependency; Product changes fan out proposed Profile replacements.
>
> July 24 “25 Candidates” contradicted track mapping | valid | Import now produces 13 Operating Candidate proposals pending identity review, 8 Draft Greenfield proposals/context, and 4 Channel/Multiplier Organization-strategy proposals with no Prospect state.
>
> Below-threshold Qualification had no outcome | valid | Added `NotQualified` and `InsufficientEvidence` outcomes, 90-day default review, Material Signal/configuration reopen, and hard-gate-only `Disqualified`.

## Persistence and lifecycle correction after review round 4

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-4.md

Verbatim notes:

> Historical import had no valid persistence model | valid | Added configuration-independent Import Batch/Item and Identity Proposal records. Import occurs with zero domain Runs/Accounts/Prospects; reviewed items promote only after identity resolution and valid destination activation.
>
> Parent pause/archive contradicted child readiness | valid | Persisted local lifecycle is now separate from derived Effective Availability. Ancestor suspension uses reasoned projections/events and never rewrites child state; action boundaries recompute availability.
>
> Consensus Interview lacked state contract | valid | Added Session/Question/Answer/Recommendation/Confirmation records, optimistic revisions, exactly-one-active-question, transitions, idempotent retry, stale/concurrent conflict handling, resume, and supersession tests.

## Narrow live policy correction after review round 5

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-5.md

Verbatim notes:

> Stale fixture-only boundary | Approved and documented one narrow, low-sensitivity owner-policy exception. Broader Wave 0 remains blocked.
>
> One click fabricated Answer → Confirmation | Added persisted `awaiting_confirmation`; confirmation is a separate owner action.
>
> Idempotency keys were not request-bound | Answer and confirmation store and compare canonical operation digests.
>
> Guessable owner hash | Replaced it with HMAC-SHA-256 using a Sites-only secret.
>
> No scoring consumer, scheduler, research runner, Gmail integration, live lead import, CSV export, or calling function is authorized by this slice.

## Immutable-answer correction after review round 6

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-6.md

Verbatim notes:

> The security re-review returned **CLEAN** with no BLOCKER or HIGH finding. The product re-review returned two HIGH findings, both accepted:
>
> 1. Confirmation was not bound to the exact policy payload reviewed at Answer submission.
> 2. A pre-correction Answer/Confirmation could remain visible as confirmed.
>
> Each new Answer stores a canonical proposal JSON and SHA-256 digest. The Answer operation digest includes that proposal digest. Pending review, Confirmation, Knowledge value, and source digest derive only from the immutable Answer snapshot.
>
> Authenticated hosted lifecycle proof is still pending and is not represented as complete.

## Concurrent legacy restart correction after review round 7

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-7.md

Verbatim notes:

> The final product re-review identified one HIGH concurrency defect: concurrent legacy-review restarts with different idempotency keys could create distinct active sessions. The finding was accepted.
>
> Replacement identity now derives from the immutable legacy Answer, not the request key. A different-key concurrent race test proves both requests converge on exactly one active replacement session and one quarantine audit event.
>
> No BLOCKER remains. Final reviewer convergence is recorded separately from the still-pending authenticated hosted lifecycle proof; that proof is an explicit Wave 0 evidence gap, not a completed claim.

## Owner-identity coexistence correction and hosted proof

- source: /Users/stevensmith/Documents/PROspector/docs/RED-TEAM-TRIAGE-ROUND-8.md

Verbatim notes:

> Security identified one remaining HIGH migration-integrity case: a newer HMAC workspace could coexist with and hide an older SHA workspace whose knowledge still appeared confirmed. The finding was accepted.
>
> Owner resolution now checks both subjects. If both exist, the current workspace wins and the detached legacy workspace is quarantined idempotently.
>
> The product and security re-reviews of the exact version-8 runtime and source both returned **CLEAN**, with no remaining BLOCKER or HIGH finding.
>
> After convergence, the signed-in owner completed the hosted proof. The pending Answer survived reload; a separate confirmation created Knowledge Version `kv_fc242a590384160214f64207` and Audit Event `ae_fc242a590384160214f64207`; and the confirmed state survived another full reload.

## Current Wave 0 capability boundary

- source: /Users/stevensmith/Documents/PROspector/docs/WAVE-0-CAPABILITY-REPORT.md

Verbatim notes:

> Wave 0 is **blocked**, not failed. The private pilot can remain online with one explicitly approved low-sensitivity exception: the owner may submit and then separately confirm the historian data-readiness policy in the Consensus Interview. Real leads, contacts, outreach, schedules, imports, exports, and provider credentials remain prohibited.
>
> Authenticated hosted bindings | Pass | The signed-in capability probe returned authenticated identity headers, D1 `true`, and R2 `true`. D1 executed a hosted query. R2 object write/read/delete durability remains a separate unproven test.
>
> Owner-authenticated hosted D1 lifecycle | Pass | The submitted Answer appeared as awaiting confirmation after a full reload. A separate confirmation produced Knowledge Version `kv_fc242a590384160214f64207` and Audit Event `ae_fc242a590384160214f64207`; both identifiers and the confirmed value remained identical after a second full reload.
>
> Keep the deployed UI owner-only. Only the approved policy decision may be live; every prospecting and outbound surface remains synthetic and disabled.
>
> Do not upload the July 24 operational lead files.

Remaining gate inputs are a controlled Google OAuth client/account, scheduled execution and Runner callback proof or a compatible host, a second real principal for hosted isolation, and an owner-supplied one-time export passphrase for the restore drill.
