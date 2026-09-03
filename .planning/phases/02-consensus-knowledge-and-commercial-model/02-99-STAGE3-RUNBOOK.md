# Plan 02-99 Stage 3 private-runtime runbook

**Captured:** 2026-09-02

**Status:** checked operator procedure; execution requires separate owner authorization

## Scope

Stage 3 may upload one target-only undeployed bootstrap version to create the
otherwise unreachable Worker, enable exact-owner Worker-level Cloudflare
Access, generate one owner-private runtime candidate, and upload one final
undeployed Worker version with required secrets. It must finish with no route,
no custom domain attachment, disabled `workers.dev`, disabled preview URLs, no
deployment, no application request, and no application row or R2 object
change.

This runbook does not authorize its own execution. It does not authorize Stage
4 routing/deployment, owner or outsider requests, workspace bootstrap, R2
probe, real data, provider setup, prospecting, enrichment, Gmail, telephony,
export, schedule, or outbound effect.

## Entry evidence

Before starting, require all of the following:

1. The checked branch is clean at one exact pushed commit and its draft PR is
   current.
2. The Stage 2 D1 journal, schema digests, integrity results, zero application
   rows, and private zero-completed-object R2 evidence still match
   `02-99-STAGE2-EVIDENCE.md`.
3. Public DNS must not be assumed to be under Cloudflare control. The
   repository's published `digitalrain.ai` domain was delegated to registrar
   nameservers when checked on 2026-09-02, so Stage 3 must not change its DNS or
   depend on a custom hostname.
4. The owner authorizes **Stage 3** against the exact source and reviewed
   Worker/resource mapping.
5. The operator uses the owner-authenticated dashboard or a separately
   owner-created least-privilege credential with Access Apps and Policies
   write. The active Wrangler OAuth profile is insufficient and must not be
   extracted, broadened, rotated, or replaced automatically.

Any mismatch stops with no Access, secret, or Worker write.

## 3A — Create the unreachable Worker shell

From the exact reviewed source and target-only candidate, first complete the
canonical local gates and a no-upload dry run. Then, under the explicit Stage 3
authorization, run exactly one non-promoting upload:

```sh
npx wrangler versions upload \
  --config .wrangler/<exact-target-candidate>.json \
  --strict \
  --message "Plan 02-99 Stage 3 unreachable bootstrap"
```

The target-only candidate has `workers_dev=false`, `preview_urls=false`, no
routes, empty Cron triggers, no Access variables, and no secret declarations.
The upload may create the named Worker and one version, but it must create no
deployment or reachable URL. Do not use `wrangler deploy`, `--preview-alias`,
the dashboard editor, Quick Edit, or a route/custom-domain action.

If the upload fails or its result is ambiguous, do not retry. Inspect versions,
deployments, routes, D1, and R2 read-only and stop.

## 3B — Create the exact-owner Worker-level Access boundary

In the owner-authenticated Cloudflare dashboard:

1. Open **Workers & Pages**, select the exact new Worker, then open **Settings
   → Domains & Routes**.
2. For the production `workers.dev` URL, select **Enable Cloudflare Access**
   while the `workers.dev` route remains disabled. Do not enable Preview URLs.
   If Cloudflare requires making either URL reachable before Access can be
   enabled, stop without changing the route.
3. Open **Manage Cloudflare Access** and configure one Allow policy whose
   Include selector is the single exact owner email.
4. Do not use Everyone, an email domain, all account members, a reusable broad
   group, Bypass, or Service Auth. Use only an owner-approved identity provider
   and a bounded pilot session duration. Do not add the future non-owner
   negative-test principal.
5. Save and independently re-open the Worker and Access application. Verify
   the exact Worker, production-only protection, single-email Allow rule,
   policy precedence, session duration, and absence of Bypass/broad rules.
6. Record only the non-secret application audience and exact
   `https://<team>.cloudflareaccess.com` issuer in an owner-only mode-0600 JSON
   file below `site/.wrangler/`. Also bind that file to the current outer
   repository commit and exact target-candidate SHA-256 as required by
   `02-99-RUNTIME-CONFIG-CONTRACT.md`.

Do not create DNS, enable `workers.dev`, create a Worker route/custom domain, or
enable a preview. Do not record the owner email, token, cookie, JWT, recovery
value, or credential in Git, chat, screenshots, logs, or evidence.

