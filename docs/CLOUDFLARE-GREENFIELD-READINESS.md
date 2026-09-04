# Cloudflare greenfield deployment readiness

**Assessment date:** 2026-09-02
**Scope:** Direct deployment of the checked PROspector repository to a new
Cloudflare Workers, D1, and R2 environment
**Disposition:** **Stage 2 D1 migration complete and exactly verified; not ready to deploy**

This is a readiness specification, not deployment authority. On 2026-09-02 the
owner authorized Stage 1 creation of exactly one fresh D1 database and one
private R2 bucket in Eastern North America. Their exact account/resource
identities remain outside Git. Stage 1 performed no migration, upload,
target-bound configuration, Worker/version creation, route change,
Access-policy change, secret write, promotion, or application request. The
inaccessible original project remains retired and was not an input to this
path. Stage 2 later created an ignored target candidate, passed a no-upload dry
run, and initially stopped safely when `0008` failed before journaling. After
the importer repair, canonical preflight, regenerated private candidate,
no-upload dry run, independent review, and exact pre-apply reads passed. The
owner then authorized one exact apply of pending `0008` and `0009`; both
applied once. Immediate read-only evidence matches the expected 10-row journal
and all post-chain schema digests, shows zero rows across all 92 application
tables, clean integrity, no pending migration, and R2 still at zero completed
objects with private exposure. Incomplete multipart state remains unverified.

## Decision summary

A direct Cloudflare target is feasible, but the target configuration and
external acceptance gates must be closed before any reachable version is
uploaded:

1. **Fresh target resources exist and the repaired private candidate supplied
   the now-verified migration chain.** The application has
   target-neutral `DB` and `FILES` binding names and the generated manifest now
   resolves migrations to the checked `drizzle/` chain, but no reviewed
   production Wrangler configuration exists. The Vite config deliberately
   injects an invalid all-zero D1 UUID and `site-creator-*` placeholder names,
   so `dist/server/wrangler.json` remains a non-deployable build sentinel until
   a separately authorized configuration step supplies the new resources'
   identities. Sanitized Stage 2 proof records D1 at exact migration `0009`
   with zero application rows, clean integrity, no pending migration, an R2
   bucket with zero completed objects and disabled public access. Incomplete
   multipart state remains unverified. The older pre-repair candidate
   remains stale and must not be reused.
2. **Cloudflare owner identity is implemented but not target-proven.** The
   server-only adapter verifies the Access JWT signature against the configured
   team's rotating JWKS plus exact issuer, audience, dates, and bounded email.
   `TRUSTED_IDENTITY_PROVIDER=cloudflare-access` selects that path; missing,
   unknown, partial, or conflicting mode/configuration denies identity. Sites
   headers and `LOCAL_DEMO` cannot grant identity in Cloudflare mode. No real
   Access policy, issuer, audience, owner, or non-owner principal has been
   configured or proven. An independent adversarial code review is clean after
   requiring explicit provider mode, exact local-demo origin, single-flight
   JWKS refresh, same-key rotation, and a non-renewable stale-key deadline.
   The complete canonical test and lint gates, production dependency audit,
   and `vinext check` are green for this target-neutral code.

Do not use Wrangler's automatic framework detection to paper over these gaps.
Cloudflare documents that running `wrangler deploy` without a Wrangler file can
configure and deploy a detected framework interactively; this project instead
needs one reviewed, target-bound configuration so the exact resources and
exposure controls are known before any hosted write. ([Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/),
[automatic configuration](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/))

## Repository findings

These are findings from the checked repository, not claims about any
Cloudflare account:

