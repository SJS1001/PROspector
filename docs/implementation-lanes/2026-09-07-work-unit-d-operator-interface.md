# Work Unit D — coherent operator interface

**Prepared:** 2026-09-07
**Repository:** `https://github.com/SJS1001/PROspector.git`
**Base:** `codex/generic-onboarding-integration` at
`92fbe932a34336a55ed820420bddb142bdaddeee`
**Replayed from:** `5c3440e…` → `e087b2c…` → the current base, as the
integration branch advanced through PR #12 and PR #15
**Lane branch:** `claude/task-d-ui`
**Predecessor record:** [`2026-09-06-claude-cloud-transfer.md`](2026-09-06-claude-cloud-transfer.md)

This reconstructs the Work Unit D operator-interface unit that was lost with a
temporary worktree. It is local UI implementation and local focused evidence
only. It grants no hosted, provider, credential, prospecting, enrichment,
export, email, call, schedule, runner, or outbound authority, and it consumes no
external-effect gate. The retired Sites project was not accessed.

## What the shell now is

Six real tasks, and nothing else:

| Stable route ID | Operator label | Route |
|---|---|---|
| `status` | Status | `/` |
| `knowledge` | Company & products | `/?view=knowledge` |
| `market-discovery` | Market discovery | `/?view=market-discovery` |
| `review-queue` | Review prospects | `/?view=review-queue` |
| `prospects` | Prospects | `/?view=prospects` |
| `contacts` | Contacts | `/contacts` |

Route IDs are deliberately separate from labels. The existing `?view=` values are
unchanged, so bookmarks, the local-demo entry link, the smoke script, and the
browser specs keep working while the operator-facing wording changed.

Removed because no service backs them: Morning Brief, Exports & History, the
global search field, the "No live runs" control, the "Codex runner · Not
connected · fixture mode" status block, the duplicate "Pilot settings" link, and
the synthetic signal rows with their disabled Approve/Defer/CSV/Export controls.
The mandated controlled-capability boundary banner is unchanged.

## Contacts

Contacts keeps its own admitted route rather than a root view.

- `?view=contacts` on the root is rejected exactly like any unknown or removed
  value and falls back to Status. The root entry point cannot pass `activeTask`
  at all, so the root shell has no path to render Contacts.
- `/` and `/contacts` now admit through one shared `admitOperatorSession` seam:
  the same owner check, the same fail-closed denial, and the same presentation
  identity key. Neither entry point can be reachable while the other denies.
- **Every post-mount Contacts admission 404 collapses the whole shell at once.**
  The Contacts read, each Contacts mutation, the uncertain-result recovery read,
  and the nested person-discovery read/command paths all route through one
  collapse gate. A 404 issues no recovery fetch, no retry, and leaves no partial
  Contacts surface; the shell renders the neutral denial instead.
- Server-error and lost-response handling is unchanged: exactly one mutation is
  issued, exactly one safe authoritative read follows, explicit confirmation is
  invalidated, and nothing is retried automatically.

## Admission defect closed at the base commit

At `5c3440e`, and still at the current base `92fbe93`, the root shell called

```ts
admitPilotOwner(await runtimeIdentity(undefined, bindings), …);
initialAccess = "authorized";
```

The identity was awaited, but `admitPilotOwner` itself was not. Its rejection
escaped the surrounding `try/catch` as an unhandled Promise, so once the
development local-demo guard held, `initialAccess` was set to `authorized`
regardless of whether the resolved identity was the owner — while
`app/contacts/page.tsx` awaited the same call and denied correctly. The two
entry points therefore disagreed on the same identity.

Sharing one `admitOperatorSession` seam closes it: the owner check is awaited
inside `try/catch`, and missing bindings, a null identity, a non-owner identity,
or any thrown adapter all return the frozen `DENIED` result. The root shell no
longer names `admitPilotOwner` at all.

The focused regression in `tests/operator-interface-ui.test.mjs` proves
`admitPilotOwner` rejects (rather than returning) for a missing and for a
non-owner identity, and asserts that every call site in `app/owner-admission.ts`,
`app/page.tsx`, and `app/contacts/page.tsx` is awaited. Run against the base
commit's `app/page.tsx`, that check reports one unawaited call; it reports the
same one unawaited call against the current base `92fbe93`, and passes here. The
fix therefore remains necessary and correct on the new base.

## Operator context

`app/operator-context.ts` is presentation-only. It records the server-projected
Company → Product → Market play → Customer profile path that the Knowledge task
already returns, so the shell can repeat the current scope across tasks. It
selects nothing, widens nothing, and grants no authority; every command still
carries server-projected locators and every route re-derives its own scope.

