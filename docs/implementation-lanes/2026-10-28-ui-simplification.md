# UI simplification — 28 October 2026

Implemented on `codex/local-app-integration`, production source `b411707`.
The owner's approved Company concept is adapted to the existing dark theme;
no color tokens, data schema, provider behavior or approval gates changed.

## Delivered

- Company shows saved company/product summaries first. Full answers, evidence,
  limits, delivery details and market preferences are expandable. Corrections
  open a focused editor, then require submission and explicit confirmation.
- Navigation groups Today, Your business, Prospecting, Outreach and Settings.
  Mobile navigation uses Menu; current groups open. The Company follow-up below
  removes misleading route padlocks while preserving destination prerequisites.
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

## Company follow-up — 28 October 2026

Owner feedback requested less wording and fewer visible sections. The Company
screen now shows names, short saved-answer previews and Edit buttons. One closed
Details disclosure holds full answers/evidence, product limits, delivery and
market preferences. Introductory text, repeated labels and Saved badges are
removed. Navigation padlocks are removed without changing destination guards.
Dark colors, saved answers and explicit correction confirmation are preserved.

Verified the working-tree delta on `fb3672b`: typecheck/build pass; lint zero
errors and three existing warnings; focused UI tests 4/4 pass; changed-file
React Doctor scan reports no issues. Contained acceptance passes 46 unit tests,
two workflows, 483 keyboard actions, 279 layout samples, 10 cancellation cases
and four recovery scenarios. See the current evidence section for exact scope.

The owner app is running again on loopback port 8080. Its stale empty database
lock was recovered using the documented stopped-process/backup procedure;
1,099 backup files were hash-verified before removing only the empty lock
folder. Read-only inspection confirms desktop and 320px rendering and access
to full answers. Owner data was not edited.

## App-wide copy follow-up — 28 October 2026

Applied the same compact approach beyond Company:

- Today shows one next-action button; weekly details and recent work are folded
  away. Failed work stays expanded and morning-run feedback stays visible.
- Target markets separates open proposals from collapsed reviewed/confirmed
  markets and hides empty history.
- Searches, prospect details and Review place provider history, scoring and
  additional sources under their relevant categories.
- Contacts keeps names, addresses and actions visible, with provenance and
  contact-source help collapsed. Verified contacts no longer show the incorrect
  unverified-mailbox warning.
- Outreach removes duplicate prepared-prospect rows, groups version details,
  delivery history and the do-not-contact list, and keeps approval controls and
  failure messages available.
- Settings groups each connection and search preference inside its own section;
  export, backup/restore and diagnostics stay separate, collapsed categories.

The existing dark color tokens are unchanged. Explicit confirmations, source
records, disqualifiers and operational errors are retained. No backend or
workflow authorization rules changed.

Verification: typecheck/build passed; lint has zero errors and three existing
warnings. Operator regressions passed 319 tests before the final contact-warning
condition; focused UI tests passed 4/4 afterward. Changed-file React Doctor
reported no issues. Final contained acceptance passed 46 units, two workflows,
558 keyboard actions, 312 layout samples, 10 cancellation cases and four recovery
scenarios, including keyboard access to all seven Settings groups. Zero unexpected
requests or forbidden provider attempts; Gmail compose was intercepted.

The rebuilt owner app is listening on 127.0.0.1:8080. Read-only Today/Settings
inspection confirms the compact layout and existing dark palette. No owner data
was edited. The saved screenshot is outside Git in the local UI review folder.
