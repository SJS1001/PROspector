# Plan 02-99 private runtime-configuration contract

**Captured:** 2026-09-02

**Status:** local generator implemented; every hosted action remains separately gated

## Purpose

This contract converts one already-reviewed private target candidate plus one
owner-private Cloudflare Access metadata file into one immutable private
runtime candidate. It closes the local configuration-assembly gap without
creating Access, reading a secret value, uploading a Worker, attaching a route,
deploying, or making the application reachable.

## Inputs and custody

Both inputs and the output must be owner-only JSON files below ignored
`site/.wrangler/`. Symlinks, group/other-readable inputs, path escape,
non-distinct paths, and output overwrite fail closed.

The target input must be the exact closed-shape output of the target generator:
one `DB`, one `FILES`, the checked build and migration paths, literal
`workers_dev: false`, literal `preview_urls: false`, empty Cron triggers, and
no variables, secrets, routes, or other effect-capable material.

The Access metadata input contains exactly four non-secret fields:

- `sourceCommit`: the authoritative outer repository HEAD;
- `targetCandidateDigest`: SHA-256 of the exact target-candidate bytes;
- `accessIssuer`: the exact HTTPS `*.cloudflareaccess.com` issuer; and
- `accessAudience`: the bounded Access application audience.

It must never contain the owner email, subject pepper, token, cookie, client
secret, private key, or any other secret value.

## Output invariants

The runtime candidate copies the validated target candidate and adds only:

- `TRUSTED_IDENTITY_PROVIDER=cloudflare-access`;
- `CLOUDFLARE_ACCESS_ISSUER`;
- `CLOUDFLARE_ACCESS_AUDIENCE`; and
- required secret *names* `OWNER_SUBJECT_PEPPER` and `PILOT_OWNER_EMAIL`.

`LOCAL_DEMO`, owner identity values, secret values, public exposure, previews,
routes, schedules, providers, Gmail, telephony, exports, and every outbound
binding remain absent. The output is created once with mode `0600` and is never
committed.

The CLI prints only fixed status fields and SHA-256 digests of the source
commit, target candidate, Access metadata file, and runtime candidate. It never
prints the issuer, audience, resource identities, file paths, or secret values,
and it emits no child-process output. Errors contain only a bounded code.

## Interface and lifecycle

Run only after creating the owner-private Access metadata file:

```sh
npm run greenfield:runtime:prepare -- prepare \
  --target .wrangler/<private-target>.json \
  --access .wrangler/<private-access-metadata>.json \
  --output .wrangler/<private-runtime-candidate>.json
```

Any source, target byte, issuer, audience, resource, build, or migration change
invalidates the candidate and requires new input, regeneration, and review.
Generating this local file grants no authority to provision Access, enter
secrets, upload a version, enable a preview, attach a route, deploy, issue an
application request, initialize a workspace, or perform an external effect.

Before a future separately authorized version upload, independently review the
exact private candidate, run canonical tests/lint/audit and `vinext check`, and
perform a Wrangler dry run with no upload. The later hosted evidence sequence
remains the one defined in `docs/CLOUDFLARE-GREENFIELD-READINESS.md` and
`02-99-PLAN.md`.
