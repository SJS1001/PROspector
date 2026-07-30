# ADR-0001: Generic Company, Product, and Market Play model

- Status: Accepted
- Date: 2026-07-29

## Context

The repository began as a ONE for Mining workflow. The desired product must support different companies, multiple products, and one product entering multiple markets without leaking market-specific claims or evidence.

## Decision

Use `Company -> Product -> Market Play -> Customer Profile -> Offer` as the commercial hierarchy. Deploy one isolated Company Workspace per private pilot Site. Treat ONE for Mining and ONE for Marine as Market Plays while ONE's core capability, delivery, roadmap, and commercial identity remain shared. Create a new Product when those fundamentals materially diverge.

Organizations and Contacts have Company-wide identity. Accounts, Targets, relevance, evidence, qualification, and outreach remain Market Play-specific.

## Consequences

- Core Product knowledge can be reused without copying market evidence.
- Profiles run and report independently.
- Identity merge/split and cross-play association need explicit policies.
- A deployment cannot host multiple Companies in the pilot.
