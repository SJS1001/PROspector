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
never guesses by name. After a person relation exists, separate initial and
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
automatically retried. A per-mutation in-flight guard prevents same-tick double
activation. Keyboard-labelled controls,
live status, focus movement to the result state, focusable disabled reasons,
and reflow-safe cards are included.

## Focused evidence

- `node --test tests/person-discovery-ui.test.mjs`: 4/4 pass. This exercises
  ordinal zero normalization; explicit create/link choice and confirmation;
  initial/stale intent body shapes; same-tick guard; five-row paging; stale and
  unknown recovery state; and focusable disabled explanations.
- Touched-file ESLint: pass.
- Targeted TypeScript diagnostic has no C3-file error; pre-existing repository
  typing/environment errors remain outside this unit.
- Source/effect scan finds no Gmail, telephony, click-to-call, CSV export,
  provider credential, workspace, or owner authority field in the C3 client.

The broader C1/C2 Miniflare test command was attempted in this isolated
worktree, but every fixture failed before test assertions because its local
loopback fixture runtime was unavailable in this environment. C3's pure UI
test remains green; C4 must rerun C1/C2/C3 with loopback-capable fixtures.

## Remaining C4

C4 owns the full synthetic local runtime/browser acceptance: real DOM keyboard
journey, restart persistence, two-tab drift, and server handler verification in
a loopback-capable environment. It must not add a provider, hosted target,
credential, ContactReady promotion, outbound effect, or Phase 5 completion
claim.