- **Identity-keyed.** A stored context is restored only under the exact admitted
  identity key it was written with. Any other key discards the record instead of
  reusing it. The key is a one-way digest of the already-protected owner
  subject: it is never displayed and reveals neither the identity nor the
  subject pepper.
- **Atomic.** A context is one frozen record, replaced whole in memory and in a
  single storage entry. A changed parent clears its descendants inside that same
  replacement, so no partially updated scope is ever observable.

## Plain task state and closed technical records

`app/task-state.tsx` is the shared task-state component: one plain-language
vocabulary (Not started / In progress / Needs you / Waiting / Ready /
Unavailable) plus an optional closed `<details>` technical record. Raw
identifiers, digests, and revisions moved into those closed records:

- the selected Customer Profile in Prospects and Review prospects,
- the selected approved prospect and the grant receipt in Contacts Stage 1,
- each identity suggestion and its projected candidates.

Where two records would otherwise render identical text — duplicate Profile
names, repeated approved-prospect or candidate rows — a plain ordinal
disambiguates them (`Operating sites (1 of 2)`), and the exact identifier stays
in the closed record beside the control.

## Accessibility and reflow

A skip link precedes the rail and targets one named, focusable task region.
Every in-shell task change moves keyboard focus to that region. The rail nav
carries `aria-current="page"` on exactly one task. The 760px and 480px reflows
cover the new context strip, rail links, and technical-record rows alongside the
existing shell rules; every new interactive target keeps the 44px minimum.

## Files

- `site/app/workspace-view.ts` — six tasks, route IDs separated from labels,
  Contacts and removed views rejected as root parameters.
- `site/app/operator-context.ts` *(new)* — identity-keyed atomic context and
  duplicate-label disambiguation.
- `site/app/task-state.tsx` *(new)* — shared plain task state and closed
  technical record.
- `site/app/owner-admission.ts` *(new)* — one admission seam for `/` and
  `/contacts` plus the presentation identity key.
- `site/app/prospector-app.tsx` — six-task shell, removed affordances, context
  strip, skip link, focus management, Contacts task.
- `site/app/page.tsx`, `site/app/contacts/page.tsx` — equivalent admission.
- `site/app/knowledge/knowledge-workspace.tsx` — reports the whole projected
  commercial path instead of only a company name.
- `site/app/prospects/contacts-workspace.tsx`,
  `site/app/prospects/person-discovery-workspace.tsx` — shared 404 collapse gate,
  plain state, closed technical records.
- `site/app/prospecting/prospecting-workspace.tsx` — Profile selector
  disambiguation and closed technical record.
- `site/app/globals.css` — appended operator-shell rules only.
- `site/tests/operator-interface-ui.test.mjs` *(new)* — the focused D gate.
- Updated existing assertions in `site/tests/rendered-html.test.mjs`,
  `workspace-view.test.mjs`, `fixture-safety.test.mjs`,
  `discovery-handler-ui.test.mjs`, `contacts-ui.test.mjs`,
  `profile-prospecting-ui.test.mjs`, `knowledge-handler.test.mjs`, and
  `cloudflare-access-identity.test.mjs`.

## Fixture-safety contract after the removals

A coordinator report flagged that the Morning Brief empty-signal fixture no
longer renders a native-disabled **Approve disabled** control. That is the
intended consequence of this unit, not a regression: Morning Brief, its
synthetic signal rows, and their Approve/Defer/CSV/Export controls were removed
because no service backs them. Restoring a visible disabled consequential
control in an empty state would reintroduce exactly the affordance this unit was
asked to delete, so the contract moved rather than the code.

`tests/fixture-safety.test.mjs` now carries two contracts instead of one, and the
coverage is wider than before:

1. The removed fixture vocabulary — Prospecting/Approve/Defer/CSV/Export
   disabled, "No live runs", the runner status line — must not reappear in any
   shell task render or in the shell source.
2. **Every** rendered control whose label names a consequential act (Approve,
   Defer, Reject, CSV, Export, Send, Call, Dispatch, Prospecting, Run granted
   operation, Find suitable people, Run now) must carry the native `disabled`
   attribute and a stated reason. The surfaces under test now include Contacts,
   so the contract has live subjects — "Run granted operation" and "Find
   suitable people" must each keep their own `aria-describedby` explanation, and
   the later-phase prospecting group must keep its shared reason adjacent to its
   six disabled controls. The check fails if fewer than two consequential
   controls are found, so it cannot pass vacuously once a surface changes.

The previous test enumerated four fixed labels from two now-deleted views; the
replacement derives the set from what is actually rendered, so a newly added
enabled consequential control fails it.

