# ADR-0002: Confirmed Knowledge and immutable Effective Configuration

- Status: Accepted
- Date: 2026-07-29

## Context

Research, uploads, operator edits, and AI suggestions can conflict. Active runs and previously approved outreach must remain reproducible after knowledge changes.

## Decision

Structured Confirmed Knowledge is authoritative. Research and document changes create Proposed Knowledge and never mutate active behavior directly. The operator confirms, rejects, corrects, promotes, or rescopes each material proposal.

Ready Product activation creates an immutable Product Discovery Configuration containing the exact Company, Product, source policy, discovery policy, compliance posture, and runner versions without requiring a Play/Profile/Offer. Ready Profile activation creates an immutable Profile Effective Configuration containing the exact Company, Product, Market Play, Profile, Offer, rubric, source policy, claim guardrails, contact strategy, outreach strategy, and compliance posture versions. Runs, qualification decisions, drafts, and approvals reference the applicable typed configuration.

High-risk Drift pauses only outbound artifacts whose recorded dependency graph reaches the challenged knowledge.

## Consequences

- Historical decisions are reproducible.
- Readiness and drift need deterministic dependency evaluation.
- Editing knowledge creates new versions rather than overwriting rows.
