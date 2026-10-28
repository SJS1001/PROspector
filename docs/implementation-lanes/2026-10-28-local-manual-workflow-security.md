# Lane B independent local workflow security review

Date: 2026-10-28. Exact baseline: `2d476b9d2e6bc37f1352444dd95de58b5537f798`.
Branch: `codex/lane-b-manual-outreach`, target `operator-os`.

This is an independent read-only review of implementation, with write ownership
limited to this report. The current owner instruction authorizes bounded local
operator workflow corrections, fictional fixtures, and stubbed provider seams.
Historical Sites/local-demo restrictions do not replace that newer authority;
hosted, credential, real-provider, formal-plan, and owner acceptance remain
unearned. No real-provider or hosted operation is part of this review.

The review read AGENTS.md and the continuation, greenfield, planning,
activation/review/security/UI, terminal 02-99/dependency 02-22, and local
composition sources. The requested security-review control is
`gpt-6.1-sol`, high reasoning; exposed controls are not independent runtime-model
attestation.

## Baseline findings and required regressions

The baseline is unsafe for the requested manual-only lane:

| Finding | Baseline behavior | Required final evidence |
| --- | --- | --- |
| B-01, high | `openInGmail` reads Gmail credentials and sends SMTP; its advisory AI check can also invoke a provider. | Manual handoff reaches no mail, AI, inbox, paid-reveal, credential-resolution, or automatic retry seam. Configured provider stubs must throw if reached. |
| B-02, high | `requestEnrichmentGrant` chooses Apollo/ZoomInfo when keys exist. | Public reveal never consults paid keys or spends; only stubbed public retrieval is tested. |
| B-03, high | The lease update is unconditional and previously handed/sent rows remain admissible. | Concurrent handoff has one durable CAS winner; only the winner receives a URL. Reload and repeated requests withhold it. Prepare/approve cannot reset terminal handoff/sent state to reopen it. |
| B-04, high | Approval does not bind the exact currently displayed package/message; contacts can change independently. | Package before Message, expected digests, current content recomputation, acknowledgement, ownership, relationship and current eligible prospect/contact state are checked. Final SQL rechecks the consumed current authority. |
| B-05, high | Prepare/approve/handoff check only mailbox/domain/all suppression. | Email, domain, phone, contact, organization and all scopes apply consistently, using current contact/prospect values. Suppression added after approval wins before handoff and CSV materialization. |
| B-06, high | `tickSchedule` scans inbox, refreshes paid credits and starts scheduled discovery/hunts; mount invokes it. | Mount/reload/restored schedule flags remain inert. Morning work requires an explicit operator command. Legacy tick becomes inert. |
| B-07, medium | CSV includes non-suggestion contacts without complete prospect/suppression gates, and quoting leaves formulas executable. | Current ownership, approved prospect, allowed contact kind, valid mailbox and all suppression scopes gate each row. Cells protect leading formula/control characters and correctly quote commas, quotes and multiline content. |

The final review must inspect actual server-function SQL and UI call sites,
not infer safety from pure helper tests. Claim/approval stale-state rejection,
cross-workspace relationship attacks, and terminal-message reset paths are
specific adversarial cases. Preserve existing authentication and same-origin
request protection; authentication/database redesign belongs to Lane A.

## Final independent review

**No open high or medium finding in the reviewed Lane B local implementation.**
This is code review plus the bounded evidence below, not full application,
rendered-browser, provider, hosted, formal-plan, or owner acceptance.

The initial UI-only checkpoint was incomplete and had all baseline server
findings open. That checkpoint is superseded by this review of the implemented
server functions and SQL helper. Installation was initially blocked by the shell
proxy; the implementation owner subsequently obtained dependency installation.
No blocked install is counted as a pass.

The final implementation removes SMTP, inbox, paid-contact and advisory-provider
imports from `fns.ts`. Public reveal uses only the public retrieval seam and
rechecks approved prospect ownership and evidence URL before each insertion.
Package approval checks the displayed digest, recomputes it, and binds content
and current approved prospect in the update. Message digests include exact
package content/digest/approval timestamp, contact, prospect and mailbox.
Prepare, approval, handoff and CSV share the complete eligibility/suppression
predicate, with same-owner relationships and an allowlist of contact classes.

The handoff CTE atomically changes the message from acknowledged approved to
`handed_off` and inserts a deterministic manual-handoff event. Only the winning
statement returns a URL; it stores neither the URL nor a sent timestamp.
Terminal states and the durable event prevent preparation/approval from rearming
the row. Workspace DTOs always project `gmailUrl: null`, and the UI uses only the
winning response URL. Delivery remains explicitly unconfirmed.
The final UI reserves a blank popup during the click, clears its opener before
requesting the handoff, and consumes no handoff when popup creation is blocked.
It navigates only a returned URL with the exact `https://mail.google.com` origin
and closes the reserved window on a null response or error. Morning copy now
accurately describes an explicit manual run. These final changes introduce no
additional security finding on source review; no actual browser-popup claim is
made.

