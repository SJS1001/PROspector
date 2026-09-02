# Cloudflare greenfield deployment readiness

**Assessment date:** 2026-09-02
**Scope:** Direct deployment of the checked PROspector repository to a new
Cloudflare Workers, D1, and R2 environment
**Disposition:** **Stage 1 resources provisioned; not ready to deploy**

This is a readiness specification, not deployment authority. On 2026-09-02 the
owner authorized Stage 1 creation of exactly one fresh D1 database and one
private R2 bucket in Eastern North America. Their exact account/resource
identities remain outside Git. Stage 1 performed no migration, upload,
target-bound configuration, Worker/version creation, route change,
Access-policy change, secret write, promotion, or application request. The
inaccessible original project remains retired and was not an input to this
path.

## Decision summary

A direct Cloudflare target is feasible, but the target configuration and
external acceptance gates must be closed before any reachable version is
uploaded:

1. **Fresh target resources now exist, but a real target configuration does
   not.** The application has
   target-neutral `DB` and `FILES` binding names and the generated manifest now
   resolves migrations to the checked `drizzle/` chain, but no reviewed
   production Wrangler configuration exists. The Vite config deliberately
   injects an invalid all-zero D1 UUID and `site-creator-*` placeholder names,
   so `dist/server/wrangler.json` remains a non-deployable build sentinel until
   a separately authorized configuration step supplies the new resources'
   identities. Sanitized Stage 1 proof records an empty D1 with no migration
   journal, an empty R2 bucket, and disabled R2 public access.
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
| D1 | Runtime code expects `env.DB`; the checked migration chain is `site/drizzle/0000_*.sql` through `0009_*.sql`. The generated manifest resolves `migrations_dir` back to that checked chain, while the local programmatic binding retains an all-zero database ID. | One owner-authorized empty greenfield D1 exists outside Git. The checked CLI can now generate one ignored target-bound candidate from its owner-private mapping, but no remote migration evidence exists yet. Programmatic Vite config is not available to resource-oriented commands such as `wrangler d1`, so the generated candidate must be used only through the staged runbook. ([programmatic configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/programmatic-configuration/)) |
| R2 | Runtime code optionally expects `env.FILES`; `.openai/hosting.json` declares only target-neutral binding names. | One owner-authorized empty private R2 bucket exists outside Git. The checked CLI can bind it as `FILES` in one ignored candidate while preserving disabled public exposure; no object or hosted binding has been created. `.openai/hosting.json` is not a Cloudflare target manifest. |
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

Stage 1 created one new D1 database and completed steps 1-2 below. A separately
authorized migration stage must continue this evidence order without replacing
or recreating that database:

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
4. List unapplied migrations, then apply them by the immutable database name
   with `wrangler d1 migrations apply <database-name> --remote` using the
   reviewed config. A failed migration rolls back that migration while earlier
   successful migrations remain; therefore any failure stops the release and
   requires a complete journal/schema inspection before another attempt.
   ([D1 Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/))
5. After apply, prove: no unapplied files; the exact expected migration-journal
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
D1 counts/schema and an empty R2 listing before and after. Local mocks cannot
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

1. **Complete:** authenticate the owner-confirmed Cloudflare account before any
   create command; no temporary/claim deployment was used.
2. **Partially complete:** create one new D1 and one new R2 resource and prove
   both empty/private. Applying and verifying the exact migration chain remains
   separately gated.
3. Build, run `vinext check`, run canonical test/lint/audit, inspect the
   generated Wrangler config, and run Wrangler dry-run. These steps perform no
   hosted application write.
4. Create or upload an **undeployed** version with `workers_dev`, preview URLs,
   routes, and Cron triggers disabled. Cloudflare distinguishes version upload
   from deployment; `wrangler deploy` instead creates a version and immediately
   sends it to 100% of traffic. ([Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/))
5. Install required secrets through the non-promoting versions workflow, then
   upload the exact final version if that changes its version identity.
6. Create the exact-owner Access application/policy and independently review
   it. Keep the Worker unreachable while this is incomplete.
7. Attach only the reviewed private route, promote only the reviewed version,
   and capture its version/deployment ID and source/config digest. Leave
   previews, public `workers.dev`, and Cron triggers disabled.
8. Prove an unauthenticated request and a real non-owner principal are denied
   without invoking the application or changing D1/R2.
9. Perform only the checked owner read-only smoke; do not initialize a
   workspace or call mutation/probe routes. Re-run D1 and R2 inventories.
10. Inspect Workers deployment status and logs for only the expected requests,
    no unexpected subrequests, and no scheduled invocation. Workers records
    versions/deployments separately from D1/R2 state. ([deployment status](https://developers.cloudflare.com/workers/wrangler/commands/workers/),
    [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/))
11. Obtain independent review and the explicit Plan 02-99 human acceptance.
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
2. **Private URL:** a custom domain with `workers_dev: false`, or an Access-
   protected `workers.dev` URL. Custom domain is the safer production default;
   either choice must be private before promotion.
3. **Access identity provider:** the IdP that can prove the exact owner and one
   real non-owner negative principal.
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
- an owner-approved runbook produces the D1/R2 empty-before, migrated-schema,
  zero-row, owner-only, real-principal-denial, and zero-effect evidence above;
- the target remains unreachable until Access is proven; and
- the owner explicitly authorizes the named greenfield target and accepts the
  sanitized evidence tuple.

Until then, the only accurate status is **Stage 1 greenfield resources are
empty and private; the Stage 2 local target-candidate seam is validated, while
remote migration evidence and every later identity/deployment write remain
pending their exact staged authority**.
