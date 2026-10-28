# UI simplification — 28 October 2026

Implemented on `codex/local-app-integration`, production source `b411707`.
The owner's approved Company concept is adapted to the existing dark theme;
no color tokens, data schema, provider behavior or approval gates changed.

## Delivered

- Company shows saved company/product summaries first. Full answers, evidence,
  limits, delivery details and market preferences are expandable. Corrections
  open a focused editor, then require submission and explicit confirmation.
- Navigation groups Today, Your business, Prospecting, Outreach and Settings.
  Mobile navigation uses Menu; current groups open and route locks remain.
- Today puts the next action, review counts and recent activity first. Lifetime
  review counts are labelled Workspace totals, not weekly activity.
- Markets/prospecting collapse completed setup and run history. Review, contacts
  and outreach expose details and forms when needed. Pending decisions, errors,
  uncertainty and approval consequences remain visible.
- Settings groups connections, backup and diagnostics. Async errors remain
  discoverable even if a section closes while a request is pending.
- Keyboard focus and 44px disclosure targets are retained. The browser suite
  found partial offscreen textarea focus on narrow screens; the shell now
  scrolls the complete focused control into view when needed.

## Verification

Final production build/typecheck passed; lint zero errors, three existing
warnings. Expanded regressions passed 255 script and 84 source tests before the
final focus-only patch. Contract/archive/concurrency/component/layout checks
51, restart 2, auth runtime 18, local passwordless access 1 and component rerun 7
passed. Independent UI review reported no remaining introduced P1/P2 findings
before the final focus-only patch; that patch was inspected and browser-tested.

Final contained browser run: 46 units, two complete workflows, 483 keyboard
actions, 285 layout samples (320/360/768px), 10 cancellation cases and four
recovery scenarios passed. Company correction persistence and hidden async
backup feedback have explicit coverage. Zero unexpected requests or forbidden
provider attempts. See [exact browser evidence](../../operator/acceptance/browser-workflow/EVIDENCE.md)
and its sanitized last-run.json.

Rebuilt local app is running at http://127.0.0.1:8080/knowledge. Actual desktop
Company rendering and 320px mobile navigation were inspected without changing
owner answers. Screenshot stays outside Git in the local UI review folder.

## Remaining owner judgment

Open Company and judge the summary/navigation for daily use. Real-provider
usefulness, provenance, freshness, time and cost still require the bounded
[owner acceptance](../LOCAL-APP-FINAL-ACCEPTANCE.md). Automated workflows use
fictional data and do not send email. Merge/deployment are separate from this
local UI implementation; no hosted completion is claimed.
