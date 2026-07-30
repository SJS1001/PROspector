# Phase 1: Private Pilot Boundary - Research

**Researched:** 2026-07-29
**Domain:** Private edge application authorization, capability evidence, D1/R2 isolation, and fail-closed hosted proof
**Confidence:** HIGH for repository behavior; MEDIUM for hosted-only proof until exercised

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Identity and Workspace Isolation
- Trusted server identity headers are the only source of the principal; client-supplied user or workspace identifiers never confer authority.
- The pilot permits exactly one owner principal and one Company Workspace. Invitations and multi-user controls remain unavailable in v1.
- Authorization is enforced at route, row, and object boundaries, with explicit negative proof for an unauthorized or second principal.
- Missing, malformed, conflicting, or untrusted identity fails closed without exposing workspace data.

#### Capability and Human-Authority Boundary
- Capabilities are measured and displayed individually; a binding or UI control being present is not proof that the capability is safe to use.
- Consequential knowledge requires a distinct confirmation action. Spend, readiness, export, calling, and sending require their own later authorities and cannot be inferred from adjacent state.
- Existing fixture controls for prospecting, approval, discovery, CSV, and export remain natively disabled until their owning phases pass.
- The application does not introduce CRM opportunity, pipeline, forecast, contract, revenue, or customer lifecycle state.

#### Hosted Proof and Audit
- Phase 1 proof must cover trusted owner identity, D1 persistence, R2 write/read/delete durability, route/row/object isolation, mutation protection, secrets handling, and auditable capability evidence.
- The second-principal isolation check uses controlled proof and must not enable pilot invitations.
- Security-sensitive responses are non-cacheable and mutations fail closed on Origin, Fetch Metadata, intent/CSRF, content type, and bounded-body violations.
- Evidence records distinguish demonstrated, unavailable, and unproven capabilities; unproven capabilities remain disabled.

#### Portability and Data Hygiene
- Sites, D1, and R2 remain adapters behind provider-neutral domain ports so a failed capability gate can select another compatible host without changing the commercial model.
- No secret, provider credential, real operational lead/contact data, or export passphrase enters Git.
- The complete workspace archive and restore drill belong to Phase 7; Phase 1 only establishes the storage and adapter boundary needed to make that future proof possible.
- Legacy files and July 24 lead artifacts remain outside the live pilot until an authenticated, ignored import workflow is authorized.

### Claude's Discretion
- Exact internal module names, status-card layout, and test-fixture organization may follow the existing TypeScript, Drizzle, and Node test patterns as long as the locked behavior above remains observable.

### Deferred Ideas (OUT OF SCOPE)
- Invited users and scoped roles remain v2.
- Product discovery, prospecting, enrichment, Gmail, calling, CSV handoff, and workspace restore remain in their owning roadmap phases.
- Controlled Google OAuth, scheduler, and runner callback proofs are not promoted into Phase 1 merely because the capability view names them.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-private-human-governed-gtm | Private, human-governed GTM with explicit knowledge/effect authority and no CRM lifecycle expansion | Separate Answer/Confirmation already exists; Phase 1 must preserve native disabled controls and replace capability-presence booleans with evidence states. |
| REQ-company-workspace-isolation | Exactly one isolated, auditable, exportable owner workspace with invitations disabled | Principal derivation and workspace-scoped schema exist, but current tests permit a second principal to bootstrap a second workspace; Phase 1 must close that pilot-boundary defect and prove negative access. |
</phase_requirements>

## Summary

The existing application is a useful partial skeleton: trusted Sites identity is consumed server-side, principal identifiers are HMAC-derived with a server secret, D1 access is centralized, mutations require same-origin metadata plus a one-time owner-bound CSRF token, responses are non-cacheable, and the only live state transition separates Answer from Confirmation. The test suite already exercises concurrency, idempotency, proposal snapshot binding, and workspace-qualified joins.

The largest correctness gap is not missing infrastructure but a contradiction with the accepted pilot model. `interview-handler.test.mjs` and `interview-repository.test.mjs` currently allow an outsider to bootstrap a separate workspace. That is valid multi-tenant behavior, but Phase 1 requires one pre-authorized owner and exactly one workspace. The implementation needs an explicit owner allowlist/binding and a deny path that reveals no workspace metadata. R2 is reported only as “binding present”; presence is not durability evidence. Capability status must be derived from auditable proof records and use `proven | blocked | unproven`, never infer proof from environment bindings.