| Surface | Checked repository state | Readiness consequence |
|---|---|---|
| Framework | `site/package.json` pins Next.js 16, Vinext, Vite, the Cloudflare Vite plugin, and Wrangler; `site/vite.config.ts` composes Vinext and the Cloudflare plugin. `vinext check` reports 100% compatibility (7 supported, 0 partial, 0 issues) after removal of the runtime Google-font CDN dependency. | The architecture matches Cloudflare's recommended Next.js-on-Workers direction. Vinext remains beta, so repeat the compatibility check against the exact release candidate. ([Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)) |
| Worker entry | `site/worker/index.ts` is an ES-module Worker entry and Vinext router; the build currently emits `site/dist/server/wrangler.json`. | A reviewed production config must drive the build, and the generated config must be inspected before upload. The Vite plugin generates a deployment `wrangler.json` with the built asset directory. ([Vite static assets](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/)) |
| D1 | Runtime code expects `env.DB`; the checked migration chain is `site/drizzle/0000_*.sql` through `0009_*.sql`. The generated manifest resolves `migrations_dir` back to that checked chain, while the local programmatic binding retains an all-zero database ID. | The owner-authorized greenfield D1 is freshly proven at exact migration `0009`, with clean integrity, exact post-chain digests, zero rows across all 92 application tables, and no pending migration. Candidate source `886b48b31119f76382535a06d4535e04aa049097` passed private preparation/no-upload dry run and supplied the exact migration bytes. Programmatic Vite config is not available to resource-oriented commands such as `wrangler d1`, so only the staged runbook may use the private target mapping. ([programmatic configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/programmatic-configuration/)) |
| R2 | Runtime code optionally expects `env.FILES`; `.openai/hosting.json` declares only target-neutral binding names. | One owner-authorized private R2 bucket exists outside Git with zero completed objects. Incomplete multipart state is not enumerable through Wrangler and remains unverified until the later R2 write-activation gate. The exhausted Stage 3A bootstrap binds it as `FILES` in one unreachable Worker while preserving disabled public exposure and zero object delta. `.openai/hosting.json` is not a Cloudflare target manifest. |
| Identity | `site/app/cloudflare-access.ts` verifies Access RS256 JWTs against the configured team JWKS, issuer, audience, dates, and email. `site/app/runtime-identity.ts` requires one explicit provider mode and denies missing, unknown, partial, or conflicting configuration, so Sites headers and `LOCAL_DEMO` cannot become a hosted fallback. | The local code blocker is closed. A real target still needs exact Access configuration, independent review, owner/non-owner proof, and `LOCAL_DEMO` must remain absent. |
| Secrets | Runtime requires `OWNER_SUBJECT_PEPPER` and `PILOT_OWNER_EMAIL`. The ignored `.dev.vars` contains only disposable localhost values. | Hosted values must be installed through Cloudflare bindings, never copied from `.dev.vars`, Git, logs, screenshots, or evidence files. |
| Effects | Runner ingress passes `runnerIngressEnabled: false`; profile/discovery schedules remain `blocked_missing_capability`; no Gmail or telephony adapter is composed. | Preserve these fail-closed states. Binding D1/R2 and proving owner access must not activate a schedule, provider, export, enrichment call, email, or phone action. |
| Migration proof | `npm run baseline:greenfield` proves only a disposable local database and explicitly makes no hosted claim. | It is necessary regression evidence, but it cannot prove a future D1 target is empty, migrated, private, or isolated. |

## Required production configuration

Before any migration, upload, Worker/version creation, or secret write, add
and independently review a dedicated greenfield Wrangler configuration (or an
equivalent generated config with a checked `configPath`). It must contain only the new
target's values and, at minimum:

The closed input/output and fail-closed rules are now pinned in
`.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-TARGET-CONFIG-CONTRACT.md`.
The document defines the owner-approved local CLI seam. The implementation
still grants no external authority and never invokes Wrangler itself.

The later private runtime assembly is separately pinned in
`.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-RUNTIME-CONFIG-CONTRACT.md`.
Its local generator consumes one exact target candidate and closed non-secret
Access metadata, then adds only Cloudflare Access mode/issuer/audience and the
two required secret names. It rejects public/effect drift and never reads a
secret value or invokes Wrangler. A target-specific runtime candidate does not
yet exist because Access has not been provisioned.

- a new Worker name, explicit `main`, compatibility date, and
  `nodejs_compat` flag;
- `DB` mapped to one newly created D1 `database_name` and `database_id`;
- `migrations_dir` mapped to the checked `drizzle` directory and a pattern that
  matches exactly `0000` through `0009`, in lexical order;
- `FILES` mapped to one newly created R2 bucket;
- `workers_dev: false` and `preview_urls: false` unless the owner deliberately
  chooses a `workers.dev` URL that is already protected by Access;
- no routes or custom domain until the Access policy exists and has been
  verified;
- an explicit empty Cron trigger collection and no queue, email, provider,
  service, or outbound binding; and
- required-secret declarations for every secret the final version needs.

Cloudflare recommends Wrangler files for normal application configuration and
notes that programmatic Vite configuration is not visible to resource CLI
commands. ([Vite programmatic configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/programmatic-configuration/))
An enabled `workers.dev` route is public unless protected with Access; a
dashboard-only disable can be reversed by a later Wrangler deployment if the
file does not also say `workers_dev: false`. ([workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/))

