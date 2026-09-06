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
existing person. No decision is preselected, each needs confirmation, and
candidate selection is cleared on projection/page drift. C2 does not project
an exact current Contact/revision selector, so Link existing person is visibly
disabled rather than guessing an identity. For the same reason the separate
Verify business contact details and Refresh verification intents are visible
but disabled: C3 never manufactures the required Contact revision or stale
observation identifier. This is an intentional fail-closed C2 projection gap,
not a substitute local command.

People are paged in real five-row windows and have independent cursor history.
A cursor 409 clears the candidate/decision confirmation, resets to page one,
and performs at most one GET refresh. Unknown POST outcomes perform one GET
refresh and are never automatically retried. Keyboard-labelled controls,
live status, focus movement to the result state, focusable disabled reasons,
and reflow-safe cards are included.

## Focused evidence

- `node --test tests/person-discovery-ui.test.mjs`: 2/2 pass.
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

C4 owns the integrated synthetic local journey and restart/two-tab proof. It
must not add a provider, hosted target, credential, ContactReady promotion,
outbound effect, or Phase 5 completion claim. Before enabling link/verification
controls, it needs a separately reviewed C2 projection addition that supplies
the exact same-workspace Contact revision and verification-freshness/observation
authority; C3 intentionally does not infer either value.
