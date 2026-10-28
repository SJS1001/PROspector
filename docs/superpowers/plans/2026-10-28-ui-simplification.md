# UI simplification implementation plan

Owner approved 28 October 2026. Goal: a compact, understandable local operator with the existing dark palette.

Design: the approved Company concept and UI/UX review in `../ui-ux-review-2026-10-28/` (outside this checkout). Implement summaries before details, group existing routes, and keep one next action visible.

Architecture: React presentation changes using the existing workspace DTO, mutation hooks, routes, confirmation gates, and theme tokens. No data migrations or provider changes.

## Sequence

- [x] Company: saved summaries, focused corrections, full answers/evidence on demand; keep first-time interview and explicit confirmation.
- [x] Navigation: Today, Your business, Prospecting, Outreach, Settings; current group open and keyboard/mobile access.
- [x] Daily work/search: next action and review counts first; collapse completed setup, diagnostics and run history.
- [x] Review/outreach: compact records with details/forms on demand; preserve uncertainty and approval consequences.
- [ ] Verify typecheck, lint, production build, full source/script regressions, isolated browser workflow, keyboard, 320px layout and error recovery.
- [ ] Review diff, document evidence, build/restart local app, synchronize branch to GitHub.

## Review focus

Saved answers remain verbatim and reachable. Corrections still require proposal and confirmation. Pending decisions/errors/blockers remain visible. Activation, spending, export and outreach keep their existing boundaries. Never run acceptance mutations against the owner's database. Preserve local-only operation and all existing colors.
