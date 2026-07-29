# Phase 1: Private Pilot Boundary - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the existing private Sites pilot is an owner-only, isolated, auditable, provider-portable boundary. This phase may expose only the accepted low-sensitivity Consensus Interview lifecycle. It must keep real leads, contacts, imports, schedules, exports, credentials, runner work, paid work, and outbound effects disabled until later phases prove their own gates.

</domain>

<decisions>
## Implementation Decisions

### Identity and Workspace Isolation
- Trusted server identity headers are the only source of the principal; client-supplied user or workspace identifiers never confer authority.
- The pilot permits exactly one owner principal and one Company Workspace. Invitations and multi-user controls remain unavailable in v1.
- Authorization is enforced at route, row, and object boundaries, with explicit negative proof for an unauthorized or second principal.
- Missing, malformed, conflicting, or untrusted identity fails closed without exposing workspace data.

### Capability and Human-Authority Boundary
- Capabilities are measured and displayed individually; a binding or UI control being present is not proof that the capability is safe to use.
- Consequential knowledge requires a distinct confirmation action. Spend, readiness, export, calling, and sending require their own later authorities and cannot be inferred from adjacent state.
- Existing fixture controls for prospecting, approval, discovery, CSV, and export remain natively disabled until their owning phases pass.
- The application does not introduce CRM opportunity, pipeline, forecast, contract, revenue, or customer lifecycle state.

### Hosted Proof and Audit
- Phase 1 proof must cover trusted owner identity, D1 persistence, R2 write/read/delete durability, route/row/object isolation, mutation protection, secrets handling, and auditable capability evidence.
- The second-principal isolation check uses controlled proof and must not enable pilot invitations.
- Security-sensitive responses are non-cacheable and mutations fail closed on Origin, Fetch Metadata, intent/CSRF, content type, and bounded-body violations.
- Evidence records distinguish demonstrated, unavailable, and unproven capabilities; unproven capabilities remain disabled.

### Portability and Data Hygiene
- Sites, D1, and R2 remain adapters behind provider-neutral domain ports so a failed capability gate can select another compatible host without changing the commercial model.
- No secret, provider credential, real operational lead/contact data, or export passphrase enters Git.
- The complete workspace archive and restore drill belong to Phase 7; Phase 1 only establishes the storage and adapter boundary needed to make that future proof possible.
- Legacy files and July 24 lead artifacts remain outside the live pilot until an authenticated, ignored import workflow is authorized.

### Claude's Discretion
- Exact internal module names, status-card layout, and test-fixture organization may follow the existing TypeScript, Drizzle, and Node test patterns as long as the locked behavior above remains observable.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `site/app/chatgpt-auth.ts` already derives an authenticated user from trusted Sites identity headers.
- `site/app/api/capabilities/route.ts` already probes D1, reports R2 binding presence, and returns a non-cacheable capability response.
- `site/domain/request-security.ts` already centralizes same-origin, Fetch Metadata, intent, JSON content-type, and bounded-body checks.
- `site/db/schema.ts` already defines workspace-scoped records and audit events, and `site/db/index.ts` centralizes the D1 adapter.
- `site/tests/request-security.test.mjs` and `site/tests/fixture-safety.test.mjs` provide executable patterns for fail-closed mutation and disabled-effect proof.

### Established Patterns
- The application is TypeScript/React with a Cloudflare Worker entry point, Drizzle/D1 persistence, and Node tests loaded through Vite.
- The current hosted slice uses server-derived identity and separate Answer and Confirmation mutations.
- Consequential controls are rendered with native `disabled` attributes when their capability gate has not passed.
- Worker responses receive centralized security headers.

### Integration Points
- Strengthen principal-to-workspace authorization at the server route/repository boundary rather than in client state.
- Extend the capability endpoint and its UI consumer with evidence-backed states instead of booleans that imply proof.
- Add R2 proof through a storage port and controlled probe path; do not couple domain code to the bucket API.
- Extend the audit repository and hosted validation scripts/tests for negative principal, object isolation, mutation, and durability evidence.

</code_context>

<specifics>
## Specific Ideas

Keep the current private hosted site as the Phase 1 proof surface. The owner should be able to understand, in plain language, which capabilities are proven, which are blocked, and why broader operation is still unavailable.

</specifics>

<deferred>
## Deferred Ideas

- Invited users and scoped roles remain v2.
- Product discovery, prospecting, enrichment, Gmail, calling, CSV handoff, and workspace restore remain in their owning roadmap phases.
- Controlled Google OAuth, scheduler, and runner callback proofs are not promoted into Phase 1 merely because the capability view names them.

</deferred>
