# Deployment ownership

## Historical controller label

The retired, failed isolated PROspector pilot was controlled through the Codex Sites
account identified as **Steven at Digital Rain dot AI**.

This is a historical non-secret ownership label only. It is not an email
address, credential, recovery detail, access token, secret, authorization to
access either retired environment, or authority for a future host.

## Current state

Cloudflare is the owner-authorized greenfield provider. Exactly one fresh D1
database and one private R2 bucket were created on 2026-09-02; their exact
account and resource identities remain outside Git. Stage 2 then applied the
checked `0000` through `0009` migration chain. Sanitized read-only proof records
the exact ten-row journal and expected schema, zero application rows across all
92 application tables, clean integrity, and zero completed R2 objects with
private exposure. Incomplete multipart state remains unverified. This is
greenfield target evidence only. It does not use, recover, or imply a migration
from either retired Sites environment, whose missing journal, schema, and
provider provenance are permanently waived and cannot be inherited.

Revised Stage 3A created one bootstrap Worker version and its single 100%
deployment through the one authorized initial `wrangler deploy`. The command
reported no route target and ended nonzero when Cloudflare rejected its final
empty-schedule update; it was not retried. Subsequent authenticated read-only
evidence proves production `workers.dev` disabled, Preview URLs disabled, no
custom route or domain, and zero Cron triggers. Stage 3A authority is exhausted.
It did not attach Access, bind secrets, enable a route, issue an application
request, or authorize later uploads.

Stage 3B0 created the dedicated Zero Trust organization on the Free plan with
the default Cloudflare identity provider restricted to account members. A
reusable Access policy is saved and independently verified with exactly one
owner-email Allow selector, required Cloudflare login, inherited duration, and
zero application associations. In the Worker attachment dialog, **All traffic**,
that saved policy, and **1 hour** are selected but remain unapplied. Therefore
the Worker still has no Access application/attachment, no proved effective
one-hour session, and no accepted real-principal boundary. Secrets, a final
runtime version, routes, application requests, providers, exports, schedules,
and outbound effects remain separately gated.

The checked repository and fresh disposable local state remain authoritative
under [`GREENFIELD-BASELINE.md`](GREENFIELD-BASELINE.md). Every future hosted
checkpoint must name a separately authorized greenfield Cloudflare target and
establish that target's own exact-source, configuration, migration,
private-boundary, and zero-effect evidence. Neither retired environment may be
accessed, used as a source, or cited as deployment provenance.

Deployable source metadata contains binding names only (`DB` and `FILES`) and
contains no project identifier from either retired environment. The generated
local build configuration deliberately retains an invalid all-zero D1 ID and
placeholder resource names; it is build input only and must never be deployed.
A separately authorized control-plane step supplied the greenfield resources'
D1/R2 identities outside Git for Stages 2 and 3A. Secret values remain absent
from Git. Plan 02-99 is not complete: Access attachment, effective session and
real-principal proof, secrets, final runtime deployment, repeated target
integrity/zero-effect evidence, and owner acceptance are still outstanding.
Sanitized staged evidence is recorded beside Plan 02-99 under
`.planning/phases/02-consensus-knowledge-and-commercial-model/`.

The checked runtime also contains a target-neutral Cloudflare Access adapter.
It requires `TRUSTED_IDENTITY_PROVIDER=cloudflare-access`, both
`CLOUDFLARE_ACCESS_ISSUER` and
`CLOUDFLARE_ACCESS_AUDIENCE`, verifies the signed JWT rather than trusting a
raw identity header, and rejects missing, unknown, partial, or conflicting
identity configuration. These names contain no target value and grant no
deployment authority. The current target has not yet supplied accepted
runtime-secret or real-principal evidence, and any future target must
independently supply and prove its own values.
