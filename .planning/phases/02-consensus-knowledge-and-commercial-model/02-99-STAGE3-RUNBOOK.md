# Plan 02-99 Stage 3 private-runtime runbook

**Captured:** 2026-09-02

**Status:** checked operator procedure; execution requires separate owner authorization

## Scope

Stage 3 may create one exact-owner Cloudflare Access application on an
otherwise un-routed hostname, generate one owner-private runtime candidate,
and upload one undeployed Worker version with required secrets. It must finish
with no route, no custom domain attachment, disabled `workers.dev`, disabled
preview URLs, no deployment, no application request, and no application row or
R2 object change.

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
3. The owner names one hostname on a zone in the current Cloudflare account.
   It must have no DNS/Worker route and must not be reachable before Stage 4.
4. The owner authorizes **Stage 3** against that hostname and exact source.
5. The operator uses the owner-authenticated dashboard or a separately
   owner-created least-privilege credential with Access Apps and Policies
   write. The active Wrangler OAuth profile is insufficient and must not be
   extracted, broadened, rotated, or replaced automatically.

Any mismatch stops with no Access, secret, or Worker write.

## 3A — Create the unreachable exact-owner Access boundary

In the owner-authenticated Cloudflare dashboard:

1. Open **Zero Trust → Access controls → Applications** and add one
   self-hosted application for the exact owner-selected hostname.
2. Configure one Allow policy whose Include selector is the single exact owner
   email. Do not use Everyone, an email domain, all account members, a reusable
   broad group, Bypass, or Service Auth.
3. Use only an owner-approved identity provider and a bounded pilot session
   duration. Do not add the future non-owner negative-test principal.
4. Save and independently re-open the application. Verify the exact hostname,
   single-email Allow rule, policy precedence, session duration, and absence of
   Bypass/broad rules.
5. Record only the non-secret application audience and exact
   `https://<team>.cloudflareaccess.com` issuer in an owner-only mode-0600 JSON
   file below `site/.wrangler/`. Also bind that file to the current outer
   repository commit and exact target-candidate SHA-256 as required by
   `02-99-RUNTIME-CONFIG-CONTRACT.md`.

Do not create DNS, a Worker route, a custom domain attachment, or a public
preview. Do not record the owner email, token, cookie, JWT, recovery value, or
credential in Git, chat, screenshots, logs, or evidence.

Stop if the application cannot be created without broad access, if the
hostname is already routed/reachable, or if its audience/issuer cannot be
verified.

## 3B — Generate and review the private runtime candidate

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

## 3C — Complete local no-upload gates

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

## 3D — Upload one unreachable, undeployed version

Only under the same explicit Stage 3 authorization, run one command from the
exact reviewed source and private files:

```sh
npx wrangler versions upload \
  --config .wrangler/<exact-runtime-candidate>.json \
  --secrets-file .wrangler/<private-secrets-file> \
  --strict \
  --message "Plan 02-99 Stage 3 unreachable private candidate"
```

This is a hosted write. It must create one version but no deployment. Do not
use `wrangler deploy`, `wrangler secret put`, a preview alias, a route, or a
custom domain. If the command fails or its result is ambiguous, do not retry;
inspect versions, deployments, routes, Access, D1, and R2 read-only first.

## 3E — Read-only terminal evidence

Immediately prove and record only sanitized evidence for the exact tuple:

- one new version ID plus source/config/build digests;
- zero deployments/traffic for that version;
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

Stage 3 ends with an unreachable undeployed version and an independently
reviewed exact-owner Access boundary. It does not complete Plan 02-99.

Stage 4 requires a new explicit authorization to attach the reviewed private
hostname/route, deploy only the exact Stage 3 version, prove unauthenticated and
real non-owner denial, perform the bounded owner read-only smoke, repeat D1/R2
zero-state evidence, review logs, and obtain terminal owner acceptance. No
Stage 4 action may inherit Stage 3 authority.
