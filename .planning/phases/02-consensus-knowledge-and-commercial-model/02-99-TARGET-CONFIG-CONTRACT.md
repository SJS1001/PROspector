# Plan 02-99 target-configuration contract

**Captured:** 2026-09-02

**Status:** owner-approved CLI seam implemented; Stage 2 migration stopped
after `0007`; repaired source passed local preflight and awaits a regenerated
candidate, read-only reinspection, and separate resume authority

## Purpose

One deep configuration module must turn the target-neutral Vinext build plus
one owner-held greenfield resource mapping into one inspectable Wrangler
candidate and one sanitized verification result. Callers must not assemble
individual bindings, exposure toggles, routes, triggers, or effect controls.

This contract defines behavior shared by any eventual interface. It does not
select the proposed CLI seam, contain a target identifier, or authorize a
Cloudflare command.

## Input authority

The module may accept only:

- the exact checked source commit and built `dist/server/wrangler.json`;
- one bounded Worker name;
- the already-provisioned D1 database name and UUID;
- the already-provisioned R2 bucket name; and
- the ordered migration and expected-schema manifests checked into this phase.

The resource mapping must remain outside Git and ignored build output. Secret
values, owner email, Access issuer/audience, routes, domains, schedules,
provider settings, and arbitrary Wrangler fragments are not input fields.

## Candidate invariants

The emitted candidate must satisfy all of these conditions at once:

1. It has exactly one Worker name and uses the built `index.js` entry plus the
   built client-assets directory.
2. It retains the reviewed compatibility date and only the required
   `nodejs_compat` compatibility flag.
3. It binds exactly one D1 resource as `DB` and exactly one R2 resource as
   `FILES`; both identifiers match the owner-held mapping.
4. The D1 migration directory and explicit `*.sql` pattern resolve to exactly
   the checked `site/drizzle/0000`-`0009` chain and match the recorded digests.
5. `workers_dev` and `preview_urls` are both literal `false`.
6. Cron triggers are explicitly empty. Routes, custom domains, queues, email,
   services, dispatch namespaces, pipelines, workflows, durable objects,
   browser/render bindings, AI/model bindings, analytics, log forwarding,
   and every other effect-capable binding are absent.
7. Plaintext variables, secret values, `.dev.vars`, `LOCAL_DEMO`, provider
   configuration, owner identity, and Access configuration are absent.
8. No placeholder, all-zero, retired-project, Sites, original-project, or
   unexpected account/resource material occurs anywhere in the candidate.
9. The candidate is valid under the pinned Wrangler 4.116.0 schema and a
   Wrangler dry run completes without upload, resource creation, route change,
   trigger change, or other hosted mutation.
10. The verification result contains only source, built-artifact, candidate,
    migration-manifest, and expected-schema digests plus fixed status/code and
    boolean/count projections. It never emits the mapping, identifiers, paths,
    environment, child-process output, or secrets.

Any missing, extra, duplicate, malformed, mismatched, unresolved, public,
effect-capable, or unsupported material fails closed before a Wrangler command
is constructed.

## Custody and lifecycle

The target-neutral build remains safe to commit. The resource mapping and
candidate remain ignored local release artifacts. A candidate is immutable for
one checked source/migration tuple; any source, build, resource, or manifest
change requires regeneration and review.

The local sequence is build, candidate construction, closed-shape validation,
digest capture, and Wrangler dry run. Remote D1 migration is a separate
owner-authorized stage. Worker version upload, Access configuration, secrets,
route attachment, deployment, and application requests are later separate
stages. No stage inherits authorization from an earlier one.

## Approved interface

On 2026-09-02 the owner authorized this Stage 2 seam. The repository command is
`npm run greenfield:target:prepare -- prepare --mapping <ignored-json> --output
<ignored-json>`. It reads only a closed, owner-private mapping beneath
`site/.wrangler/`, writes one new non-overwriting private candidate beneath the
same ignored root, and prints only the sanitized receipt. It never invokes
Wrangler or changes Cloudflare.

The source identity is the authoritative outer PROspector repository HEAD.
The nested `site/.git` development checkout is never accepted as release
provenance.

The implementation rejects symlink escapes, loose mapping permissions,
placeholder identity, stale source identity, any byte or nested-shape change to
the reviewed generated target-neutral config, altered expected-schema
authority, missing/additional/renamed/reordered or digest-mismatched SQL, and
candidate overwrite. The receipt binds the complete built server/client tree
by digest so the operator can prove the same bytes survive dry run. At the
pre-repair CLI checkpoint, its focused six-case suite, canonical `npm test`
(including the production build), canonical lint, and production dependency
audit passed locally. For the repaired tree, canonical build/tests, lint,
production audit, Vinext compatibility, the six-case target-configuration
suite against the refreshed expected-schema pin, and the focused
migration/persistence/inventory checks are green. These results authorize no
remote action and are not Plan 02-99 acceptance evidence.

## Stage 2 incident boundary

The first Stage 2 candidate passed the no-upload Wrangler dry run. Remote D1
migration then applied `0000` through `0007` and stopped on `0008` with
`incomplete input`. No retry occurred. Read-only inspection showed exactly
eight journal rows, clean integrity checks, zero application rows, and no
partial `0008` objects. R2 remained empty and private.

The old ignored candidate is stale because the reviewed `0008` and `0009`
bytes have since been normalized at checked source
`46d082e962c4acc1771e92ad300d61913d50ead4`. It must never be reused. A new
candidate, dry run, canonical preflight, independent review, and explicit
remote-resume authorization are required before applying the two pending
migrations. No Worker, upload, route, Access, secret, deployment, application
request, provider, export, or outbound effect is authorized.
