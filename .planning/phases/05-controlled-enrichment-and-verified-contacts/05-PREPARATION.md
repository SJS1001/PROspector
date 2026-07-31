# Phase 5 local-only preparation authority

**Status:** Owner-authorized conditional preparation; no plan execution or completion

## Decision

After an independent adversarial review returned **REVISE**, the owner authorizes a temporary local-only Phase 5 preparation lane while Phase 4 hosted/human acceptance remains blocked. This is a bounded exception for preparatory implementation only. It does not execute, complete, supersede, or amend Plans `05-01` through `05-09`; their `depends_on` fields remain authoritative, including `05-01`'s dependency on `04-12`.

This decision does not satisfy Phase 4 Plan `04-12`, change Phase 4 status, authorize a Phase 5 summary, or grant runtime enrichment authority.

## Exact precondition

Before the first preparation-lane code change, record one immutable committed Phase 4 candidate SHA in the preparation work evidence; a branch name, dirty worktree, fixture, digest, or status row is not sufficient. On that exact SHA, Phase 4 local code, its required tests, lint/build, and independent source/security/UI audits must be clean with no unresolved blocker or high finding. The precondition is currently **pending**: no candidate SHA is recorded or claimed clean by this authority artifact.

## Mandatory safeguards

1. Use only synthetic Phase 4-shaped fixtures and test-injected fake provider ports. Synthetic inputs are never runtime fallback authority and must not recreate or alter Phase 4 prospect approval, configuration, qualification/evidence lineage, identity/relevance, lifecycle, or drift contracts.
2. Keep every production `ContactProviderPort` composition unconfigured/reject-only. Test injection is the only path to a fake invocation; production routes must not expose a provider, legacy MCP path, or provider SDK/package/credential binding.
3. With Phase 4 acceptance and the applicable runtime capability gate absent, production/runtime paths must fail closed for grant issuance, reservation, contact-evidence ingestion, and `ContactReady` projection. A current accepted Phase 4 authority plus the separate narrow capability gate remains mandatory for any future runtime operation.
4. Do not deploy, access or modify Sites, bind credentials, call a provider, scrape, use real contact data, create a paid request, or spend money. Do not add a real provider package, SDK, endpoint, identifier, key, token, or private operational data to Git, logs, tests, or artifacts.
5. Preserve Phase 5's immutable grant/reservation, provenance, verification-class, freshness, identity, reconciliation, and downstream-containment constraints. Every denied path must prove zero provider calls and zero unauthorized durable mutation; only a committed synthetic reservation may reach one fake invocation.
6. Keep Phase 6 and Phase 7 effects absent: no package/message/send, suppression mutation, click-to-call, export, archive, or downstream eligibility authority. Contact suggestions and stale/invalid contacts remain ineligible.
7. Do not create any `05-xx-SUMMARY.md`, Phase 5 completion/status claim, or Roadmap completion update. Phase 4 hosted/human evidence, all existing Phase 5 plan dependencies, and the later human/hosted/provider release gates remain unchanged and non-substitutable.

## Boundaries and stop condition

The lane stops immediately if the exact Phase 4 clean-SHA precondition is absent, a safeguard cannot be proved locally, a real principal/hosted/control-plane/provider action is required, or the work would be represented as execution of an existing Phase 5 plan. Such evidence remains blocked until the existing plan checkpoints are genuinely accepted.
