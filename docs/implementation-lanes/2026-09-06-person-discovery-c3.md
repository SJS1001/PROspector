# Person discovery C3: Contacts operator UI

**Base:** `4f6475b`
**Scope:** issue #6, C3 only
**Status:** local UI candidate; not Phase 5 completion

## Delivered

The Contacts surface now contains a separate, read-first **Find suitable people**
workspace over C2's owner-admitted projection and closed command transport.
It selects a current Approved Prospect with **No known person**, presents the
latest requested/completed/reconciliation/stale state, and labels every live
row **Suggested person — not yet a contact** with `eligible: false`.

The UI does not display a verified/contact-ready badge, address, telephone,
provider, package, send, call, or export control. An ordinary runtime says
that discovery is unavailable and its action is disabled with a focusable
explanation; it makes no provider call. C3 uses only C2's exact endpoint,
same-origin credentials, intent header, bounded server-projected IDs,
revision, digest, and client-generated idempotency key. It does not submit a
workspace, owner, configuration, candidate contents, provider, contact value,
or budget authority.

Owner decisions remain explicit: No match, Create new person, and Link
existing person. No decision is preselected and each needs confirmation. The
bounded C2 projection now supplies current same-workspace Contact labels and
revisions, so Link existing person can use an explicitly selected Contact and
never guesses by name. Stable owner-scoped opaque label discriminators keep
otherwise identical business names and roles distinguishable without exposing
contact values. After a person relation exists, separate initial and
stale-refresh verification intent controls use the current relevance Contact
revision and, only when current trusted evidence is stale, the server-projected
observation locator. These commands only record intent: they cannot call a
provider or make a contact detail eligible.

Candidate ordinal is canonical zero-based (`0..19`). Live candidate cards show
only safe bounded name/title/role plus live, unredacted provenance reference,
retrieval time, and bounded excerpt when retained. Expired or redacted rows
remain unavailable. The projection exposes no contact point values.

People are paged in real five-row windows and have independent cursor history.
A cursor 409 clears candidate, Contact, and confirmation selections, resets to
page one, and performs at most one GET refresh while retaining the plain
warning. Unknown POST outcomes perform one GET refresh and are never
automatically retried, and the warning remains visible if that recovery read
also fails. Mutual synchronous read/mutation guards prevent same-tick paging and
command races without dropping the admitted operation's authoritative refresh.
Keyboard-labelled controls,
live status, focus movement to the result state, focusable disabled reasons,
and reflow-safe cards are included.

## Focused evidence

- `node --test --test-force-exit tests/person-discovery-ui.test.mjs`: 8/8 pass.
  This exercises exact projection bounds and lineage, duplicate-name labels,
  create/link/no-match commands, initial/stale intent bodies, both same-tick
  read-command orderings, double-Next and single-reset recovery, retained
  unknown-outcome warnings, focus, and pending controls.
- `node --test --test-force-exit --test-name-pattern='link_existing|C3.initial.read.minimizes' tests/person-discovery-handler.test.mjs`:
  2/2 pass against loopback Miniflare, including stable opaque duplicate-name
  labels and the minimized current-authority projection.
- Touched-file ESLint: pass.
- Source/effect scan finds no Gmail, telephony, click-to-call, CSV export,
  provider credential, workspace, or owner authority field in the C3 client.

## Remaining C4

C4 owns the full synthetic local runtime/browser acceptance: real DOM keyboard
journey, restart persistence, two-tab drift, and server handler verification in
a loopback-capable environment. It must not add a provider, hosted target,
credential, ContactReady promotion, outbound effect, or Phase 5 completion
claim.
