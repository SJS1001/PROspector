# Phase 5 parallel preparation — exact array snapshots

Date: 2026-11-07 (America/Toronto)

## Scope and authority

- Isolated checkout: `/workspace/PROspector-phase5`.
- Branch: `fix/phase5-parallel-prep-20261107`.
- Base: `96981f44f9a94a83cdd9f5582c3107c6ca0eff0d` (`origin/main`).
- Preparation-only authority: `05-PREPARATION.md` records exact Phase 4 candidate
  `71b3a7b08d42af8edfa44ded7ecdba7426aebf2e` and the later preparation checkpoint
  `c3233abf4e752afb5ca4e9d0a588852a4aaae07f`. These are historical authority
  references, not fresh acceptance of this branch or Phase 4.
- Read the Phase 5 plans, preparation authority, handoff, governance ADRs and
  existing synthetic prerequisite/reconciliation implementation. Open PR overlap
  check found no Phase 5 prerequisite-plan change; Phase 4/UI and Phase 6–7
  belong to other lanes.

## Incomplete local safeguard

The existing pure prerequisite planner promised exact, immutable JSON-like data
snapshots, but its array copy accepted numeric-looking own keys outside array
index space. For example, own key `4294967295` does not extend array length and
was silently omitted from canonical digest material. A cap policy carrying that
extra material could still produce the same plan as the clean policy; the plan
comparator likewise discarded extra numeric array properties.

The fix requires exactly the copied indices plus the native length descriptor.
It rejects any extra own property instead of silently erasing it. No provider,
repository, route, schema, dependency, UI or runtime composition is added.

## Validation

- Regression first: focused suite failed on the unmodified implementation with
  the expected missing rejection (13 passed, 1 failed).
- After repair: `node --test site/tests/synthetic-enrichment-prerequisite-plan.test.mjs`
  passed 14/14, including both numeric-key adversaries, digest rejection,
  blocked prerequisite planning and invalid comparator results.
- `npm --prefix site run lint`: pass.
- `git diff --check`: pass.
- Node.js v24.22.1; isolated dependency installation used the committed lockfile.
- Full test/build was intentionally NOT launched alongside PR #145 validation.
  Focused/lint evidence is not full-gate or independent-review acceptance.

## Unchanged gates

No plan execution/completion, phase credit, dependency change, summary, shared
planning edit or acceptance claim. Phase 4 hosted/human acceptance and Phase 5
runtime capability remain absent. Production provider composition stays
reject-only. No credentials, real contacts, hosted/provider calls, enrichment
spend, outbound/export/schedule effects or suppression mutations occurred.
Generated/MX-only contact ineligibility, scoped grants, human governance,
immutable knowledge/configuration and Company-wide suppression are untouched.
Nothing was merged. Full validation and normal independent review remain needed
before integration; any future live capability requires separate owner authority.


## Own `__proto__` follow-up on the same PR

PR: https://github.com/SJS1001/PROspector/pull/148

Read-only follow-up found that the object-copy branch assigned keys onto `{}`.
An enumerable own `__proto__` data property with primitive value was silently
lost; object/null values could change the clone prototype. This violated the
existing exact JSON-like graph/digest contract, not a missing runtime capability.

The copy now defines ordinary own data properties explicitly. This preserves
arbitrary valid JSON-like digest material, including `__proto__`, without invoking
inherited setters or changing prototypes. A blanket key blacklist would
unnecessarily restrict the generic digest helper. Closed planner/comparator
schemas still reject this extra field; enumerable accessors and hidden properties
remain rejected without invoking their getters.

Regression proof: before repair the expanded focused suite had 15 passes and
one failure on distinct own-property digest binding. After repair all 16 tests
passed, including primitive, object and null values, distinct digests, unchanged
input/Object prototypes, closed-schema planner/comparator rejection, and hidden
and accessor descriptor rejection with zero getter reads. Repository lint and
`git diff --check` passed. No full test/build was launched: the validation
coordinator must use the newly pushed exact HEAD once resources are available.
This follow-up changes the same three lane-owned files only. All preparation,
human review, hosted, provider and no-phase-credit gates above remain unchanged.
