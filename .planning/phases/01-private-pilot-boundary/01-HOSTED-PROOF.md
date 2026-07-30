# Phase 1 Hosted Boundary Proof

Date: 2026-07-29

## Release provenance

| Field | Value |
|---|---|
| Sites project | `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba` |
| Source commit | Pending exact-source commit |
| Saved version | Pending |
| Deployment | Pending |
| Production URL | `https://prospector-steven-pilot.djstif.chatgpt.site/` |
| Runtime environment revision | Pending |

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
| Exact tested source deployed | Pending | Source/version/deployment identifiers pending |
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

## Boundary retained

Gmail, the scheduler, Runner callbacks, live prospect data, imports, exports,
outbound messages, and outbound calls remain blocked or unproven. A successful
storage proof does not authorize or demonstrate any of those capabilities.