**Primary recommendation:** strengthen the server boundary around a single configured owner, introduce provider-neutral capability-proof and object-storage ports, make the Pilot Status UI read those evidence records, and require both automated negative tests and controlled hosted proof before Phase 1 closes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trusted principal derivation | Frontend server/API | Sites identity edge | Identity headers must be read only inside trusted server code. |
| Single-owner admission | API/backend | Secret/config binding | Admission precedes any workspace lookup or mutation. |
| Workspace row isolation | API/backend | D1 | Every read/write is qualified by the server-derived workspace. |
| R2 object isolation | Storage adapter | API/backend | Object keys must be server-derived and workspace-prefixed. |
| Mutation protection | API/backend | Browser | Server verifies Origin, Fetch Metadata, intent, CSRF, type, and size. |
| Capability proof state | Domain service | D1/audit repository | State is evidence-backed and append-only, not inferred from UI or bindings. |
| Pilot Status rendering | Browser/SSR UI | Capability API | UI communicates proof; it never grants capability. |
| Hosted proof capture | Controlled validation harness | Audit repository | Some evidence can only be demonstrated against the hosted runtime. |

## Existing Stack

No new package is required.

| Component | Repository version/source | Purpose | Research conclusion |
|-----------|---------------------------|---------|---------------------|
| Next/React/Vinext | `site/package.json` and lockfile | App router and hosted Worker bundle | Keep the existing brownfield stack. |
| Cloudflare Worker bindings | `cloudflare:workers`, `site/worker/index.ts` | D1/R2/asset runtime access | Isolate bindings in adapter modules rather than domain code. |
| Drizzle ORM + D1 | `drizzle-orm` 0.45.2 | Typed schema and database access | Keep schema definitions, but security-sensitive repositories may continue using bound parameterized D1 statements where atomic behavior is explicit. |
| Miniflare | 4.20260515.0 | Local D1/Worker tests | Extend it for deterministic negative authorization and object-key tests. Hosted R2 durability still requires controlled live proof. |
| Node test runner + Vite SSR loading | Node >=22.13, existing tests | Unit/integration tests | Preserve current zero-new-runner test infrastructure. |

## Architecture Patterns

### Request and proof flow

```text
Sites trusted identity headers
        |
        v
server identity adapter --> principal HMAC --> single-owner admission
                                               |
                          denied --------------+-------------- admitted
                            |                                  |
                    neutral 403/404                    workspace resolver
                                                               |
                                      +------------------------+----------------------+
                                      |                        |                      |
                                  D1 repository          R2 storage port       capability proof repo
                                      |                        |                      |
                                      +------------------------+----------------------+
                                                               |
                                                      Pilot Status read model
                                                               |
                                                    Proven / Blocked / Unproven UI
```

### Pattern 1: Admission before workspace resolution

Validate that trusted identity maps to the configured pilot owner before reading or creating any workspace row. A non-owner receives the same neutral denial whether a workspace exists or not. Do not return `uninitialized` to an unauthorized principal because that invites them to create another workspace and leaks product state.

### Pattern 2: Server-derived workspace and object keys

Repositories receive an admitted principal/workspace context, not a request-provided workspace ID. D1 queries bind `workspace_id`; R2 keys use a fixed namespace such as `workspaces/{workspaceDigest}/capability-probes/{probeId}` generated by trusted code. A caller cannot choose or enumerate another prefix.

### Pattern 3: Evidence-backed capability projection

Represent each capability as a projection over immutable proof/audit events:

- `proven`: a required proof set exists and is current for the deployment.
- `blocked`: a required binding/configuration is missing or a proof failed.
- `unproven`: prerequisites may exist, but required proof has not been recorded.

The `/api/capabilities` route should not expose the owner email and should not report R2 as proven merely because `FILES` is bound.

### Pattern 4: One-shot hosted R2 probe

Use a controlled, owner-only mutation that:

1. creates a random server-generated probe key under the admitted workspace prefix;
2. writes non-sensitive random bytes;
3. reads and verifies the exact digest;
4. deletes the object;
5. verifies it is absent;
6. records an audit/proof event without retaining the probe payload or secret.