## Deliberate non-changes

Orphaned Phase 1 fixture CSS selectors (`.metrics`, `.signal-row`,
`.export-card`, `.search`, `.runner`, and similar) were left in
`app/globals.css`. They are inert once the markup is gone, and the surrounding
dense rule lines are shared with live views, so deleting them would be
formatting churn with regression risk rather than removal of an affordance.

`app/discovery/discovery-workspace.tsx` keeps its own unkeyed
`prospector.discovery.product` picker memory. It already fails closed — a stored
identifier is used only when it matches a currently projected Product — and
folding it into the operator context would have required changing a Phase 3 leaf
outside this unit's contract.

## Validation

Run against base `92fbe932a34336a55ed820420bddb142bdaddeee`.

- `cd site && node --test tests/operator-interface-ui.test.mjs` — 10/10.
- Focused re-runs, all green: `fixture-safety` (3/3), `rendered-html` (4/4),
  `workspace-view` (2/2), `contacts-ui`, `person-discovery-ui`, `knowledge-ui`,
  `knowledge-handler` (5/5), `discovery-handler-ui`, `profile-prospecting-ui`,
  `cloudflare-access-identity` (6/6), `local-demo-boundary` (5/5),
  `greenfield-target-config` (8/8).
- `npm run lint` — clean.
- `npm run build` — succeeds; all routes classify as before.
- The migration-manifest blocker reported against `e087b2c` is closed by
  canonical `7acb4b9` and `7ff23ef`: `tests/greenfield-target-config.test.mjs`
  is now 8/8. The `drift-replacement` failures reported against `5c3440e` were
  closed earlier by canonical `0b7935c`.
- `npm test` — 830 cases pass and 1 fails. The runner stops at the first
  failing file, so the 21 remaining files were run separately in the same order:
  135/135 pass with zero failures after the blocked one. The one failure is
  `tests/production-bundle-boundary.test.mjs`
  case 3, "the production build folds away the LOCAL_DEMO identity and
  synthetic-port constants", which reports `app/runtime-identity.ts:9 DEMO identity`
  surviving in `dist/server/index.js`. **It fails identically at the untouched
  base `92fbe93`** (verified by detaching to that commit, rebuilding, and
  re-running the file: 4/5 pass there too, same marker). Pre-existing bundler
  dead-code-elimination behaviour, outside this unit's files.
- The Chromium browser lanes (`test:browser`, `test:browser:person-discovery`)
  were not run; they belong to Work Unit E. The `?view=` values they navigate
  are unchanged.

## Replay onto the merged integration branch

This change was replayed twice as the integration branch advanced.

**`5c3440e` → `e087b2c`** was conflict-free: canonical `0b7935c` and `e087b2c`
touched no file this unit touches, and the replayed tree was byte-identical to
the previous commit.

**`e087b2c` → `92fbe93`** conflicted in three test files, because canonical had
independently revised the same contracts. All newer canonical behaviour was
preserved:

- `site/tests/fixture-safety.test.mjs` — canonical's three durable contracts are
  kept verbatim: the "must never render enabled" guard for retired labels, the
  label-driven rule that any control whose text ends in "disabled" must actually
  carry the attribute, and the `Connected · advisory` / `Last run 06:00` guard.
  Canonical's fixed list of currently rendered consequential controls is kept
  for the six later-phase prospecting controls that still exist; the three
  entries belonging to the views this unit removes (`Prospecting disabled`,
  `CSV disabled`, `Export disabled`) moved from that list into canonical's own
  "must never render enabled if it returns" list, so no guard is dropped — it
  outlives the view it used to sit in. This unit's contracts sit alongside them.
- `site/tests/rendered-html.test.mjs` — canonical's generic-shell guard
  `doesNotMatch(/Good morning, [A-Z]|Digitalrain|ONE for Mining/)` is kept
  unchanged. Its two positive anchors quoted Morning Brief copy this unit
  removes, so they are replaced by an anchor on the shell's own scope strip.
- `site/tests/workspace-view.test.mjs` — canonical's move of the demo screen to
  `app/local-demo/_screen.tsx`, its loosened `initialView` matcher, and its
  explicit assertion on the blank-workspace redirect are all kept, retargeted to
  this unit's identifiers.

No canonical assertion was deleted outright: each was either kept verbatim or
carried to the surface that still holds the behaviour it guards.

## Boundary

No hosted, Cloudflare, Access, provider, credential, real-data, export delivery,
email, call, schedule, or outbound action was performed or enabled. No shared
roadmap or state document was modified. This unit earns no phase or plan
completion credit, and Work Unit E full browser acceptance remains outstanding.
