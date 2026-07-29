# Synthesized Decisions

## ADR-0001: Generic Company, Product, and Market Play model

- source: /Users/stevensmith/Documents/PROspector/docs/adr/0001-generic-company-product-play-model.md
- status: locked
- scope: Company, Product, Market Play, Customer Profile, Offer, workspace isolation, Organization/Contact identity, Account/Target prospecting scope
- decision: Use `Company -> Product -> Market Play -> Customer Profile -> Offer` as the commercial hierarchy. Deploy one isolated Company Workspace per private pilot Site. Keep Organization and Contact identity Company-wide while Accounts, Targets, relevance, evidence, qualification, and outreach remain Market Play-specific. Create a new Product only when capability, delivery, roadmap, or commercial identity materially diverges.

## ADR-0002: Confirmed Knowledge and immutable Effective Configuration

- source: /Users/stevensmith/Documents/PROspector/docs/adr/0002-confirmed-knowledge-and-effective-configuration.md
- status: locked
- scope: Confirmed/Proposed Knowledge, Product Discovery Configuration, Profile Effective Configuration, runs, qualification, outreach, drift
- decision: Structured Confirmed Knowledge is authoritative; research and document changes create proposals only. Ready activation creates immutable typed configurations whose exact versions govern runs and downstream artifacts. High-risk drift pauses only outbound artifacts reached by the recorded dependency graph.

## ADR-0003: Untrusted AI Runners and human approval gates

- source: /Users/stevensmith/Documents/PROspector/docs/adr/0003-untrusted-runners-and-human-gates.md
- status: locked
- scope: AI Runners, assignment credentials, validation, paid enrichment, outbound email, adapters
- decision: Treat AI Runners as untrusted, scoped contributors using minimized assignments and short-lived assignment-bound credentials. Application code owns validation, state, scoring, budgets, suppression, and gates. Paid enrichment requires a single-use grant; every outbound email requires approval of an immutable send artifact.

## ADR-0004: Private Sites pilot with a portability boundary

- source: /Users/stevensmith/Documents/PROspector/docs/adr/0004-private-sites-pilot-and-portability.md
- status: locked
- scope: private Codex Sites pilot, D1, R2, provider ports, Company Workspace Export, owner identity, narrow policy lifecycle, capability gates
- decision: Use one private Codex Site per Company with D1 structured state and R2 objects, behind provider-neutral ports. Permit only the explicitly approved low-sensitivity historian-readiness policy through a separate Answer-to-Confirmation lifecycle until independently proven. Block sensitive pilot data and broader effects until remaining capability gates pass. Treat encrypted clean-restore-capable Company Workspace Export as the exit boundary.

## ADR-0005: Advisory compliance with hard suppression controls

- source: /Users/stevensmith/Documents/PROspector/docs/adr/0005-advisory-compliance-hard-suppression.md
- status: locked
- scope: Outreach Advisory, jurisdiction/consent evidence, sender identity, unsubscribe, approvals, Company-wide suppression, send-time enforcement
- decision: Keep legal/compliance judgment advisory and operator-accountable; never represent advice as legal approval. Hard-enforce sender identity, a working unsubscribe path, immutable message approval, Company-wide opt-out/do-not-call suppression, and a transactional send-time suppression check.
