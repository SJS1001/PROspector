# Local operator responsive CSS slice

Base verified before edits: `8838363ef64698f92ac57ac06d564b3d72d4701f`.
Branch: `codex/responsive-360-audit`. Isolated cloud scratch checkout.
No published environment selector was available. Parent model/effort controls
and effective model settings are not exposed; no subagents used.

## Findings and changes

At 360px the workspace has 328px inside outer padding and 278–286px
inside padded panels. Grid/flex intrinsic minimum widths can exceed that
space for long fictional source tokens, filenames and error text. Status
counter cells also spend 32px each on horizontal padding. Narrow-only CSS
now permits intrinsic shrinkage, wraps workspace text and action labels,
wraps direct button rows, bounds form widths and reduces counter padding.
Desktop styling and horizontal navigation scrolling are retained. No global
horizontal clipping hides actions. No TSX, handlers, auth or other lane files
changed.

Source audit: the current operator has no dialog component/markup; the brief
table already has an overflow-x-auto wrapper. These require rendered review
on the combined candidate rather than speculative new markup/styles.

## Verification (2026-10-28)

Linux 6.18.55 x86_64; Node v24.22.1; npm 11.9.0.
Commands from operator/:

- `npm ci --no-audit --no-fund`: exit 0, 479 packages.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, three existing unused-variable warnings.
- `npm run build`: exit 0; PGlite runtime assets copied.
- `node --test acceptance/responsive/styles.test.mjs`: exit 0, 1/1.
  CSS parser/scoping regression only; not computed layout evidence.
- `git diff --check`: exit 0.
- Lockfile-installed Playwright 1.63.0, Chromium revision 1243.
- `npx playwright install chromium`: download made no progress; interrupted,
  exit 130. Launch probe exit 1: pinned headless executable absent.

## Remaining proof / handoff

BLOCKED: rendered 360px screenshots and computed overflow/action visibility.
No browser or owner acceptance claimed. No provider-dependent runtime was
started, so no socket fence was substituted or weakened. No owner database,
credentials, provider calls, Gmail navigation, deployment or merge used.

On the combined candidate with pinned browser available, inspect 360x800 and
desktop: status counters, long errors/source tokens, disabled/loading action
labels, archive file selection/confirmation, form submit rows and brief table
scrolling. Verify every critical action is reachable without page horizontal
scroll, navigation can scroll independently and errors remain readable. Use
fictional data and the browser lane's outbound-denied test runtime for any
provider-dependent screen. Keyboard/TSX corrections belong to their owners.
LOCAL-07 and full workflow acceptance remain open.
