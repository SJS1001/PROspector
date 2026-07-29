# Document Synthesis

## Source inventory

- Documents synthesized: 19
- ADR: 5
- SPEC: 3
- PRD: 1
- DOC: 10
- UNKNOWN: 0
- Cross-reference graph: acyclic; 11 resolved internal edges; maximum traversal depth 3 (cap 50)
- Precedence applied: ADR > SPEC > PRD > DOC; no per-document override was present

## Locked decisions

Count: 5

- source: /Users/stevensmith/Documents/PROspector/docs/adr/0001-generic-company-product-play-model.md
- source: /Users/stevensmith/Documents/PROspector/docs/adr/0002-confirmed-knowledge-and-effective-configuration.md
- source: /Users/stevensmith/Documents/PROspector/docs/adr/0003-untrusted-runners-and-human-gates.md
- source: /Users/stevensmith/Documents/PROspector/docs/adr/0004-private-sites-pilot-and-portability.md
- source: /Users/stevensmith/Documents/PROspector/docs/adr/0005-advisory-compliance-hard-suppression.md

The locked decisions are compatible: they respectively govern commercial scoping, immutable knowledge/configuration, untrusted runners and approvals, the private portable pilot boundary, and advisory compliance with hard suppression controls.

## Requirements

Count: 17

- REQ-private-human-governed-gtm
- REQ-company-workspace-isolation
- REQ-commercial-hierarchy
- REQ-consensus-interview
- REQ-versioned-knowledge-and-drift
- REQ-product-readiness
- REQ-profile-readiness
- REQ-market-discovery
- REQ-deterministic-qualification
- REQ-evidence-provenance
- REQ-controlled-enrichment
- REQ-contact-verification
- REQ-immutable-outreach-approval
- REQ-hard-company-suppression
- REQ-crm-and-workspace-exports
- REQ-untrusted-runner-boundary
- REQ-initial-operating-target

## Constraints

Count: 41

- api-contract: 2
- schema: 8
- nfr: 11
- protocol: 20

The constraints cover the implementation contract, phased implementation gates, deployment sequence, and ONE for Mining migration contract.

## Context

Topics: 10

The context preserves attributed review notes for the initial plan attack, implementation convergence, review rounds 2–8, and the current Wave 0 capability boundary. Historical `BLOCKED` review verdicts describe defects that were incorporated into the current contract; the current Wave 0 capability gate remains blocked for broader live data and external effects, consistent with locked ADR-0004's narrow exception.

## Conflict result

- blockers: 0
- competing acceptance variants: 0
- auto-resolved precedence conflicts: 0

No low-confidence UNKNOWN source, cross-reference cycle, locked-decision contradiction, competing PRD acceptance variant, or lower-precedence contradiction was detected.

Detailed report: /Users/stevensmith/Documents/PROspector/.planning/INGEST-CONFLICTS.md

## Intel files

- Decisions: /Users/stevensmith/Documents/PROspector/.planning/intel/decisions.md
- Requirements: /Users/stevensmith/Documents/PROspector/.planning/intel/requirements.md
- Constraints: /Users/stevensmith/Documents/PROspector/.planning/intel/constraints.md
- Context: /Users/stevensmith/Documents/PROspector/.planning/intel/context.md
