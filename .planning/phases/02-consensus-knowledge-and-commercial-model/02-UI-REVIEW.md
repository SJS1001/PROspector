---
phase: 02-consensus-knowledge-and-commercial-model
review: ui
audited: 2026-07-30
baseline: 02-UI-SPEC.md
source_commit: 0267b85
fix_commits: [44a9f48, 91f42fc, 991a92b]
screenshots: not-captured-no-dev-server
overall_score: 15/24
status: acceptance_blockers
---

# Phase 2 — UI Review

**Audited:** 2026-07-30  
**Baseline:** Approved `02-UI-SPEC.md` and locked `02-CONTEXT.md`  
**Fixes re-reviewed:** `44a9f48`, `91f42fc`, `991a92b`

**Screenshots:** Not captured — no dev server responded on localhost ports 3000, 5173, or 8080. Code and SSR findings are definitive; rendered balance, contrast, and viewport fit remain `needs_human_review: true`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Required empty-state copy is now exact; concurrency recovery still collapses distinct cases into one notice/CTA. |
| 2. Visuals | 2/4 | The selected hierarchy path and active-question hierarchy are fixed, but core interview, drift, replacement, and authority-detail content remains absent from server projections. |
| 3. Color | 3/4 | Semantic Phase 2 treatments match the contract in code; rendered 60/30/10 balance and contrast were not available to verify. |
| 4. Typography | 3/4 | The active question is restored to 28px and scoped styles match the declared scale; rendered wrapping remains unverified. |
| 5. Spacing | 3/4 | The 4px spacing scale, 320px rails, targets, and breakpoints are represented; actual viewport fit remains unverified. |
| 6. Experience Design | 1/4 | Quarantine SSR is fixed, but exact-ID rescope is incomplete and required drift/replacement tasks remain impossible from the current read models. |

**Overall: 15/24**

---

## Fix-Commit Verification

| Requested verification | Result | Evidence |
|---|---|---|
| Quarantine SSR | **FIXED** | The projection is a discriminated union; quarantined cards branch before content access, render fixed metadata-only copy, suppress even defensively supplied raw content, and expose no review control. The SSR regression passes. [knowledge-library.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-library.tsx:5) [knowledge-library.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-library.tsx:24) [knowledge-ui.test.mjs](/Users/stevensmith/Documents/PROspector/site/tests/knowledge-ui.test.mjs:85) |
| Exact destination IDs | **PARTIALLY FIXED** | Owner-edit payloads now carry the projected node ID and locator; the server validates ID, scope type, workspace, hierarchy ancestry, and locator agreement, and ambiguous name-only lookup fails closed. Proposal and interview **rescope** controls still send free-text locators without projected IDs. [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:113) [knowledge.ts](/Users/stevensmith/Documents/PROspector/site/domain/knowledge.ts:122) [knowledge-library.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-library.tsx:29) [consensus-interview.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/consensus-interview.tsx:16) |
| Selection | **FIXED** | Selection is workspace-owned, tree selection updates the shared scope, and breadcrumbs/sidebar derive the actual ancestor chain instead of treating the last flattened item as current. [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:24) [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:85) [commercial-model.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/commercial-model.tsx:9) |
| Proposed/Confirmed counts | **FIXED FOR AVAILABLE DATA** | Counts are computed per exact destination ID from the live library and shown for the selected node. The contract's third count, unresolved drift, is still absent from the commercial projection/UI. [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:89) [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:124) [commercial-model.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/commercial-model.tsx:23) |

---

## Top 3 Priority Fixes

1. **BLOCKER — replace free-text rescope locators with exact projected-node selection.** Valid duplicate hierarchy names cannot currently be selected for proposal or interview rescope. Pass `{scopeType, id, locator}` from a hierarchy picker and retain the server's ancestry validation.
2. **BLOCKER — return complete drift and replacement projections.** Supply proposal/revision/destination review bindings, current/proposed/provenance/path/impact data, candidate configuration references, expected owner revision, and activation-result lineage so the contracted review and activation flows can run.
3. **BLOCKER — complete the remaining authoritative read models.** Preserve structured interview evidence/destination/prerequisites, per-entity unresolved-drift and correct lifecycle/nurture state, and full Confirmed Knowledge provenance/decision/dependency lineage.