Stop if Access cannot be enabled while the Worker remains unreachable, if the
application cannot be created without broad access, or if its audience/issuer
cannot be verified.

## 3C — Generate and review the private runtime candidate

From `site/`, after rebuilding the exact checked source and regenerating a
fresh target candidate, run:

```sh
npm run greenfield:runtime:prepare -- prepare \
  --target .wrangler/<exact-target-candidate>.json \
  --access .wrangler/<exact-access-metadata>.json \
  --output .wrangler/<exact-runtime-candidate>.json
```

Require mode `0600`, a sanitized digest-only receipt, and independent review
of the output. The candidate must contain exactly one `DB`, one `FILES`, the
three Cloudflare Access variables, and required secret names
`OWNER_SUBJECT_PEPPER` and `PILOT_OWNER_EMAIL`. It must contain no secret value,
`LOCAL_DEMO`, route, public preview, Cron trigger, provider, Gmail, telephony,
export, schedule, or effect binding.

Create a separate ignored mode-0600 secrets file containing only the two
required values. Generate the subject pepper locally with cryptographically
secure randomness and at least 32 random bytes. Never print either value or
paste it into chat. Do not rotate an existing pepper; this greenfield target
must receive its first value exactly once.

## 3D — Complete local no-upload gates

Against the exact candidate and build, require:

1. `npm test`;
2. `npm run lint`;
3. `npm audit --omit=dev` with zero production findings;
4. `npx vinext check` at 100% compatibility; and
5. `npx wrangler versions upload --config <runtime-candidate> --secrets-file
   <private-secrets-file> --strict --dry-run --outdir <ignored-private-dir>`.

Inspect the dry-run output and generated metadata. Confirm source/config/build
digests, exact bindings, disabled public exposure, empty triggers, absence of
effect bindings, and no secret material in output. Delete only the disposable
dry-run bundle after its sanitized digests are recorded.

Any failure, warning about a public route/preview, resource mismatch, secret
leak, or build drift stops before upload.

## 3E — Upload the final unreachable, undeployed version

Only under the same explicit Stage 3 authorization, run one command from the
exact reviewed source and private files:

```sh
npx wrangler versions upload \
  --config .wrangler/<exact-runtime-candidate>.json \
  --secrets-file .wrangler/<private-secrets-file> \
  --strict \
  --message "Plan 02-99 Stage 3 unreachable private candidate"
```

This is the second and final Stage 3 hosted write. It must create one version
but no deployment. Do not use `wrangler deploy`, `wrangler secret put`, a
preview alias, a route, or a custom domain. If the command fails or its result
is ambiguous, do not retry; inspect versions, deployments, routes, Access, D1,
and R2 read-only first.

## 3F — Read-only terminal evidence

Immediately prove and record only sanitized evidence for the exact tuple:

- the bootstrap and final version IDs plus source/config/build digests;
- zero deployments/traffic for both versions;
- `workers_dev=false`, `preview_urls=false`, zero routes/custom domains, and
  empty Cron triggers;
- the exact Access application audience/issuer digests and independently
  reviewed single-owner Allow policy, without owner identity values;
- required secret names present with values hidden;
- the same ten D1 migration rows, four post-chain schema digests, clean
  integrity, and zero rows across all 92 application tables;
- R2 still private with zero completed objects and no custom domain, `r2.dev`,
  CORS, notification, or lock rule; and
- no application request, log event caused by traffic, provider call, export,
  schedule, or outbound effect.

Incomplete R2 multipart state remains unverified and cannot be reported as
zero. Any unexpected deployment, route, request, D1/R2 delta, trigger, public
surface, or secret exposure fails Stage 3 and stops the release.

## Exit and next authorization

Stage 3 ends with two unreachable undeployed versions and an independently
reviewed exact-owner Worker-level Access boundary. It does not complete Plan
02-99.

Stage 4 requires a new explicit authorization to enable only the Access-
protected production `workers.dev` route, deploy only the exact final Stage 3
version, prove unauthenticated and real non-owner denial, perform the bounded
owner read-only smoke, repeat D1/R2 zero-state evidence, review logs, and obtain
terminal owner acceptance. A future custom domain remains a separate decision;
do not change `digitalrain.ai` DNS under this runbook. No Stage 4 action may
inherit Stage 3 authority.
