# Offer and readiness workflow implementation lane

**Date:** 2026-09-06
**Work unit:** B / issue #9
**Base:** `165c6c7c8c8553863f24ad4e1d342d1d8cfdf8b8`

## Implemented contract

- The deterministic local interview queue now asks the complete readiness-bearing sequence: Company identity; all nine Product readiness categories; six Market Play categories; all eleven distinct Profile knowledge kinds needed by the twelve Profile readiness checks; then the Profile-scoped Offer question.
- Every generated local question remains owner-input-only, carries no recommendation, and now projects an explicit `missing` or `present` evidence state with an exact finding count. Missing evidence is rendered as an owner-input requirement and cannot become silent confirmation.
- Existing immutable review lineage remains the continuation fence: Accept, Reject, and Correct complete exactly the reviewed source slot; Rescope confirms only its explicit target and leaves the source slot pending. Queue digest, hierarchy/current-Knowledge/review fences, separate answer and confirmation, idempotent winner reads, and stale/race rejection remain unchanged.
- An explored proposal now exposes a direct supported-screen handoff to its Draft Market Play interview. The handoff grants no readiness, prospecting, provider, schedule execution, or outbound authority.
- That handoff carries the exact stored interview session, Draft Market Play, and source proposal-version identifiers. The server revalidates the complete tuple against the immutable Explore decision before reading or advancing it; a newer competing open session and a tampered URL cannot redirect the owner.
- Both supported handler paths preserve that selection through generalized answer and confirmation mutations. The question/answer session is fenced to the selected session before any domain write and again inside the confirmation authority transaction; legacy answer/confirmation commands are rejected while a selected Explore tuple is present.
- Accepting or correcting the exact final Offer snapshot creates the Offer from the confirmed value and its existing question/answer/proposal/decision/Knowledge/command/audit lineage. In the same guarded batch it accepts the parent Draft Market Play for the already-existing Profile, enabling the existing Profile readiness evaluator to recognize the Play only after the full reviewed sequence. Reject creates neither Offer nor accepted Play.
- Offer confirmation also binds the exact parent Market Play revision and lifecycle in the transaction's first authority guard. A stale or missing parent makes the entire batch fail, leaving no Offer, Knowledge Version, decision, command, audit, confirmation, question/session close, or lifecycle partial write. A later Offer under an already-active Play binds that exact active revision without attempting a second lifecycle transition.
- Product and Profile candidate/activation controls remain the existing server-authoritative supported screens. The queue now supplies their required confirmed Knowledge kinds without adding a migration or any external adapter.

## Boundary

This lane changes no schema, browser-test infrastructure, provider composition, credentials, identity data, prospecting execution, export, email, call, hosted target, or outbound effect. All generated questions and tests use synthetic local-only values. External execution remains fail closed.

## Validation

- Focused ESLint over every changed TypeScript, TSX, and test file: pass.
- `git diff --check`: pass.
- Focused local Miniflare/Vite authority, HTTP, and UI suites: pass. These fixtures used loopback only and invoked no external provider.
- Canonical preflight and broad repository validation were intentionally not run in this correction lane.

## Integration order

Integrate after the supplied onboarding/A checkpoint. Work unit C may follow because this lane owns no migration. Work unit D must integrate only after both B and C.