---

## Open Findings by Boundary

### Local UI findings

1. **BLOCKER — UI-B1: rescope is not bound to an exact projected destination ID.** Both rescope forms accept a string and submit it as `locator`; they do not present the projected hierarchy or send its ID. The server safely rejects ambiguous names, but the owner then cannot complete a valid rescope to either duplicate-named node. [knowledge-library.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-library.tsx:29) [consensus-interview.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/consensus-interview.tsx:16)
2. **WARNING — UI-W1: stale-revision recovery uses the wrong CTA and generic state.** A 409 shows the required alert sentence, but the button is `Check current version`, not `Load current version`; answer-submitted-elsewhere, decision-completed-elsewhere, and superseded-question states are not distinguished. The action boundary now remains disabled until reconciliation, which closes the prior unsafe re-enable defect. [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:69) [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:95) [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:97)
3. **WARNING — UI-W2: replacement success has no explicit focus transfer.** The active result has visible status and localized live content, but activation does not move focus to `Replacement active` as required. [drift-replacements.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/drift-replacements.tsx:16)

### Backend/read-model contract gaps

1. **BLOCKER — API-B1: drift review cannot be represented.** `readDrift` returns only ID, risk, status, and impact digest. It omits proposal/revision/destination bindings, values, provenance, paths, reached artifacts/counts, containment, and candidate inputs. [knowledge-handler.ts](/Users/stevensmith/Documents/PROspector/site/domain/knowledge-handler.ts:162)
2. **BLOCKER — API-B2: replacement activation cannot be represented.** `readReplacements` returns only ID, status, digest, and revision. Required configuration references, proposed version, impact digest, expected owner revision, activation time/owner/audit, and preserved snapshot are absent. [knowledge-handler.ts](/Users/stevensmith/Documents/PROspector/site/domain/knowledge-handler.ts:163)
3. **BLOCKER — API-B3: Interview discards structured research-first authority on read.** `QuestionView` exposes legacy premise/inference/provenance/recommendation fields; stored evidence findings, exact destination, and prerequisite versions are compressed or omitted. [interview.ts](/Users/stevensmith/Documents/PROspector/site/domain/interview.ts:20) [interview.ts](/Users/stevensmith/Documents/PROspector/site/domain/interview.ts:293)
4. **WARNING — API-B4: Commercial detail lacks required drift/lifecycle truth.** The local selection path is now correct, but every projected profile is still marked `nurture` and entity detail has no unresolved-drift count. [commercial-model.ts](/Users/stevensmith/Documents/PROspector/site/domain/commercial-model.ts:99) [commercial-model.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/commercial-model.tsx:35)
5. **WARNING — API-B5: Confirmed Knowledge authority detail is incomplete.** The version read omits confirmation time, audit reference, full provenance, successor links, and dependencies while the card claims those lineages exist. [knowledge.ts](/Users/stevensmith/Documents/PROspector/site/domain/knowledge.ts:145) [knowledge-library.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-library.tsx:29)

### External evidence blockers — not local UI defects

- Plan 02-12 still requires a real second signed-in principal boundary proof with zero owner-side delta.
- Plan 02-12 still requires an accepted, read-only hosted D1 schema-0003 baseline.
- No local test, SSR render, screenshot, report, fixture, or digest substitutes for either checkpoint. No hosted migration, deployment, activation, access-policy, secret, or control-plane action was attempted.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **PASS:** Proposed, Confirmed, and drift empty-state headings and bodies now match the locked contract exactly. [knowledge-library.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-library.tsx:16) [drift-replacements.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/drift-replacements.tsx:13)
- **WARNING:** The 409 recovery CTA and distinct concurrency messages remain off-contract as UI-W1 describes.
- **WARNING — backend-dependent:** Honest `not included in the current server projection` messages avoid fabricated authority, but are not acceptable final copy for evidence metadata, destinations, prerequisites, or lineage.

