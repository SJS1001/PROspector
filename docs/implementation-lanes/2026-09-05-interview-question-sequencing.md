# Interview question sequencing foundation

**Date:** 2026-09-05
**Status:** local-only candidate; not runtime-composed
**Authority:** owner-authorized bounded implementation work

## Outcome

The repository now has an internal-only question-authoring boundary that can
activate a trusted structured question on an existing owned interview session.
It closes the gap between an Explore-created Draft Market Play interview and
the existing answer/decision state machine, and it permits a completed session
to receive a later question without hiding that question behind historical
confirmation state.

The issuer is intentionally absent from HTTP routes and UI. It accepts only a
closed `consensus-interview-question/v1` candidate, validates the exact current
Company, Product, Market Play, Customer Profile, or Offer destination, and
requires every supplied prerequisite ID/digest to identify the current
Confirmed Knowledge version. It binds the canonical candidate, session, and
expected session revision into an `authority_commands` operation digest.
Question insertion, session reactivation, and the audit append execute in one
D1 batch and converge through exact idempotency-key/digest comparison.
The authority anchor also rejects issuance while any other workspace session
has a decision-bearing question, so concurrent issuers converge on one live
question. Prerequisites are capped at 29: the command remains below D1's
100-bound-parameter ceiling, and a thirtieth prerequisite fails closed.

Normal answer submission now derives its destination, Knowledge kind, and
recommended value from the stored question/session snapshot. A caller can no
longer replace that destination during a normal answer. The existing explicit
`change_scope` action remains the only Stage 1 rescope path. A live internally
issued question is projected before older confirmation history, preserving the
existing single-question UI contract while allowing Q1 → Q2 sequencing.

## Verification contract

Focused tests cover:

- Q1 answer and decision followed by Q2 issue, reload, and answer;
- an actual `decideMarketPlayProposal(..., decision: "explore")` session;
- all five exact commercial destination types;
- wrong owner/workspace, wrong destination, stale session revision, stale or
  mismatched prerequisite, malformed closed candidate, changed-payload key
  reuse, exact replay, and competing issuance races;
- distinct-session races with exactly one workspace-wide live winner and the
  portable D1 prerequisite ceiling;
- preservation of the operational/provider/outbound row snapshot.

The required validation for this candidate is the two new focused test files,
the directly affected interview/Knowledge repository and handler tests,
targeted ESLint, and `git diff --check`. It intentionally does not run the full
or preflight lane.

## Boundaries retained

- No route, UI command, provider, LLM, crawler, runtime composition, schedule,
  prospecting, enrichment, export, email, phone, or outbound effect is added.
- No migration or hosted state is changed.
- The candidate creates no Phase 2–7 plan summary and earns no phase or hosted
  acceptance credit.
- A future server-side question source/composer and explicit runtime wiring
  remain separate reviewed work.