Retries use a new probe ID and remain non-operational. The route is unavailable to unauthorized identities and cannot accept arbitrary bucket keys or data.

### Pattern 5: Separate proof from authority

A capability proof can enable later planning but cannot itself authorize a run, import, export, spend, or send. Phase 1 should expose status only. All later-phase controls remain natively disabled.

## Recommended Project Structure

```text
site/
├── domain/
│   ├── pilot-access.ts          # single-owner admission and neutral denial
│   ├── capabilities.ts          # proof-state model and projection
│   ├── ports/
│   │   └── object-storage.ts    # provider-neutral object operations
│   └── request-security.ts      # existing mutation guard
├── adapters/
│   └── cloudflare/
│       └── r2-object-storage.ts # R2 implementation only
├── app/api/
│   ├── capabilities/route.ts    # authenticated read model
│   └── capability-probe/route.ts# controlled owner-only proof mutation
└── tests/
    ├── pilot-access.test.mjs
    ├── capability-state.test.mjs
    ├── object-storage.test.mjs
    └── hosted-proof.test.mjs    # optional controlled harness, never secrets in Git
```

Exact names are discretionary; the dependency direction is not: domain types cannot import Cloudflare bindings.

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|---------|--------------|-------------|-----|
| Principal hashing | Custom reversible encoding | Existing Web Crypto HMAC-SHA-256 with secret pepper | Avoids storing raw identity and preserves deterministic admission. |
| CSRF token entropy/digest | Predictable IDs or reusable tokens | Existing `crypto.getRandomValues`, digest, expiry, and consume-once repository | Existing tests already cover owner binding and replay. |
| SQL escaping | String concatenation | D1 prepared statements / Drizzle parameterization | Prevents injection and keeps workspace predicates explicit. |
| R2 integrity | Visual “write succeeded” state | Byte digest comparison plus delete/absence verification | Binding presence and successful PUT alone are incomplete proof. |
| Capability authorization | UI booleans | Server-side proof projection plus independent later authorities | UI state is not a security boundary. |

## Current Defects and Gaps

1. **Second principal can create another workspace.** Existing tests explicitly assert this. Phase 1 requires deny, not multi-tenant bootstrap.
2. **Capabilities endpoint leaks authenticated email.** The proof surface needs only an authenticated/admitted boolean and display-safe owner label from the page context.
3. **R2 presence is treated as capability.** `Boolean(bindings.FILES)` is configuration discovery, not write/read/delete proof.
4. **Capabilities endpoint returns `ok: true` even when identity/D1 are unavailable.** Overall state must be fail-closed and derived from mandatory proof statuses.
5. **R2 is absent from the Worker `Env` interface.** The adapter boundary and deployment typing are incomplete.
6. **No persistent capability-proof record.** The hosted observations in docs are not yet a queryable audited application projection.
7. **Object isolation lacks negative proof.** There is no automated server-derived prefix test or controlled hosted attempt to access another principal/workspace key.
8. **Fixture safety is good but static.** It must remain tested while Pilot Status becomes the signed-in default.

## Common Pitfalls

### Binding presence mistaken for proof
**What goes wrong:** a configured D1/R2 binding makes the UI green before durability or isolation is demonstrated.  
**Avoidance:** maintain separate `available` prerequisite details and evidence-backed status.

### Multi-tenant behavior sneaking into an owner-only pilot
**What goes wrong:** any authenticated Sites user receives an empty workspace and can bootstrap.  
**Avoidance:** admit one configured owner before any bootstrap/read and keep invitations absent.

### Authorization only at the route
**What goes wrong:** a future route calls a repository directly with a caller-controlled ID.  
**Avoidance:** repository functions require an admitted workspace context and bind workspace scope on every query/object key.

### Capability probe becoming a general object API
**What goes wrong:** probe input accepts arbitrary keys or payloads, creating a storage write primitive.  
**Avoidance:** server generates fixed-prefix keys and random low-sensitivity payloads; caller supplies only intent/CSRF.

### Destructive probe leaves residue
**What goes wrong:** failed cleanup accumulates objects or creates misleading success.  
**Avoidance:** deletion and absence verification are required proof steps; failure records `blocked`, never `proven`.

### Second-principal proof exposes data
**What goes wrong:** validation returns different responses or identifiers that reveal the owner workspace.  
**Avoidance:** neutral denial and an explicit assertion that response bodies contain no company, workspace, audit, or capability details.

