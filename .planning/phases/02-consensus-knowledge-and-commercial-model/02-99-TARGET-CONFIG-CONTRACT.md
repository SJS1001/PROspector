# Plan 02-99 target-configuration contract

**Captured:** 2026-09-02

**Status:** checked local design; interface/seam still requires owner confirmation

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
10. The verification result contains only a source digest, candidate digest,
    migration-manifest digest, expected-schema digest, fixed status/code, and
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

## Pending interface decision

The proposed seam is one fail-closed CLI command that reads an ignored
`.wrangler/` mapping file, writes an ignored candidate, and prints only the
sanitized result. Its tests cannot be written until the owner confirms that
interface, as required by the repository's TDD workflow.