### Pillar 2: Visuals (2/4)

- **PASS:** The hierarchy is nested; shared selection now drives a real ancestor path and Interview sidebar; the active question is again the 28px focal point. [commercial-model.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/commercial-model.tsx:26) [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:87) [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:135)
- **WARNING:** Missing backend fields leave visible cards dominated by `Not included in projection` and contract-gap prose instead of the required evidence, impact, activation, and lineage hierarchy.
- `needs_human_review: true` — hierarchy density, contrast, clipping, and visual balance could not be assessed at 1440×900, 768×1024, or 375×812.

### Pillar 3: Color (3/4)

- **PASS:** Scoped primary, active navigation, focus, Proposed/high-risk, Confirmed/active, neutral, and error treatments use the declared green/amber/neutral/red roles with text labels. [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:102) [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:139)
- **WARNING:** `needs_human_review: true` — without a rendered client, the specified 60/30/10 distribution and actual contrast cannot be proven.

### Pillar 4: Typography (3/4)

- **PASS:** Scoped body, metadata, headings, buttons, digests, and IDs use the declared 10/12/16/28px sizes, 400/760 weights, and Geist Mono roles. The active question now overrides the generic card heading to 28px across breakpoints. [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:95) [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:135)
- **WARNING:** `needs_human_review: true` — long-question wrapping and hierarchy-label legibility were not render-tested.

### Pillar 5: Spacing (3/4)

- **PASS:** Scoped layout uses 4/8/16/24px spacing, 320px hierarchy/interview rails, 44px targets, and the declared 1050/760/480 responsive thresholds. [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:104) [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:145) [globals.css](/Users/stevensmith/Documents/PROspector/site/app/globals.css:153)
- **WARNING:** `needs_human_review: true` — 375px action stacking, long immutable IDs, hierarchy names, and path overflow were not available for screenshot inspection.

### Pillar 6: Experience Design (1/4)

- **PASS:** Metadata-only quarantine rendering is safe and total; the SSR regression covers missing `value` and defensive raw-value redaction. [knowledge-ui.test.mjs](/Users/stevensmith/Documents/PROspector/site/tests/knowledge-ui.test.mjs:85)
- **PASS:** Owner-edit commands now bind exact projected IDs; selection/path and available count behavior are correct; stale/network notices keep mutations disabled until reconciliation. [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:97) [knowledge-workspace.tsx](/Users/stevensmith/Documents/PROspector/site/app/knowledge/knowledge-workspace.tsx:113)
- **BLOCKER — local UI:** Exact-ID rescope remains unavailable for duplicate-name hierarchy nodes (UI-B1).
- **BLOCKER — backend projection:** Drift review and replacement activation cannot be completed (API-B1/API-B2).
- **BLOCKER — backend projection:** Research-first Interview confirmation cannot display exact evidence, destination, or prerequisites (API-B3).
- **WARNING:** Replacement activation success has no explicit focus transfer (UI-W2).

---

## Files Audited

- Repository continuation, Phase 2 state/roadmap/activation, active reviews, `02-CONTEXT.md`, and `02-UI-SPEC.md`
- Current `02-12-PLAN.md` and dependency `02-11-SUMMARY.md`
- Phase 2 Knowledge React components and scoped CSS
- Commercial, interview, knowledge, handler, drift, and replacement domain modules
- Phase 2 UI, repository, drift/replacement, handler, migration, and rendered-output tests
- Fix patches `44a9f48`, `91f42fc`, and `991a92b`

## Verification

- Node.js `v24.16.0` — meets the 22.13+ requirement
- Production build within `npm test` — **PASS**
- `node --test tests/knowledge-ui.test.mjs` — **PASS, 6/6**, including quarantine SSR
- `npm run lint` — **PASS**
- Full `npm test` test phase — started after a successful build, then interrupted to conclude the requested review; no failure was observed before interruption
- Screenshot detection — no dev server on 3000, 5173, or 8080
- Registry audit — not applicable; `components.json` is absent and the UI contract declares no registry blocks
- Only this UI review was edited; no implementation or hosted state was changed
