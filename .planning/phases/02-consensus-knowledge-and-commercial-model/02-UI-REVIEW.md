---
phase: 02-consensus-knowledge-and-commercial-model
review: ui
audited: 2026-07-30
baseline: 02-UI-SPEC.md
source_commit: a3e04eb
supersedes: 0267b85
fix_commits: [56377cb, e66dbf0, fb5dd5f, de662dd, 2e879dc, 45bcdc1]
screenshots: not-captured-no-dev-server
overall_score: local-contracts-clean
status: local_implementation_clean_human_render_pending
---

# Phase 2 — UI Re-review

## Result

**All previously reported local UI and read-model blockers are closed at the
current source revision.** This re-review does not replace the separate Phase
2 hosted-evidence gate or a human rendered-browser check.

## Greenfield continuation update — 2026-09-03

The Plan 02-12/Sites-specific hosted checks below are historical only because
that release is retired. The current rendered-browser and hosted identity
checks must be performed against the exact greenfield release under Plan
02-99, after its separately authorized Worker/Access stages. Local UI evidence
does not satisfy that gate.

## Closed findings

| Prior finding | Current evidence |
|---|---|
| UI-B1 — duplicate-name rescope could only send a locator | `CommercialDestinationSelect` supplies the server-projected `{ scopeType, id, locator }`; interview, Knowledge Library, and Drift review use it. Invalid or stale IDs disable the action before dispatch. |
| UI-W1 — stale revision recovery had the wrong CTA | a 409 now presents `Load current version`; transport uncertainty remains separately labelled `Check current version`. The mutation boundary stays disabled until the authoritative projection is reloaded. |
| UI-W2 — replacement activation did not transfer focus | an activated candidate focuses its `Replacement active` heading with an explicit temporary tab stop. |
| API-B1 — Drift review was unrepresentable | Drift projections include current/proposed versions and values, exact proposal/revision/predecessor/destination decision bindings, provenance, paths, reached artifacts, counts, containment, impact digest, and server-issued candidate authority. |
| API-B2 — replacement activation was unrepresentable | Replacement projections include immutable configuration snapshots, approved version, exact digest/revisions, accepted Drift decision, and activation owner/time/audit/lineage. |
| API-B3 — research-first Interview detail was lost on read | Questions project structured evidence findings, inference, recommendation, exact destination, and prerequisite Knowledge versions. |
| API-B4 — Commercial detail lacked lifecycle/drift truth | Commercial projections preserve their lifecycle and attach `unresolvedDriftCount` per exact destination. |
| API-B5 — Confirmed Knowledge lineage was incomplete | Confirmed versions include confirmation/audit/command detail, provenance, predecessor/successor lineage, prerequisite Knowledge, and configuration dependencies. |

## Verification

- `cd site && node --test tests/knowledge-ui.test.mjs` — PASS, 8/8 at the
  current checkout. Coverage includes exact-ID disambiguation, structured
  Interview authority, quarantined-content redaction, Drift/replacement
  bindings, and disabled forged bindings.
- Targeted ESLint for Phase 2 UI/read-model files — PASS.
- No production code, runtime binding, hosted resource, deployment, secret, or
  private data changed during this re-review.

## Residual checks outside local UI/read-model implementation

1. **Human rendered-browser review:** no local dev server was running, so
   responsive balance, contrast, wrapping, and keyboard flow still need a
   human browser review. This is not a code or API blocker.
2. **Historical Plan 02-12 evidence:** its Sites-specific proof is retired and
   must not be resumed. Equivalent exact-release browser and identity evidence
   remains non-substitutable under greenfield Plan 02-99 and is not satisfied
   by this local re-review.

## Scope boundary

This record neither authorizes deployment, migration, activation, credentials,
uploads, discovery, prospecting, schedules, exports, spend, Gmail, calls, nor
any other external effect.
