# Phase 1 Hosted Boundary Proof

Date: 2026-07-30

## Release provenance

| Field | Value |
|---|---|
| Sites project | `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba` |
| Application code commit | `e74ed96` |
| Sites source commit | `d6b3b6196cfe88e1141c9e5e8dd42a4cefb0dcdd` |
| Saved version | 10 — `appgprj_6a6a2e5c533081919e9c47dd6dd6ceba~appgver_cdb9f5bb06d881918d7ef49d9c7048eb` |
| Archive content hash | `sha256:b71cb76dfb8764740c4fe5978e032a9b461390d18878ea3a3ebb530ceeb3afe7` |
| Deployment | `appgdep_6a6b71f7af98819199eed2257292d777` — succeeded |
| Production URL | `https://prospector-steven-pilot.djstif.chatgpt.site/` |
| Runtime environment revision | 2 |

The saved Sites version references the exact pushed site-only commit. The
archive was built after lint, production build, and all tests passed from
application commit `e74ed96`.

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

Authenticated harness modes accept only a local operator-supplied Cookie
transport and never print or persist it. Browser proof does not extract browser
session material.

## Outcomes

| Check | Outcome | Evidence |
|---|---|---|
| Exact tested source deployed | Pass | Version 10 saved from Sites source `d6b3b61…`; deployment reached `succeeded` with environment revision 2 |
| Unauthenticated capability denial | Pass | HTTP 401 at the private Sites gate; neutral response and no private metadata |
| Owner capability read | Pass | HTTP 200; status distribution Proven 5, Blocked 0, Unproven 3; no owner email returned |
| Foreign-origin mutation denial | Pass locally; hosted operator check pending | Route test and redacted harness assert HTTP 403; authenticated browser transport is not extracted |
| Missing CSRF denial | Pass locally; hosted operator check pending | Route test and redacted harness assert HTTP 403 |
| Malformed body denial | Pass locally; hosted operator check pending | Route test and redacted harness assert HTTP 400 |
| One-time CSRF replay denial | Pass locally; hosted operator check pending | Route test and redacted harness assert HTTP 403 |
| R2 write/read/digest/delete/absence | Pass hosted | Fixed owner proof completed all five steps at `2026-07-30T15:49:48.528Z` |
| Durable evidence after reload | Pass hosted | R2 remains Proven with opaque reference `ae_cap_99ea450032f22a841ffbafbf` |
| Controlled second real principal | Pending — blocking | Requires a separate Sites-asserted identity; no application invitation or allowlist workaround was enabled |
| Second-principal state/object delta | Pending — blocking | Zero-delta verification follows the real second-principal attempts |
| Hosted log hygiene | Pass for fresh version 10 client; legacy event recorded below | Fresh proof: POST `/api/capability-probe`, HTTP 200, outcome `ok`; Cookie redacted, deprecated custom CSRF header absent, no raw CSRF cookie value |

## Security remediation evidence

Version 9 sent a one-time CSRF value in a custom request header that the Sites
worker logger did not redact. Version 10 moves the one-time value to a
`HttpOnly; Secure; SameSite=Strict; Path=/` cookie, removes it from response
JSON and client state, and updates the proof harness accordingly.

One already-open, stale browser tab sent the deprecated header once after the
version 10 deployment. Its value is intentionally omitted from this record. A
new cache-busted tab then produced the accepted version 10 proof: the custom
header was absent, the Cookie header was redacted, and no raw cookie value was
present. The stale tab is not accepted evidence and must not be reused.

## Local release evidence

- `npm run lint`: pass.
- `npm test`: pass; production build plus 15/15 tests.
- Hosted proof harness regression: pass, including denial, malformed request,
  replay, complete storage lifecycle, and durable reload assertions.
- React Doctor 0.9.2: 100/100, no issues.
- Repository and built-bundle search: no deprecated custom CSRF request header
  in production source or compiled output.

## Review status

The required fresh-agent red-team stage remains `REDTEAM-BLOCKED`: three
earlier planning agents still occupy the available subagent slots, and the
protocol forbids representing a same-agent review as independent red-team
evidence.

## Boundary retained

Gmail, the scheduler, Runner callbacks, live prospect data, imports, exports,
outbound messages, and outbound calls remain blocked or unproven. A successful
storage proof does not authorize or demonstrate any of those capabilities.

## Blocking checkpoint

Phase 1 remains open until a real second signed-in principal attempts the app,
`/api/interview`, `/api/capabilities`, and `/api/capability-probe`, observes only
neutral denial, and the owner session confirms zero new workspace, object,
proof, or audit state. This checkpoint cannot be replaced by local headers,
mocks, or an application invitation.
