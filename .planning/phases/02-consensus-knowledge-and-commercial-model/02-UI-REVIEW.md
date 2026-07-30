---
phase: 02-consensus-knowledge-and-commercial-model
review: ui
audited: 2026-07-30
baseline: 02-UI-SPEC.md
screenshots: not-captured-no-dev-server
overall_score: 11/24
---

# Phase 2 — UI Review

**Audited:** 2026-07-30  
**Baseline:** Approved `02-UI-SPEC.md` and locked `02-CONTEXT.md`  
**Screenshots:** Not captured — no dev server responded on localhost ports 3000, 5173, or 8080. Findings are code-backed; `needs_human_review: true` applies only to unverified rendered visual balance.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Several contract-critical empty, drift, and pending messages are replaced by ambiguous or generic copy. |
| 2. Visuals | 2/4 | The commercial tree cannot render the complete hierarchy projection or truthful counts; rendered composition still needs human review. |
| 3. Color | 2/4 | Phase-specific semantic treatments are present, but primary controls use off-contract green and the inherited stylesheet has uncontrolled color proliferation. |
| 4. Typography | 2/4 | The Knowledge UI inherits extra sizes and weights, including 25px/11px and 730/800 rather than the four-size/two-weight contract. |
| 5. Spacing | 2/4 | The implemented screen retains non-token 28px, 15px, 18px, and 20px spacing in active Knowledge component styles. |
| 6. Experience Design | 1/4 | Required correction/rescope inputs are bypassable and Drift omits the required four review actions. |

**Overall: 11/24**

---

## Top 3 Priority Fixes

1. **BLOCKER — prevent invalid immutable decisions.** Correction/rescope controls declare `required` but their `type="button"` handlers dispatch blank values. Use real forms or explicit validity checks, disable submission until all required fields are valid, focus the first invalid field, and preserve the exact reviewed snapshot while pending.
2. **BLOCKER — complete the Drift owner workflow.** Every drift card must expose Accept, Reject, Correct, and Rescope with the same exact-snapshot semantics as proposal review; do not leave only candidate creation.
3. **WARNING — render the authoritative commercial model, not the active path.** Build the tree from all server-projected children (including Greenfield/sibling plays/offers), and display actual confirmed/proposed/drift counts rather than the literal `Server projection required` placeholder.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **WARNING:** The required empty-state copy is not implemented. The Library says `No proposed Knowledge` / `No reviewable proposed knowledge matches this scope` rather than the specified `No proposed knowledge to review` heading and explanatory body; the confirmed equivalent is also different. This removes the owner guidance that explains how authority is established. [knowledge-library.tsx](../../../site/app/knowledge/knowledge-library.tsx:13)
- **WARNING:** The required empty-drift heading/body is replaced with only `No unresolved drift is recorded.` The owner loses the explicit statement that confirmed knowledge and active configurations have no differences requiring review. [drift-replacements.tsx](../../../site/app/knowledge/drift-replacements.tsx:13)
- **WARNING:** Mutation progress is a generic `Saving the reviewed authority snapshot…`; the contract requires action-specific labels such as `Submitting answer…` and `Activating replacement…`. [knowledge-workspace.tsx](../../../site/app/knowledge/knowledge-workspace.tsx:85)
- **WARNING:** The active-question metadata hard-codes `QUESTION 1 / 1`, `COMPANY`, `Prerequisites: none recorded`, and retrieval metadata instead of rendering the authoritative question number, destination, prerequisite versions, source date, and retrieval time. [consensus-interview.tsx](../../../site/app/knowledge/consensus-interview.tsx:17)

### Pillar 2: Visuals (2/4)

- **WARNING:** `CommercialModelView` constructs its tree only from `projection.path` and `projection.offers`; sibling customer profiles/market plays outside the current path cannot appear. That fails the contract’s visible nested Digitalrain → ONE → ONE for Mining → Operating + Greenfield model and prevents a complete scope visual. [commercial-model.tsx](../../site/app/knowledge/commercial-model.tsx:17) [commercial-model.tsx](../../site/app/knowledge/commercial-model.tsx:19)
- **WARNING:** Entity detail displays literal placeholders for confirmed/proposed/drift counts, rather than the required authoritative counts; this is a visible incomplete state in the central detail panel. [commercial-model.tsx](../../site/app/knowledge/commercial-model.tsx:31)
- **WARNING:** The Commercial Model uses a 320px tree rail as required, but the Interview view has no actual scope sidebar; the fixed two-column interview composition is absent from the React structure. [commercial-model.tsx](../../site/app/knowledge/commercial-model.tsx:22) [knowledge-workspace.tsx](../../site/app/knowledge/knowledge-workspace.tsx:94)
- `needs_human_review: true` — no running client was available to verify hierarchy density, focal hierarchy, 60/30/10 distribution, or overflow at 1440/768/375px.

### Pillar 3: Color (2/4)

