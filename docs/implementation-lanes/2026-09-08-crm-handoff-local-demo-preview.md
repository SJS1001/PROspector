# CRM handoff seam and local-demo preview — implementation note

**Date:** 2026-09-08
**Base:** `origin/main` at `fcf5b9ea` (PR #60 merged)
**Branch:** `claude/issue11-csv-handoff-contract`

## Authority

Two separate grants, recorded here because the second amends a checked plan.

1. **Pure contract (already authorized).** The CSV owner was assigned the pure
   domain handoff decision and row projection, its focused test, and this note —
   explicitly zero-effect, with no CSV bytes, no `preparation/` import, and no
   route, UI, binding, or persistence.

2. **Narrow plan amendment (owner-authorized 2026-09-08).** Explicit owner
   authorization was received through root
   `01a076dc-f024-7693-afd7-cc9ecfd73a67`: the owner answered "Sure" to a narrow
   amendment permitting an in-memory, fictional-data-only CSV preview behind the
   local-demo fence, with no downloads, no persistence, no real data, and no
   production activation. That grant covers the proposed local-demo preview
   exception only. It is not production runtime authority and not general
   Phase 7 execution, and it earns no plan credit.

The corresponding subsection is appended to
`.planning/phases/07-mining-pilot-handoff-and-recovery/07-PREPARATION.md`. No
other plan, roadmap, or status file is edited by this lane; `STATE.md` and the
roadmap remain the docs incumbent's.

## Exact file ownership

Recorded before edits, to avoid overlap with the UI and browser owners.

Owned and changed by this lane:

- `site/domain/crm-handoff-projection.ts` (new)
- `site/tests/crm-handoff-projection.test.mjs` (new)
- `site/app/api/local-demo/crm-handoff-preview/route.ts` (new, gated)
- `site/tests/crm-handoff-preview-route.test.mjs` (new)
- `.planning/phases/07-mining-pilot-handoff-and-recovery/07-PREPARATION.md`
  (single appended subsection, nothing else)
- `docs/implementation-lanes/2026-09-08-crm-handoff-local-demo-preview.md` (this
  note)

Explicitly **not** owned here:

- `site/app/local-demo/_screen.tsx` and every other existing UI file — issue 8
  owns them; any eventual UI trigger is separately coordinated
- browser and acceptance suites — issue 11 owns them
- `site/domain/crm-csv-codec.ts` — its no-import invariant is preserved; only
  its exported constants are consumed
- `site/domain/contact-eligibility.ts` — consumed, never modified
- any `preparation/` module, migration, `STATE.md`, or roadmap file

## The seam

`recheckForCrmExport` in `domain/contact-eligibility.ts` types its result as
`blocked: true` — a literal, returned unconditionally. Its own comment states
the reason: the module cannot authorize later-phase behaviour even when current
evidence is `ContactReady`.

`domain/crm-handoff-projection.ts` composes that boundary rather than restating
it. For each supplied candidate it calls `recheckForCrmExport`, reports the
eligibility that call projected, and admits a row only if the recheck is
unblocked. Because it never is, **`admitted` is empty and every candidate is
refused with `crm_export_recheck_blocked`**, including one whose evidence is
fully current. That is the intended reject-only state; the seam is wired and
fail-closed, and admitted rows will appear here unchanged on the day the
boundary is opened under its own authorization.

Row identity is Prospect plus contact point, matching the codec's
deduplication: an exact repeat collapses, and the same identity carrying
different material fails closed as a conflict rather than being guessed. Field
order comes from `CRM_CSV_FIELD_IDS`, so a projection cannot drift from the
codec's closed schema. `encodeCrmCsv` is never imported or called by the
contract module.

## Unexposed status

Accurate as of this note: the pure contract is **not reachable from the running
application**. It has no route, no UI trigger, and no binding. The gated preview
route below is its only entry point, and that route is development-only. This
lane does **not** complete the issue 11 handoff journey — it supplies the
decision seam a browser owner can later exercise.

## Validation

From `site/` on Node.js 22.13 or newer:

```bash
node --test --test-concurrency=1 tests/crm-handoff-projection.test.mjs tests/crm-handoff-preview-route.test.mjs
npm test
npm run lint
```

## Authority denials

No file is written, no `Content-Disposition` is set, no download is offered, no
D1 or R2 write occurs, no provider is reached, and no real row is read. Every
authority flag on the decision is `false` and every effect counter is `0`.
Production composition remains reject-only. No Phase 7 plan is executed and no
plan or phase completion credit is claimed.
