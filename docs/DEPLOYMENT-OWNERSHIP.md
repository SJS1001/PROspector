# Deployment ownership

## Historical controller label

The retired, failed isolated PROspector pilot was controlled through the Codex Sites
account identified as **Steven at Digital Rain dot AI**.

This is a historical non-secret ownership label only. It is not an email
address, credential, recovery detail, access token, secret, authorization to
access either retired environment, or authority for a future host.

## Current state

Cloudflare is the owner-authorized greenfield provider for Stage 1. Exactly one
fresh D1 database and one private R2 bucket were created there on 2026-09-02;
their exact account and resource identities remain outside Git. No Worker,
migration, binding, target configuration, Access application, route, secret,
version, deployment, or application request was created. The checked repository
and fresh disposable local state remain authoritative under
[`GREENFIELD-BASELINE.md`](GREENFIELD-BASELINE.md). Any future deployment must
use only these empty greenfield resources with separately recorded owner
authority, private-boundary acceptance, runtime-secret handling, and
exact-source evidence. Neither retired environment may be accessed or used as
a source.

Deployable source metadata contains binding names only (`DB` and `FILES`) and
contains no project identifier from either retired environment. The generated
local build configuration deliberately retains an invalid all-zero D1 ID and
placeholder resource names; it is build input only and must never be deployed.
A separately authorized control-plane step must inject the new resources'
D1/R2 identities and secret values outside Git, then satisfy Plan 02-99 before
the target is accepted. Sanitized Stage 1 evidence is recorded in
`.planning/phases/02-consensus-knowledge-and-commercial-model/02-99-STAGE1-EVIDENCE.md`.

The checked runtime also contains a target-neutral Cloudflare Access adapter.
It requires `TRUSTED_IDENTITY_PROVIDER=cloudflare-access`, both
`CLOUDFLARE_ACCESS_ISSUER` and
`CLOUDFLARE_ACCESS_AUDIENCE`, verifies the signed JWT rather than trusting a
raw identity header, and rejects missing, unknown, partial, or conflicting
identity configuration. These names contain no target value and grant no
deployment authority. A future target must supply and prove its own values.
