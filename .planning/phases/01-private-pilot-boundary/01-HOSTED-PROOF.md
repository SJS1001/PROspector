# Phase 1 Hosted Boundary Proof

Date: 2026-07-29

## Release provenance

| Field | Value |
|---|---|
| Sites project | `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba` |
| Application code commit | `26f7331331f4de8b433ca48abe07e47174b36a51` |
| Sites source commit | Blocked — source repository credential is unavailable while the project returns `project_not_found` |
| Saved version | Blocked — existing project returns `project_not_found` to this Sites control-plane session |
| Deployment | Blocked — no duplicate project or open-world deployment created |
| Production URL | `https://prospector-steven-pilot.djstif.chatgpt.site/` |
| Runtime environment revision | Not inspected — existing project is unavailable to this control-plane session |

The release archive must be built from the exact pushed source commit above. A
later evidence-only commit may update this record without changing the deployed
application source.

## Safe proof contract

The hosted proof records HTTP outcomes, capability statuses, timestamps, and
opaque evidence references only. It excludes authenticated-session values,
identity values, server secret values, workspace and object identifiers, proof
payload bytes, operational leads, contacts, and export data.

Commands:

```bash
cd site
npm run lint
npm test
node scripts/hosted-boundary-proof.mjs --help
node scripts/hosted-boundary-proof.mjs \
  --base-url https://prospector-steven-pilot.djstif.chatgpt.site/
```

The owner modes use a local, operator-supplied authenticated-session transport
that is never printed or persisted by the harness. The signed-in browser proof
may exercise the same checks without extracting browser session material.

## Outcomes

| Check | Outcome | Evidence |
|---|---|---|
| Exact tested source deployed | Blocked | GitHub app source `26f7331…` and archive SHA-256 `65e64349…` are verified; Sites project read, source credential, and version save all return `project_not_found` |
| Unauthenticated capability denial | Pass | HTTP 401 at the private Sites gate; no private metadata observed |
| Owner capability read | Pending | Status distribution pending |
| Foreign-origin mutation denial | Pending | Redacted HTTP status pending |
| Missing CSRF denial | Pending | Redacted HTTP status pending |
| Malformed body denial | Pending | Redacted HTTP status pending |
| One-time CSRF replay denial | Pending | Redacted HTTP status pending |
| R2 write/read/digest/delete/absence | Pending | Opaque evidence reference pending |
| Durable evidence after reload | Pending | Opaque evidence reference and timestamp pending |
| Controlled second real principal | Pending | Required hosted checkpoint |
| Second-principal state/object delta | Pending | Required zero-delta checkpoint |
| Hosted log hygiene | Pending | Redacted route/status inspection pending |

## Local release evidence

- `npm run lint`: pass.
- `npm test`: pass; production build plus 15/15 tests.
- `node scripts/hosted-boundary-proof.mjs --help`: pass.
- Exact application commit on GitHub: `26f7331331f4de8b433ca48abe07e47174b36a51`.
- Deployable archive: `/private/tmp/prospector-26f7331.tar.gz`; SHA-256
  begins `65e64349`; required Sites metadata and server entrypoint are present.

The currently live owner-authenticated site was inspected in the signed-in
browser and still renders the prior fixture/capability release. It is not
evidence for the new Phase 1 source.

## Review status

The fresh-agent red-team stage could not start because this task's three earlier
planning agents still occupy all available subagent slots. Per the red-team
protocol, this is `REDTEAM-BLOCKED`; no same-agent review is represented as an
independent red team.

A separate release audit found and fixed a mechanical blocker before deployment:
the first harness revision used a non-existent storage capability ID and a stale
evidence shape. The corrected harness now has end-to-end regression coverage for
the complete denial, proof, replay, and durable-evidence sequence.

## Boundary retained

Gmail, the scheduler, Runner callbacks, live prospect data, imports, exports,
outbound messages, and outbound calls remain blocked or unproven. A successful
storage proof does not authorize or demonstrate any of those capabilities.
