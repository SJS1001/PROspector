# Offer and readiness workflow implementation lane

**Date:** 2026-09-06  
**Work unit:** B / issue #9  
**Base:** `165c6c7c8c8553863f24ad4e1d342d1d8cfdf8b8`

## Implemented contract

- The deterministic local interview queue now asks the complete readiness-bearing sequence: Company identity; all nine Product readiness categories; six Market Play categories; all eleven distinct Profile knowledge kinds needed by the twelve Profile readiness checks; then the Profile-scoped Offer question.
- Every generated local question remains owner-input-only, carries no recommendation, and now projects an explicit `missing` or `present` evidence state with an exact finding count. Missing evidence is rendered as an owner-input requirement and cannot become silent confirmation.
- Existing immutable review lineage remains the continuation fence: Accept, Reject, and Correct complete exactly the reviewed source slot; Rescope confirms only its explicit target and leaves the source slot pending. Queue digest, hierarchy/current-Knowledge/review fences, separate answer and confirmation, idempotent winner reads, and stale/race rejection remain unchanged.
- An explored proposal now exposes a direct supported-screen handoff to its Draft Market Play interview. The handoff grants no readiness, prospecting, provider, schedule execution, or outbound authority.
- Accepting or correcting the exact final Offer snapshot creates the Offer from the confirmed value and its existing question/answer/proposal/decision/Knowledge/command/audit lineage. In the same guarded batch it accepts the parent Draft Market Play for the already-existing Profile, enabling the existing Profile readiness evaluator to recognize the Play only after the full reviewed sequence. Reject creates neither Offer nor accepted Play.
- Product and Profile candidate/activation controls remain the existing server-authoritative supported screens. The queue now supplies their required confirmed Knowledge kinds without adding a migration or any external adapter.

## Boundary

This lane changes no schema, browser-test infrastructure, provider composition, credentials, identity data, prospecting execution, export, email, call, hosted target, or outbound effect. All generated questions and tests use synthetic local-only values. External execution remains fail closed.

## Validation

- Focused ESLint over every changed TypeScript, TSX, and test file: pass.
- Repository-wide `npm run lint`: recorded at the implementation commit.
- `git diff --check`: pass.
- Canonical preflight and the Miniflare/Cloudflare-backed focused suites were not run in this lane; the transfer withholds canonical preflight, and the execution environment rejected the attempted focused command because it would cross the explicitly prohibited Cloudflare boundary.

## Integration order

Integrate after the supplied onboarding/A checkpoint. Work unit C may follow because this lane owns no migration. Work unit D must integrate only after both B and C.
