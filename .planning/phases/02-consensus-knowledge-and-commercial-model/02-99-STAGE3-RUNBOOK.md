# Plan 02-99 Stage 3 private-runtime runbook

**Captured:** 2026-09-02

**Status:** revised 3A verified unreachable; 3B0 verified complete; stopped before Access

## Scope

Stage 3A may perform exactly one initial `wrangler deploy` against the reviewed
target-only candidate to create the otherwise unreachable Worker. Cloudflare
will create one version and one 100% deployment, but the candidate must keep
`workers_dev=false`, `preview_urls=false`, zero routes/custom domains, and
empty Cron triggers. The operator must then stop and perform only read-only
verification. With no route, preview URL, or trigger, the deployment has no
public or scheduled ingress.

Later Stage 3 steps may enable exact-owner Worker-level Cloudflare Access,
generate one owner-private runtime candidate, and upload one final undeployed
Worker version with required secrets, but those steps are not part of the
current authorization. They require a separate continuation authorization
after the 3A stop evidence is reviewed.

This runbook records the owner's exact 2026-09-03 revised Stage 3A
authorization. It does not authorize Access, secrets, another upload, Stage 4
routing/deployment, owner or outsider requests, workspace bootstrap, R2 probe,
real data, provider setup, prospecting, enrichment, Gmail, telephony, export,
schedule, or outbound effect.

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
4. The owner authorizes **revised Stage 3A** against the exact source and
   reviewed Worker/resource mapping, explicitly naming the one unavoidable
   initial deployment and the mandatory read-only stop.
5. The active Wrangler profile can create and inspect the Worker. Access Apps
   and Policies permission is not required for 3A because Access is explicitly
   outside this authorization.

Any mismatch stops with no Access, secret, or Worker write.

## 3A — Create and verify the unreachable Worker shell

The first zero-deployment `versions upload` attempt was rejected before Worker
creation and was not retried. Read-only evidence proved that attempt caused no
hosted change. The owner has now separately authorized the required
deployment-aware replacement below.

From the exact reviewed source and regenerated target-only candidate, first
complete the canonical local gates and a no-upload `wrangler deploy --dry-run`.
Then run exactly one initial upload command:

```sh
npx wrangler deploy \
  --config .wrangler/<exact-target-candidate>.json \
  --strict \
  --message "Plan 02-99 Stage 3 unreachable bootstrap"
```

The target-only candidate has `workers_dev=false`, `preview_urls=false`, no
routes, empty Cron triggers, no Access variables, and no secret declarations.
The command may create only the named Worker, one version, and the one required
100% deployment. It must create no reachable URL or scheduled ingress. Do not
use `--preview-alias`, the dashboard editor, Quick Edit, a route/custom-domain
action, or any other write.

Immediately create an owner-only mode-0600 expectation file below
`site/.wrangler/` containing exactly `sourceCommit` and
`targetCandidateDigest`, then run:

```sh
npm run greenfield:stage3:verify -- verify-bootstrap \
  --config .wrangler/<exact-target-candidate>.json \
  --expectation .wrangler/<exact-bootstrap-expectation>.json
```

The verifier double-reads versions and deployments and requires exactly one
Wrangler-created bootstrap version and exactly one 100% deployment bound to
that version and message. It emits only digests and counts. Independently
repeat the D1/R2 zero-state checks and confirm the exact candidate still has
disabled `workers.dev`, disabled preview URLs, no routes, and empty Cron
triggers. Do not issue an application request.

Whether the upload succeeds, fails, or is ambiguous, do not retry. Perform
only read-only diagnosis and stop. Access, secrets, runtime-candidate
generation, and every later upload remain unauthorized until the owner reviews
this checkpoint and gives a separate continuation authorization.

> **2026-09-03 result:** The one command created exactly one bootstrap version
> and its one 100% deployment, reported no route targets, then returned nonzero
> because the final empty-schedule PUT was forbidden. It was not retried. The
> provider reports the version as preview-capable, while the authenticated
> Domains panel reports both production and preview routing disabled, no
> routes/custom domains, and Settings reports zero Cron triggers. The corrected
> digest-only verifier accepts that version field as inventory rather than
> route state. D1/R2 reads proved zero data delta. Stage 3A passed and its
> authority is exhausted; see
> `02-99-STAGE3-EVIDENCE.md`.

## 3B0 — Create the account Zero Trust organization (complete and verified)