The shell no longer mounts a schedule mutation. The legacy tick rejects missing
explicit manual intent, then uses the existing manual hunt path; it has no
inbox, paid-credit, monthly-discovery or automatic-retry branch. Saving a schedule
flag cannot enable one. Restore still has no scheduler call. The permitted
explicit manual hunt may call its existing runner/provider; review and tests use
stubs, and this report does not authorize a real call. Workspace projection still
uses existing `connectionFlags`, which reads configured secrets internally;
the claim is that credentials cannot select SMTP or paid reveal, not that the
entire handler performs zero credential reads.

CSV uses current eligible rows from one query, deterministic prospect/contact
order, an explicit contact ID column, standard doubled-quote escaping and CRLF
records, and protects spreadsheet formula/control prefixes. No auth, database,
migration or CI file changed in the reviewed diff.

### Adversarial finding closed during review

**B-08, medium — validated contact identity could be transplanted before CAS.**
The first server candidate checked content/digest directly on the target row but
did not bind its package/prospect/contact IDs to the validated snapshot. An
independent in-memory PGlite experiment switched the contact to another eligible
same-mailbox contact between validation and CAS, then suppressed the original
contact. The candidate returned a URL and inserted one handoff event despite
consuming approval under a different contact identity. This was a reproduced
exact-binding violation, not a speculative provider effect.

The fix adds direct target predicates for all three IDs to message approval and
handoff. Two regression cases inject that transplant before each CAS; both now
deny, with zero handoff events. The direct target content/digest predicates also
remain present so a concurrently changed target cannot pass on a stale joined
message projection.

### Independently executed evidence

Node v24.19.0, from `operator/`:

- `node --experimental-strip-types scripts/manual-workflow.test.mjs`: exit 0,
  30/30. Uses checked migrations in disposable PGlite. Covers eight concurrent
  handoff requests yielding one URL/event, six suppression scopes after approval,
  suppression between validation and CAS, invalid/stale ownership/content/class/
  approval, terminal-state reset denial, CSV text safety and eligibility, both
  contact-transplant regressions, and durable-state reopen without rearming.
- `node scripts/manual-workflow-ui.test.mjs`: exit 0, 4/4 static source-contract
  cases. These prove source assertions, not rendering, navigation or popup behavior.
- `node scripts/manual-workflow-actions.test.mjs`: exit 0, 7/7. Transpiles the
  actual handler/middleware/isolation source into a VM with a stubbed framework,
  identity, database, workspace projection, hunt and helper/provider seams. Checks
  module-load inertness, explicit morning intent, handoff delegation, literal
  acknowledgement, public-only lookup, and same-site/cross-site foreign-Origin
  POST denial before database/provider work. This is handler-source execution,
  not the actual TanStack runtime, real identity, HTTP, browser or provider proof.
- `git diff --check`: exit 0.

Final independent focused total: **41/41**, all rerun after test formatting and
the popup/copy changes.

The single embedded PGlite instance exercises concurrent callers, not multiple
independent PostgreSQL sessions. No separate Neon/runtime concurrency claim is
made. The implementation owner's full test/type/lint/build results and any
browser evidence must be recorded in the lane record; they are not inferred from
the focused suites. The implementation agent reports canonical tests at 218 passing/18 failing,
with baseline failures, and full lint still failing; this independent review
does not claim canonical acceptance or independently establish that failure
classification. The reviewer executed no real provider, hosted,
secret-management or outbound action.

Reviewed uncommitted artifacts, relative to the exact baseline above:

| File | SHA-256 at review |
| --- | --- |
| `operator/src/lib/server/fns.ts` | `d29be0db1e0bb4732515e23630619e4b6cebd588978060a3b3942decaa9eb6a5` |
| `operator/src/lib/server/manual-workflow.ts` | `6464ccf08cbd14d8a8b18f990c0123871cbe369fb01d66714df72b4e155525c9` |
| `operator/scripts/manual-workflow.test.mjs` | `616f9a0995b20d534575514d901f3a076d082294511830b835d24c851a220a6d` |
| `operator/scripts/manual-workflow-ui.test.mjs` | `057bc753b79ec465d2419ea5d758a526e5af5b02d8111b84b77c1ba3a113c0c4` |
| `operator/scripts/manual-workflow-actions.test.mjs` | `2e0482088819e583ab2cd9b184834badae22a6921715abdeaf758ff234c96125` |
| `operator/src/components/outreach-view.tsx` | `1173c0430a389af0851fbe86d4db7de7bb25a70dcfd1f986de38e3a5f603ac8f` |
| `operator/src/components/brief-view.tsx` | `445b462da4ec058131155b28cb334ca90215758e0716fc928ed332430e0ea1eb` |