## Environment Availability

| Dependency | Required By | Available | Evidence | Fallback |
|------------|-------------|-----------|----------|----------|
| Node/npm | build and test | Yes | Existing `npm test` workflow and lockfile | None needed |
| Miniflare D1 | local integration tests | Yes | Existing passing repository/handler tests use it | None needed |
| Private Sites deployment | hosted identity/D1 proof | Yes | Existing deployed owner lifecycle proof | Re-deploy saved source version if needed |
| D1 binding | hosted state | Proven for current slice | Capability endpoint and reload proof already recorded | Compatible provider only if gate later fails |
| R2 binding | object proof | Present, not proven | Capability endpoint reports binding only | Compatible object-storage adapter |
| Second controlled principal | negative hosted proof | Not established | No invitation should be enabled | Use a controlled pre-authorized test principal supplied through the hosting boundary; manual checkpoint |

**Missing dependency with no autonomous substitute:** a controlled second real principal is required for final hosted negative isolation proof. The code and local tests can be completed autonomously; phase verification must retain a manual checkpoint until that proof is performed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node test runner + Vite SSR modules + Miniflare |
| Config file | `site/package.json`; no separate test config |
| Quick run command | `cd site && node --test tests/pilot-access.test.mjs tests/capability-state.test.mjs tests/object-storage.test.mjs` |
| Full suite command | `cd site && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-private-human-governed-gtm | later workflows remain disabled and Answer does not imply Confirmation/effect authority | integration/render | `cd site && node --test tests/fixture-safety.test.mjs tests/interview-repository.test.mjs` | Existing; extend assertions |
| REQ-private-human-governed-gtm | status projection distinguishes proven, blocked, unproven and never derives proof from binding presence | unit/integration | `cd site && node --test tests/capability-state.test.mjs` | Wave 0 gap |
| REQ-company-workspace-isolation | unauthorized/second principal cannot read or bootstrap the pilot workspace | integration | `cd site && node --test tests/pilot-access.test.mjs tests/interview-handler.test.mjs` | Wave 0 gap + existing test must change |
| REQ-company-workspace-isolation | object keys are server-derived and cross-prefix access is denied | unit/integration | `cd site && node --test tests/object-storage.test.mjs` | Wave 0 gap |
| Both | same-origin, intent, one-time CSRF, bounded JSON fail closed | unit/integration | `cd site && node --test tests/request-security.test.mjs tests/interview-handler.test.mjs` | Existing |
| Both | owner sees plain-language capability status while unauthorized response reveals no workspace metadata | render/route | `cd site && node --test tests/rendered-html.test.mjs tests/capabilities-route.test.mjs` | Route test is Wave 0 gap |
| Both | R2 write/read/digest/delete/absence and second-principal denial work on hosted runtime | controlled manual hosted proof | deployment validation script + recorded audit IDs | Manual checkpoint |

### Sampling Rate

- **Per task commit:** targeted test file(s) named by the task.
- **Per wave merge:** `cd site && npm run lint && npm test`.
- **Phase gate:** full suite green, hosted capability response inspected, R2 lifecycle proof recorded, second-principal denial recorded, and native disabled controls verified.

### Wave 0 Gaps

- [ ] `site/tests/pilot-access.test.mjs`
- [ ] `site/tests/capability-state.test.mjs`
- [ ] `site/tests/object-storage.test.mjs`
- [ ] `site/tests/capabilities-route.test.mjs`
- [ ] Controlled hosted proof harness that accepts no arbitrary object key/payload and stores no secret.

## Security Domain

### Applicable ASVS Categories

| Category | Applies | Required control |
|----------|---------|------------------|
| V2 Authentication | Yes | Trust only Sites-injected identity inside the server adapter; reject missing identity. |
| V3 Session Management | Yes | One-time owner-bound CSRF, no-store responses, same-origin/Fetch Metadata enforcement. |
| V4 Access Control | Yes | Single-owner admission, server-derived workspace, workspace-qualified rows and object prefixes, negative tests. |
| V5 Validation | Yes | fixed action discriminators, JSON type, 8 KiB bound, strict IDs/revisions, server-generated probe data. |
| V6 Cryptography | Yes | Web Crypto HMAC/SHA-256 and secure random values; no custom crypto. |
| V8 Data Protection | Yes | no raw email in persistence/audit, no sensitive data or secrets in Git, neutral unauthorized responses. |
| V10 Malicious Code | Limited | no third-party registry/component additions and no new package needed. |
| V13 API/Web Service | Yes | fail-closed route errors, no capability leak, non-cacheable security responses. |

### Threat Model Inputs

| Threat | STRIDE | Mitigation to plan |
|--------|--------|--------------------|
| Forged client identity/workspace | Spoofing | ignore client identifiers; use trusted identity adapter and admitted context |
| Second authenticated Sites principal bootstraps data | Elevation/Information disclosure | configured single-owner admission before workspace lookup |
| Cross-workspace D1/R2 read | Information disclosure | bound workspace predicates and server-derived object prefixes |
| Capability status forged by UI or binding presence | Tampering | server-side proof projection from immutable evidence |
| CSRF/replay of proof or interview mutation | Spoofing/Tampering | Origin + Fetch Metadata + intent + consume-once CSRF + idempotency |
| Probe creates arbitrary storage primitive | Tampering/DoS | fixed route, server key/payload, quota/rate bound, delete verification |
| Audit contains email or sensitive payload | Information disclosure | HMAC actor IDs and minimized proof metadata |
| Error differences enumerate workspace | Information disclosure | neutral denial body/status across unauthorized states |

### Plan-level blocking threshold

Every PLAN.md must include a `<threat_model>` block. Any unresolved HIGH threat involving owner admission, cross-workspace read/write, mutation bypass, capability-forging, or secret exposure blocks execution/verification.

## Assumptions Log

| # | Claim | Risk if wrong |
|---|-------|---------------|
| A1 | The hosting boundary can provide a stable configured owner identifier/allowlist without exposing it to the client. | If unavailable, owner admission needs a different trusted control-plane binding before release. |
| A2 | A controlled second real principal can be supplied for final negative hosted proof without enabling invitations. | Without it, Phase 1 can be code-complete but cannot be fully verified. |
| A3 | The connected Sites runtime supports the R2 operations needed by a narrow probe. | If the binding is present but operations fail, keep R2 blocked and use the provider-neutral fallback decision. |

## Open Questions (RESOLVED)

1. **Which trusted control-plane value identifies the sole pilot owner?**
   - **RESOLVED:** Use a server-only `PILOT_OWNER_EMAIL` secret containing the normalized owner email. Compare it to the trusted Sites identity before deriving or resolving a workspace; never return, persist, or log the secret value.
   - Known: Sites provides trusted email identity headers and the application already HMACs email with `OWNER_SUBJECT_PEPPER`.
   - Verification: confirm deployment secret exists without printing it.

2. **How is the second-principal proof executed?**
   - **RESOLVED:** Automate the full deny contract locally and retain a blocking end-of-phase hosted verification checkpoint for a controlled second principal asserted by Sites; do not enable invitations.
   - Known: invitations remain disabled and one user is currently available.

## Sources

### Primary repository evidence

- `site/domain/interview.ts` — principal derivation, workspace-scoped queries, immutable proposal snapshot, confirmation and audit behavior.
- `site/domain/interview-handler.ts` — authenticated handler, CSRF and request-security enforcement.
- `site/app/api/capabilities/route.ts` — current capability-presence behavior and email exposure.
- `site/tests/interview-handler.test.mjs` and `site/tests/interview-repository.test.mjs` — current negative tests and the contradictory second-workspace bootstrap behavior.
- `site/tests/fixture-safety.test.mjs` — native disabled-effect controls.
- `docs/WAVE-0-CAPABILITY-REPORT.md` — existing hosted evidence and explicit blockers.
- `docs/adr/0004-private-sites-pilot-and-portability.md` — locked runtime and portability boundary.

## Metadata

**Confidence breakdown:**

- Existing stack and code gaps: HIGH — directly inspected in source/tests.
- Authorization architecture: HIGH — derived from locked requirements and current server boundaries.
- R2 hosted behavior: MEDIUM — binding presence is known; lifecycle proof remains to be run.
- Second-principal hosted proof: MEDIUM — required behavior is clear; controlled principal is externally unavailable today.

**Research date:** 2026-07-29  
**Valid until:** 2026-08-28, or sooner if Sites identity/binding behavior changes.
