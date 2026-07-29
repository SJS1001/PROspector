# ADR-0003: Untrusted AI Runners and human approval gates

- Status: Accepted
- Date: 2026-07-29

## Context

Codex, Claude, and API-backed models are useful for research and drafting but can hallucinate, follow malicious source instructions, replay operations, or spend money. The application must remain the authority.

## Decision

AI Runners are untrusted, scoped contributors. They receive minimized assignments through short-lived assignment-bound credentials and may submit sourced findings or status only. Application code validates schemas, source rules, hard gates, scoring, budgets, suppression, and state transitions.

Paid enrichment requires a single-use grant. Every outbound email requires approval of an immutable send artifact. Neither approval can be inferred from an AI response.

## Consequences

- Runner and provider adapters remain replaceable.
- Results require provenance and defensive ingestion.
- Replay, prompt-injection, budget, and concurrency tests are release gates.
