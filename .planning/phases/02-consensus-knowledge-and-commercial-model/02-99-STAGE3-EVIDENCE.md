# Plan 02-99 Stage 3 execution evidence

**Captured:** 2026-09-03

**Status:** revised Stage 3A unreachable bootstrap and Stage 3B0 onboarding verified; stopped before Access

## Authorized scope

The owner authorized the checked Stage 3 runbook against source
`12f31959d763585494b830d4d17e7ae94bf2df3b`. The authorization permitted one
unreachable, undeployed bootstrap version, exact-owner Access while every URL
remained disabled, one private runtime candidate, and one final unreachable,
undeployed version. It did not permit a deployment, route, preview, request,
secret disclosure, data write, provider action, export, or outbound effect.

## Entry evidence

Before the attempted upload:

- the branch and draft PR source were current and the tracked worktree was
  clean;
- `npm ci`, the canonical production build and complete test suite, lint,
  production dependency audit, and Vinext compatibility check passed;
- the fresh private target candidate passed the Wrangler no-upload dry run;
- D1 contained the exact ten-row `0000`-`0009` journal, 92 application tables,
  206 explicit indexes, 149 triggers, all four expected schema/journal digests,
  zero application rows, clean quick/foreign-key checks, and no pending
  migration;
- R2 contained zero completed objects and zero bytes and retained disabled
  public access, no custom domain, no CORS/notification/lock rules, and only
  the provider default incomplete-multipart abort rule; incomplete multipart
  state remains unverified; and
- the Worker, version inventory, and deployment inventory were absent.

Private mapping, resource, account, and owner identity values remained outside
Git. The disposable bootstrap dry-run bundle contained no secret and was not a
hosted action.

## Provider rejection

The operator invoked the runbook's one permitted bootstrap command exactly
once with `workers_dev=false`, `preview_urls=false`, no routes, and empty Cron
triggers. Wrangler exited nonzero before creating the Worker. Its bounded error
states that a Worker must already exist before `versions upload` can be used
and instructs the operator to use `deploy` for initial creation.

No retry occurred. Current Cloudflare documentation confirms that the first
Worker upload must use C3 or `wrangler deploy`; `versions upload` fails for a
new Workers project. Either supported first-creation path creates a deployment,
which was explicitly outside this Stage 3 authorization and contradicts the
runbook's zero-deployment exit condition.

## Immediate read-only result

Post-failure reads prove:

| Surface | Result |
|---|---|
| Worker | absent |
| Versions | 0 |
| Deployments | 0 |
| Routes / reachable URLs | 0 |
| Access applications/policies created by this attempt | 0 |
| Secrets written | 0 |
| D1 journal | 10 rows, unchanged |
| D1 integrity | `quick_check=ok`; zero foreign-key violations |
| Sampled application rows | 0 |
| R2 completed objects / bytes | 0 / 0 |
| Application requests or traffic | 0 |
| Provider, export, schedule, or outbound effects | 0 |

The entry D1 inventory had already proved all 92 application tables empty; the
post-failure sampled zero-row check supplements, rather than replaces, that
entry evidence.

## Original required replan and owner decision

Stage 3 is incomplete. Do not retry `versions upload`, create Access, enter
secrets, or continue to runtime-candidate generation.

The next executable hosted path requires a reviewed runbook/evidence update
and a new explicit owner authorization for exactly one initial
`wrangler deploy` that retains `workers_dev=false`, `preview_urls=false`, zero
routes, and empty triggers. That revised path must acknowledge the resulting
unreachable deployment, update the Stage 3 verifier's expected lineage, and
re-prove zero reachability, D1/R2 state, and disabled effects before Access or
secret work. A generic `continue` or the prior Stage 3 authorization is not
sufficient.

This record is partial execution evidence, not a Plan 02-99 summary or Phase 2
acceptance.

## Revised Stage 3A authorization

Later on 2026-09-03, the owner explicitly authorized updating the runbook and
verifier and then performing exactly one initial `wrangler deploy` with
`workers_dev=false`, `preview_urls=false`, no routes, and no Cron triggers.
The authorization requires an immediate read-only verification stop before
Access, secrets, runtime-candidate generation, another upload, or any other
hosted write. The revised procedure is recorded in `02-99-STAGE3-RUNBOOK.md`.
No revised deployment result is claimed until a later section records its
sanitized read-only evidence.

The revised ten-case verifier suite, canonical production build and complete
test suite, lint, production dependency audit with zero findings, and Vinext
compatibility check at 100% passed before any revised hosted write.

## Revised Stage 3A terminal result

The revised source/runbook/verifier checkpoint was committed and pushed at
`e899b25bac9597470148339c3d6fcd69b8ce40c4`. A fresh private target candidate
was regenerated from that exact commit and build. Its digest was
`e55e9ccb7b62b97503793133fbb952c478146ffa0a3299348206677255c7633f`;
its mode-0600 expectation bound that digest and exact source. A no-upload
`wrangler deploy --dry-run` passed before the hosted command.