- **WARNING:** The contract reserves `#194b38` for primary CTA/active local navigation/focus, but `.primary` renders `#153f30`. This creates a second competing authority green. [globals.css](../../site/app/globals.css:19) [globals.css](../../site/app/globals.css:102)
- **WARNING:** The Phase 2 view uses `fit-pill` for both Proposed Knowledge and High-risk drift; the class is amber only because it is later overridden, while the global class is green. The state treatment is therefore context-dependent rather than a dedicated semantic token. [globals.css](../../site/app/globals.css:26) [globals.css](../../site/app/globals.css:123) [drift-replacements.tsx](../../site/app/knowledge/drift-replacements.tsx:15)
- **WARNING:** The stylesheet contains a large uncontrolled set of hard-coded greens/greys/ambers beyond the design tokens. This prevents proving the required 60/30/10 distribution and makes semantic corrections fragile. [globals.css](../../site/app/globals.css:3)

### Pillar 4: Typography (2/4)

- **WARNING:** The Phase 2 contract permits only 10px/12px/16px/28px and 400/760. Active shared styles retain 9px, 11px, 25px, 34px, 730, and 800; Knowledge controls inherit 11px/730 from `.primary`. [globals.css](../../site/app/globals.css:19) [globals.css](../../site/app/globals.css:24) [globals.css](../../site/app/globals.css:95)
- **WARNING:** Mono references use a generic system monospace stack instead of the specified Geist Mono, despite the contract requiring the font for digests, IDs, and source references. [globals.css](../../site/app/globals.css:25)

### Pillar 5: Spacing (2/4)

- **WARNING:** The active question card retains 28px padding, which is not in the declared 4/8/16/24/32/48/64 spacing scale. [globals.css](../../site/app/globals.css:24)
- **WARNING:** Shared controls used by the Knowledge workspace apply 10px × 15px padding, and other live panel rules use 18px/20px. These conflict with the contract’s prescribed 44px targets and spacing scale rather than extending it cleanly. [globals.css](../../site/app/globals.css:19) [globals.css](../../site/app/globals.css:22) [globals.css](../../site/app/globals.css:107)
- **WARNING:** At 1050px the Commercial layout stacks correctly, but the specified 300–320px Interview sidebar has not been implemented, so its responsive transition cannot be audited. [globals.css](../../site/app/globals.css:130) [knowledge-workspace.tsx](../../site/app/knowledge/knowledge-workspace.tsx:94)

### Pillar 6: Experience Design (1/4)

- **BLOCKER:** Stage 1 correction/rescope values and reasons can be blank. The fields are marked `required`, but the submission control is `type="button"`, so browser validity never runs and the callback dispatches the empty strings. This permits an invalid authority mutation attempt rather than moving focus to a required field. [consensus-interview.tsx](../../site/app/knowledge/consensus-interview.tsx:17)
- **BLOCKER:** The same bypass exists for Stage 2 Correct/Rescope and proposal review Correct/Rescope. `required` inputs live outside a submitted form and callbacks remain enabled with empty correction/reason/destination values. [consensus-interview.tsx](../../site/app/knowledge/consensus-interview.tsx:18) [knowledge-library.tsx](../../site/app/knowledge/knowledge-library.tsx:23)
- **BLOCKER:** Drift cards do not render Accept, Reject, Correct, or Rescope, although every card must provide them. The implementation has only `Create replacement candidate` plus explanatory text, so an owner cannot perform the required drift review task. [drift-replacements.tsx](../../site/app/knowledge/drift-replacements.tsx:15)
- **WARNING:** All mutation controls are globally disabled through a surrounding fieldset, but leaf components do not receive action/pending state. Consequently the UI cannot show the action-specific pending labels or retain a distinct disabled reason beside each unavailable action. [knowledge-workspace.tsx](../../site/app/knowledge/knowledge-workspace.tsx:85) [knowledge-workspace.tsx](../../site/app/knowledge/knowledge-workspace.tsx:92)
- **WARNING:** The stale/unknown issue controls in the Interview leaf have no callback, so their visible `Check current version` button does nothing when that prop is used. [consensus-interview.tsx](../../site/app/knowledge/consensus-interview.tsx:12)
- **WARNING:** Candidate activation does not render the mandatory full impact summary, preserved prior snapshot link, activation-success timestamp/owner/audit reference, or exact activation boundary statement immediately above the CTA. [drift-replacements.tsx](../../site/app/knowledge/drift-replacements.tsx:16)

---

## Files Audited

- `02-CONTEXT.md`, `02-UI-SPEC.md`, and Phase 2 plans/summaries 01–11
- `site/app/knowledge/knowledge-workspace.tsx`
- `site/app/knowledge/commercial-model.tsx`
- `site/app/knowledge/consensus-interview.tsx`
- `site/app/knowledge/knowledge-library.tsx`
- `site/app/knowledge/drift-replacements.tsx`
- `site/app/prospector-app.tsx`
- `site/app/globals.css`
- `site/tests/knowledge-ui.test.mjs`, `site/tests/rendered-html.test.mjs`, `site/tests/fixture-safety.test.mjs`

**Verification:** the focused UI/render/fixture tests and lint pass. `components.json` is absent, so the Registry Safety audit is not applicable.