The initial 2026-09-03 read-only Worker Access panel reported that this
Cloudflare account had no Zero Trust organization or authentication domain.
Cloudflare's onboarding required an owner-chosen unique team name, a
subscription plan, and owner-entered payment details even for the no-charge
Free plan. Creating that organization was account provisioning, not an
implicit part of Stage 3A or the Worker Access policy.

Before any Access application or policy action, the runbook required a
separate exact owner decision naming:

1. the non-secret unique team name that will form the
   `<team>.cloudflareaccess.com` authentication domain;
2. the selected Zero Trust plan (the Free plan is sufficient for this bounded
   pilot unless the owner deliberately chooses otherwise); and
3. whether to retain the new-organization default Cloudflare identity provider,
   restricted to account members, or configure another explicitly approved
   provider later.

The owner must personally review the plan and enter any payment details in the
Cloudflare dashboard. Do not record payment data, create an API credential,
enable WARP/Gateway/device enrollment, add users, configure DNS, change Worker
routes, or create an Access application during this onboarding checkpoint.
After onboarding, stop and verify read-only that the exact team domain and
default identity provider exist and both Worker route switches remain disabled.

Official prerequisites:

- <https://developers.cloudflare.com/cloudflare-one/setup/>
- <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/>

> **2026-09-03 result:** The owner explicitly selected the non-secret team name
> `digitalrain-prospector`, Zero Trust Free, and the automatically provisioned
> Cloudflare identity provider restricted to account members. The owner
> personally completed the payment-detail step. Read-only dashboard
> verification then proved the exact team name/domain, the Free plan at zero
> monthly price, and exactly one Cloudflare identity provider with **Restrict
> to account members** enabled. No Access application or policy was created,
> no Worker route was enabled, and no secret, credential, user, device, DNS,
> Gateway, WARP, upload, request, or effect was added. Stage 3B0 is complete.
> Stop before Stage 3B pending its separate exact authorization.

## 3B — Create the exact-owner Worker-level Access boundary (not authorized)

Run this section only after 3B0 has been separately authorized, completed by
the owner, and verified. Do not combine Zero Trust organization creation and
the Worker Access application into one authorization.

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

## 3C — Generate and review the private runtime candidate (not authorized)

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

## 3D — Complete local no-upload gates (not authorized)

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

## 3E — Upload the final unreachable, undeployed version (not authorized)

Only under a future separate authorization, run one command from the exact
reviewed source and private files:

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

Create an owner-only mode-0600 expectation file below `site/.wrangler/` with
exactly `sourceCommit` and `runtimeCandidateDigest`, then run:

```sh
npm run greenfield:stage3:verify -- verify \
  --config .wrangler/<exact-runtime-candidate>.json \
  --expectation .wrangler/<exact-stage3-expectation>.json
```

The verifier double-reads only `wrangler versions list --json` and `wrangler
deployments list --json`. It requires exactly the ordered bootstrap/final
Wrangler-upload lineage and the single initial bootstrap deployment at 100%,
rejects cross-read drift and any reachable/effect-capable candidate, and emits
only source/config/version/deployment inventory digests and counts. It never
emits version or deployment IDs, authors, provider stderr, paths, resource
identities, Access values, or secrets. It does not prove routes, Access policy
state, D1, or R2; those remain independent dashboard and read-only provider
checks below.

- the digest-only verifier receipt for the ordered bootstrap/final lineage and
  exact source/runtime configuration, plus the independently recorded build
  digest;
- exactly one initial bootstrap deployment at 100% and no later deployment;
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

The exhausted Stage 3A checkpoint ended with one deployed bootstrap version,
both Worker route switches disabled, no route/custom domain, and zero Cron
triggers. Version metadata reports preview capability, not current preview
routing; the authenticated Domains panel is authoritative for the disabled
route state. The empty schedule update was forbidden and was not retried, but
the read-only Settings panel independently proves zero Cron triggers. The
operator must remain stopped before Access. If later separately authorized,
terminal Stage 3
ends with the bootstrap deployment still pointing only to its first version,
one additional unreachable undeployed final version, and an independently
reviewed exact-owner Worker-level Access boundary. It does not complete Plan
02-99.

Stage 4 requires a new explicit authorization to enable only the Access-
protected production `workers.dev` route, deploy only the exact final Stage 3
version, prove unauthenticated and real non-owner denial, perform the bounded
owner read-only smoke, repeat D1/R2 zero-state evidence, review logs, and obtain
terminal owner acceptance. A future custom domain remains a separate decision;
do not change `digitalrain.ai` DNS under this runbook. No Stage 4 action may
inherit Stage 3 authority.