Entry reads again proved the Worker/version/deployment absent, all four D1
schema/journal digests exact, all 92 application tables empty, clean D1
integrity, zero completed R2 objects, disabled R2 public URL, no R2 custom
domain, CORS, notification, or lock rule, and only the recorded provider
default incomplete-multipart abort rule.

The operator then invoked exactly one `wrangler deploy` with the reviewed
target and bootstrap message. No retry occurred. Wrangler uploaded the static
assets and Worker, created one bootstrap version and its one 100% deployment,
and reported no deployed route targets. The command returned exit 1 only after
the upload, when its final PUT of the candidate's empty Cron list to the
schedule endpoint returned HTTP 403. Wrangler 4.116 constructs that request
body from `{ crons: [] }` as an empty array. The new Worker had no predecessor
schedule, and no nonempty Cron request was made; the failed empty update cannot
be claimed as positive provider schedule enumeration.

Immediate read-only evidence then proved:

| Surface | Result |
|---|---|
| Versions | exactly 1; bootstrap message/source; provider reports `has_preview=true` |
| Deployments | exactly 1; 100% bound to the bootstrap version |
| Version inventory digest | `97918df907e14084288e10609860ce88bf2bf4feefdcb12b4fae5a9f3d75152f` |
| Deployment inventory digest | `a61e15ce1eb2cbbff6bf0340d0564554d735a1a96282845770d0b75c4bfce1a2` |
| Public route/custom-domain targets | none reported or configured |
| `workers.dev` / preview URLs | disabled / disabled in the authenticated Worker Domains panel; exact candidate also sets both false |
| Routes / custom domains | none in the authenticated Worker Domains panel |
| Cron configuration | zero in the authenticated Worker Settings panel; exact candidate empty; empty PUT rejected 403 |
| D1 journal/schema/integrity | 10 rows; 92/206/149; four digests exact; clean |
| D1 application rows | 0 across all 92 application tables |
| R2 completed objects / bytes | 0 / 0 |
| R2 public surfaces/rules | unchanged private; no custom domain, public URL, CORS, notification, or lock rule |
| Access application, secrets, runtime candidate, later upload | none |
| Application request, provider/export/schedule/outbound effect | none |

The first digest-only bootstrap read established the one-version/one-deployment
lineage after its provider timestamp parser was locally corrected to accept
Cloudflare's observed six-digit RFC 3339 fractional seconds while retaining
exact calendar validation. A separate version read reported
`metadata.has_preview=true`. Cloudflare's API defines that field as whether the
version can be previewed; the authoritative Worker subdomain state separately
defines whether preview URLs are actually available. Official API guidance
also warns that the presence of a preview suffix does not imply a live preview
when `previews_enabled` is false.

The signed-in owner dashboard was therefore inspected read-only. Its Worker
Domains panel reports both the production Worker URL and Preview URLs disabled
and no custom domain or route. Its Settings panel reports no Cron triggers.
No switch was changed, no URL was derived or requested, and no second upload
occurred. This authoritative route-state evidence resolves the metadata
ambiguity: the version is preview-capable, but preview routing is disabled.

The verifier at source `5f9946f73e59e65f3801ae0f3dea4c88dc86bcff`
validates `has_preview` as typed version inventory rather than
misclassifying it as route state; reachability remains an independent provider
check as the runbook already requires. Its twelve focused cases and lint pass,
and the final live double-read accepts the exact one-version/one-deployment
lineage with source digest
`4e0bedc509cc590390cf146a69dad238daafe9575666becd6db8a3326bd7bba8`.
The digest-only receipt still discloses no provider identifiers or identity
values.

Revised Stage 3A has passed its unreachable bootstrap checkpoint and its
one-command authority is exhausted. Stage 3 and Plan 02-99 remain incomplete.

## Stage 3B0 onboarding result

The owner subsequently authorized the exact non-secret team name
`digitalrain-prospector`, Zero Trust Free, and the new-organization default
Cloudflare identity provider restricted to account members. The owner
personally completed Cloudflare's payment-detail step. No payment or owner
identity value was read into evidence or recorded in Git.

Read-only dashboard verification proved:

| Surface | Result |
|---|---|
| Zero Trust organization | active |
| Team name/domain | exact approved `digitalrain-prospector` team |
| Plan | Zero Trust Free; zero monthly price |
| Identity providers | exactly one Cloudflare provider |
| Provider restriction | **Restrict to account members** enabled |
| Access applications/policies created in 3B0 | 0 |
| Worker route/preview/Cron changes in 3B0 | 0 |
| Secrets, credentials, users, devices, DNS, Gateway, or WARP changes | 0 |
| Application requests or external effects | 0 |

Stage 3B0 is complete. Stop before Access, secrets, runtime-candidate
generation, another upload, route enablement, any application request, or any
effect. The exact next external decision is separate Stage 3B authorization
for the exact-owner Worker-level Access application while all Worker ingress
remains disabled.