Run `vinext check`, the canonical repository tests/lint, `npm run build`, and a
Wrangler dry run before any upload. `wrangler deploy --dry-run --outdir ...`
builds the proposed Worker without deploying it, which permits inspection of
the exact bundle and generated config. ([Wrangler bundling](https://developers.cloudflare.com/workers/wrangler/bundling/),
[Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/))

The inspected generated config must have real new target bindings, the correct
asset directory, `preview_urls: false`, no public route, no Cron trigger, and no
placeholder or retired-project material. Only that generated config is a
candidate for `wrangler versions upload` or deployment.

## D1 creation, migration, and proof contract

Cloudflare D1 requires a Worker binding with `binding`, `database_name`, and
`database_id`. Cloudflare recommends addressing migration commands by the
database name, because the binding name can change. Its migration system reads
ordered SQL files, records applied names in `d1_migrations`, and supports a
custom `migrations_dir` and `migrations_pattern`. ([D1 getting started](https://developers.cloudflare.com/d1/get-started/),
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/))

Stage 1 created one new D1 database and completed steps 1-2 below. Stage 2
completed steps 3-5: after the initial `0008` rollback, one separately
authorized exact-candidate apply committed `0008` and `0009`, and immediate
read-only proof matched the checked post-chain contract without replacing or
recreating that database:

1. Record the authenticated Cloudflare account identity and new database
   identity outside Git, without tokens or secrets.
2. **Before any migration**, query the remote database read-only with
   `wrangler d1 execute <database-name> --remote`. Record the allowlisted
   `sqlite_schema`/`PRAGMA table_list` result and prove that no application
   table, trigger, index, or `d1_migrations` row exists. Cloudflare may expose
   internal tables; they must be identified as provider-owned rather than
   misreported as application state. D1 supports schema inspection and
   `PRAGMA foreign_key_check` through Wrangler. ([D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/))
3. **Locally complete:** the checked `0000`-`0009` SHA-256 digests are retained
   in `.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-MIGRATION-MANIFEST.md`.
   Recompute and independently review them against the exact release candidate
   before any remote apply. The D1 journal records migration names, not the
   review digest, so the manifest remains separate evidence.
4. **Complete:** list unapplied migrations, then apply them by the immutable database name
   with `wrangler d1 migrations apply <database-name> --remote` using the
   reviewed config. A failed migration rolls back that migration while earlier
   successful migrations remain; therefore any failure stops the release and
   requires a complete journal/schema inspection before another attempt. That
   inspection is recorded in `02-99-STAGE2-EVIDENCE.md`; canonical preflight,
   regenerated candidate/no-upload dry run, fresh reinspection, and the one
   owner-authorized apply of pending `0008`/`0009` are complete.
   ([D1 Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/))
5. **Complete for Stage 2:** after apply, prove: no unapplied files; the exact expected migration-journal
   names; expected application tables/triggers/indexes; `PRAGMA quick_check`
   returns `ok`; `PRAGMA foreign_key_check` is empty; and every application
   table has zero rows except any specifically reviewed migration-owned static
   metadata. The checked local expected counts and canonical digests are in
   `.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-EXPECTED-SCHEMA.md`;
   they are comparison material, not hosted proof. At minimum the remote count
   set must cover `workspaces`,
   `phase_activation_gates`, `product_discovery_runs`, all prospect/run/
   schedule/assignment tables, enrichment grants/reservations/receipts,
   contact observations, suppressions, CSRF tokens, audit events, and every
   private-proof table.
6. Repeat the same allowlisted count and schema digest after version upload,
   after outsider denial, and after the bounded owner read-only smoke. Any
   unexpected row or schema delta fails Plan 02-99.

A Worker version does not version or roll back D1 state, so code rollback is
not database rollback evidence. ([Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/))

## R2 creation, binding, and proof contract

Stage 1 created one fresh bucket but did not bind it. It has zero objects, no
custom domain, and disabled `r2.dev` access. Keep both public mechanisms
disabled when it is later bound as `FILES`. R2 buckets are private by default.
([Create R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/),
[public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/))

Bucket existence is not emptiness evidence. Before upload, after upload, after
outsider denial, and after the owner smoke, perform a read-only List Objects
operation and paginate until the provider says the listing is not truncated;
the total must remain zero. The Workers binding `list()` API and Cloudflare R2
Objects API provide this operation. ([R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[R2 List Objects API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/))

Do not run the existing `/api/capability-probe` during zero-effect acceptance:
by design it performs a controlled R2 put/read/digest/delete/absence cycle and
writes an audit event. That is a later, separately authorized durability proof,
not empty-target evidence.

## Owner-only access and application identity

Cloudflare Access can protect a Worker at hostname/path, Worker, or account
level. Use one Worker-level or hostname policy whose Allow rule contains the
single exact owner email; do not use Everyone, an email domain, all account
members, a broad group, Bypass, or an unprotected preview. Access policies are
the edge admission control, while PROspector's `PILOT_OWNER_EMAIL` comparison
remains the independent application-level check. ([Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/),
[Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/))

A sanitized read-only capability check on 2026-09-02 found that the active
Wrangler OAuth profile is authenticated for the Worker/D1/zone operations used
through Stage 2 but does not include Access Apps and Policies read/write.
Cloudflare requires that separate permission to manage Access applications and
policies through the API. No credential was displayed or changed. Stage 3 must
therefore use the owner-authenticated dashboard or a separately owner-created
least-privilege Access credential; never extract or broaden the existing
Wrangler credential. ([Cloudflare API permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/))

The implementation cannot simply adopt `ctx.access`: Cloudflare documents that
Workers with Static Assets execute behind an internal router that does not pass
`ctx.access` to the user Worker, and the Vite plugin can add Static Assets even
when the input config omits them. ([Vite static assets](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/),
[Cloudflare Access limitations](https://developers.cloudflare.com/workers/configuration/cloudflare-access/))

The checked server-only Cloudflare identity adapter and adversarial local tests
now enforce the following contract:

- requires `Cf-Access-Jwt-Assertion` on every ordinary hosted request;
- verifies the signature against the Access team's rotating JWKS and verifies
  both issuer and exact application audience;
- accepts a bounded, normalized email only from the verified JWT payload;
- passes that identity to the existing `admitPilotOwner` comparison;
- rejects missing, malformed, expired, wrong-issuer, wrong-audience,
  wrong-email, and forged raw email headers without reading or mutating D1/R2;
- never enables `LOCAL_DEMO` outside Vite development on loopback; and
- disables the Sites-specific trusted-header path for the Cloudflare target.

Cloudflare explicitly requires a Worker behind Access to validate the
`Cf-Access-Jwt-Assertion` signature, issuer, and audience; merely trusting a
header is insufficient. The required non-secret configuration is the Access
team domain and application audience. ([Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/))

Hosted proof must then show one owner succeeds and one independently signed-in
non-owner is denied at Access and at the application boundary, with identical
D1 counts/schema and a zero-completed-object R2 listing before and after.
Incomplete multipart state must be closed before R2 write activation. Local mocks cannot
substitute for that real-principal evidence.

## Variables and secrets

Required final bindings are:

| Name | Classification | Rule |
|---|---|---|
| `DB` | D1 binding | New greenfield D1 only. |
| `FILES` | R2 binding | New private greenfield bucket only. |
| `PILOT_OWNER_EMAIL` | Privacy-sensitive configuration | Prefer a Cloudflare secret even though it is not an authentication credential; never record its value in Git/evidence. |
| `OWNER_SUBJECT_PEPPER` | Secret | At least 32 random characters; never reveal it. Do not rotate without an explicit subject/workspace migration. |
| `TRUSTED_IDENTITY_PROVIDER` | Non-secret target configuration | Must be exactly `cloudflare-access` for this target; missing, unknown, `sites`, or `local-demo` denies the Cloudflare path. |
| `CLOUDFLARE_ACCESS_ISSUER` | Non-secret target configuration | Exact `https://<team>.cloudflareaccess.com` issuer used by the JWT verifier. |
| `CLOUDFLARE_ACCESS_AUDIENCE` | Non-secret target configuration | Exact Access application audience used by the JWT verifier. |
| `LOCAL_DEMO` | Forbidden hosted binding | Must be absent, not `0`, `false`, or another sentinel. |
| Provider, Gmail, telephony, runner, model, export, and contact-attestation values | Deferred | Must be absent until their owning plans are separately authorized. |

Cloudflare plaintext variables are visible configuration and must not hold
sensitive material; deployed secrets are encrypted/hidden. A Wrangler config
can declare required secret names so upload/deploy fails if they are absent.
`wrangler secret put` immediately creates and deploys a Worker version, whereas
`wrangler versions secret put` creates a version without promoting it; use the
versioned path during staged acceptance. ([environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/),
[Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/))

Never use the checked `.dev.vars.example` values in Cloudflare. Never emit
secret values through `wrangler whoami`, config dumps, build logs, screenshots,
test fixtures, evidence JSON, or this repository.

## Zero-effect upload and promotion sequence

This is the required evidence order after the code/config blockers are closed
and the owner separately authorizes each external action:

The executable Stage 3A subset is pinned in
`.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-STAGE3-RUNBOOK.md`.
Because Cloudflare will not create a new Worker with `versions upload`, the
revised procedure permits exactly one initial target-only `wrangler deploy`.
Its configuration disables `workers.dev`, preview URLs, routes, and Cron, so
the resulting one-version/one-deployment shell has no public or scheduled
ingress. The checked `greenfield:stage3:verify -- verify-bootstrap` command
then double-reads only version/deployment JSON, requires that exact 100%
bootstrap lineage, and emits a digest-only receipt. The operator must stop
after independent exposure and D1/R2 reads. Access, secrets, a runtime
candidate, another upload, route enablement, application requests, and
real-principal proof remain separately authorized.

**2026-09-03 provider stop:** All Stage 3 entry gates passed, but Cloudflare
rejected the one permitted first `versions upload` before Worker creation.
Current provider behavior requires C3 or `wrangler deploy` for the first
Worker upload, and that creates a deployment prohibited by this sequence. The
command was not retried. Read-only checks proved zero Worker, versions,
deployments, routes, requests, or D1/R2 delta. This remains historical evidence.
The owner later authorized the deployment-aware replacement: exactly one
initial unreachable deployment followed by read-only verification and a stop
before Access, secrets, or further uploads. That one command is now exhausted:
it created the one-version/one-deployment shell and no route target, then
returned nonzero on the forbidden empty-schedule PUT. Authenticated read-only
dashboard evidence proves both Worker URL switches disabled, no custom
route/domain, and zero Cron triggers. Version preview-capability metadata is
not enabled route state, so the corrected verifier accepts the exact lineage;
D1/R2 zero-delta reads passed. See
`02-99-STAGE3-EVIDENCE.md`.

1. **Complete:** authenticate the owner-confirmed Cloudflare account before any
   create command; no temporary/claim deployment was used.
2. **Complete through Stage 2:** create one new D1 and one new R2 resource,
   prove D1 empty before migration and R2 private with zero completed objects,
   then apply and verify the exact D1 migration chain. Incomplete multipart
   state remains unverified until the later R2 write-activation gate.
3. Build, run `vinext check`, run canonical test/lint/audit, inspect the
   generated Wrangler config, and run Wrangler dry-run. These steps perform no
   hosted application write.
4. **Complete and stopped:** deploy one target-only bootstrap version exactly once with no route,
   preview, Access variable, secret declaration, or Cron trigger. Verify the
   resulting single 100% deployment and repeat D1/R2/exposure reads, then stop.
5. **Stage 3B0 complete; Stage 3B prepared, action-time confirmation pending:** the approved
   `digitalrain-prospector` Zero Trust Free organization now exists with the
   default Cloudflare identity provider restricted to account members. From
   that Worker's **Access** tab, protect **All traffic** and independently
   review a dedicated exact-owner Emails Allow policy with Cloudflare-only
   login. Saving that reusable policy does not attach it to the Worker; the
   separate **Apply Access** operation must be confirmed and verified. Set
   and verify a one-hour application duration plus a direct or inherited
   one-hour policy duration while both production and preview URLs remain
   disabled. The policy menu observed during preparation lacks a direct
   one-hour option; inheritance alone proves no effective duration. Stop if
   the one-hour application setting is unavailable or Cloudflare requires
   making either surface reachable first. No policy is saved or attached yet.
6. Generate the target-specific runtime candidate, then run all local gates and
   a no-upload Wrangler dry run with owner-held secret values outside Git.
7. Upload one final **undeployed** version with the required secrets supplied
   through the non-promoting `versions upload --secrets-file` path and with
   `workers_dev`, preview URLs, routes, and Cron triggers disabled. Cloudflare
   distinguishes version upload from deployment; `wrangler deploy` instead
   creates a version and immediately sends it to 100% of traffic. ([Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/))
8. Enable only the Access-protected production `workers.dev` route, promote
   only the reviewed final version, and capture its version/deployment ID and
   source/config digest. Leave
   previews, public `workers.dev`, and Cron triggers disabled.
9. Prove an unauthenticated request and a real non-owner principal are denied
   without invoking the application or changing D1/R2.
10. Perform only the checked owner read-only smoke; do not initialize a
   workspace or call mutation/probe routes. Re-run D1 and R2 inventories.
11. Inspect Workers deployment status and logs for only the expected requests,
    no unexpected subrequests, and no scheduled invocation. Workers records
    versions/deployments separately from D1/R2 state. ([deployment status](https://developers.cloudflare.com/workers/wrangler/commands/workers/),
    [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/))
12. Obtain independent review and the explicit Plan 02-99 human acceptance.
    Only then may a later plan authorize bootstrap or a controlled R2
    durability proof.

The evidence packet must be sanitized and contain identifiers/digests/counts,
not raw rows, object keys, owner email, JWTs, cookies, Access headers, tokens,
or secrets. Any unexpected D1/R2 delta, public route, preview URL, trigger,
outbound request, identity ambiguity, migration failure, or log gap is a stop.

## Unresolved owner decisions

No default is inferred for these external choices:

1. **Cloudflare account and operator:** resolved for Stage 1 by the owner's
   explicit account confirmation; exact identity remains outside Git. Any
   additional operator still requires explicit authority.
2. **Private URL:** Stage 3 now defaults to Worker-level Access with every URL
   disabled, and Stage 4 may enable only the Access-protected production
   `workers.dev` URL. The repository's published `digitalrain.ai` domain was
   not Cloudflare-delegated when checked on 2026-09-02, so this work must not
   change or depend on its DNS. A future custom domain is separate scope.
3. **Access identity provider:** resolved for onboarding as the default
   Cloudflare identity provider restricted to account members. The future
   Access policy must still prove the exact owner and one real non-owner
   negative principal.
4. **Configuration custody:** whether the non-secret target config is committed
   or generated from an owner-controlled release manifest. Secret values are
   never committed in either case.
5. **Data location:** Stage 1 used Eastern North America for both resources.
   Any Canadian residency or contractual requirement must still be decided
   before migration or real data.
6. **First reachable scope:** Plan 02-99 empty-target/read-only acceptance only,
   or a later separately reviewed bootstrap. This document recommends the
   empty read-only checkpoint first.
7. **Observability retention:** the approved Workers Logs retention/sampling
   policy and evidence reviewer. Logs must not capture JWTs, cookies, emails,
   raw rows, object keys, or secrets.

## Readiness exit criteria

The repository-level target-identity, migration-path, and runtime-font CDN
defects are closed by
`site/tests/greenfield-deployment-independence.test.mjs`; `vinext check`
reports 100% compatibility. The direct Cloudflare path is ready for a
separately authorized Plan 02-99 run
only when all of the following are true:

- the checked Access JWT identity adapter and adversarial tests are committed
  and independently reviewed;
- a production Wrangler config contains no placeholder, retired-project,
  Sites-only, local-demo, provider, route, preview, or trigger ambiguity;
- `vinext check`, canonical tests, lint, audit, build, and Wrangler dry-run pass
  against the exact candidate;
- an owner-approved runbook produces the D1 empty-before, R2 zero-completed-
  object/private, migrated-schema,
  zero-row, owner-only, real-principal-denial, and zero-effect evidence above;
- the target remains unreachable until Access is proven; and
- the owner explicitly authorizes the named greenfield target and accepts the
  sanitized evidence tuple.

The accurate status is **Stage 2 D1 migration is complete and exactly verified
at `0009`; the D1 has clean integrity and zero application rows, R2 has zero
completed objects and private exposure while incomplete multipart state
remains unverified, and no migration remains pending. Revised Stage 3A has
passed and exhausted its one command with one bootstrap version/deployment,
production/preview routes disabled, no custom route/domain, zero Cron, and no
D1/R2 delta. Stage 3B0 is also complete with the approved Zero Trust Free team
and restricted default Cloudflare identity provider. The empty-schedule PUT
was forbidden and was not retried; the zero-Cron state was independently
verified read-only. The Worker Access application/policy, secrets, a runtime
candidate, another upload, route enablement, application requests,
real-principal work, and effects remain separately gated**.
