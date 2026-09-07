# PROspector — Human-governed GTM operating system

PROspector learns a Company's Products and intended customers through a one-question-at-a-time Consensus Interview, then turns confirmed knowledge into evidence-backed discovery, qualification, review, controlled enrichment, outreach preparation, and CSV handoff.

The repository began as ONE for Mining. That work is now a migration seed for the generic product, not the platform's fixed data model or runtime policy. The accepted direction is in [`docs/DIRECTION.md`](docs/DIRECTION.md), the executable contract in [`docs/IMPLEMENTATION-SPEC.md`](docs/IMPLEMENTATION-SPEC.md), and the build sequence in [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).

## Current state

- Product direction and domain language: accepted.
- Implementation contract and ADRs: under adversarial review.
- Hosted application: not yet production-ready.
- Legacy Mining enrichment: excluded from production because it can promote generated/MX-only addresses.

## Repository areas

- `docs/`: generic product direction, ADRs, implementation contract, plan, and migration manifest.
- `CONTEXT.md`: canonical platform language.
- `plays/one-for-mining/`: Mining-specific language.
- `strategy/`, `assets/`, `source/`, and `ops/`: legacy ONE for Mining material to import as proposed knowledge.
- `enrichment/`: unsafe legacy prototype retained as migration evidence; do not expose or deploy.

## Non-negotiable runtime controls

- AI Runners are untrusted contributors, never the system of record.
- Confirmed Knowledge changes only through an explicit operator decision.
- Paid enrichment and every exact outbound email require immutable, scoped approval.
- Generated or MX-only email guesses never qualify as verified contacts.
- Explicit opt-out and do-not-call suppression always overrides approval.
- Live operational data, contacts, outreach, suppression, and secrets never enter Git.

## Legacy ONE for Mining material

Go-to-market system for **Digitalrain's ONE for Mining** — the decision layer for mine uptime, recovery and throughput. This repo holds the strategy, sales/marketing assets, the automated prospecting agent, and a self-hosted contact-enrichment pipeline.

Built and verified with web-sourced facts; every competitive/market claim is cited in-file.

## What's here

```
PROspector/
├── strategy/        # who we sell to and how
│   ├── ICP-MINING.md              ICP: segments, tracks, signals, disqualifiers, pain taxonomy
│   ├── CONTEXT.md                 Glossary — canonical language (defensible wording rules)
│   ├── SALES-MARKETING-PLAN.md    Positioning, email, phone, social, 90-day plan
│   ├── BATTLECARD-MINING.md       Verified competitor battlecard (AVEVA, Palantir, AspenTech, Metso, Cognite)
│   └── EVENTS-ORGS-CACHE.md       Cached events/orgs/forums + blind spots (status-tracked)
├── assets/          # sales & brand collateral (copy, paste into branded templates)
│   ├── ONE-PAGER.md               Sales leave-behind
│   ├── SECURITY-ONE-PAGER.md      OT/security one-pager (clears the security review)
│   └── CHANNELS-AND-SOCIAL.md     LinkedIn pages, founder profile, launch posts, gap checklist
├── ops/             # how to run it
│   ├── SETUP-RUNBOOK.md           Step-by-step setup (YOU / ME actions, credit budget)
│   └── nightly-agent-prompt.md    The mining-prospector scheduled-task prompt (source of truth)
├── enrichment/      # self-hosted contact enrichment (the "own Apollo" pipeline)
│   └── ...                        See enrichment/README.md — certification gate, discover, verify
└── source/          # original ONE materials (extracted)
    ├── Miningbrochure.md
    └── Digitalrain-ONE-for-Mining.md   (deck speaker-notes script)
```

## The system in one picture

```
Nightly agent (mining-prospector)         → finds + CERTIFIES leads (no Apollo spend)
        │  digest-*.md + leads-*.json
        ▼
You review, pick worthwhile leads          → HUMAN IN THE LOOP (your rule)
        │
        ▼
Enrichment (Apollo on-demand, or OSS)      → name + title + verified email + LinkedIn
        │
        ▼
Outreach (email / phone / social)          → sequences in SALES-MARKETING-PLAN.md
```

## Legacy standing rules

These remain proposed Mining guardrails until confirmed during migration:

- On-demand enrichment only; the generic runtime additionally requires a single-use provider/cost approval grant.
- “Live/production” attaches to the software at Engebø, figures are masked for client data security, and Rolls-Royce is team background only—never an endorsement or logo use.
- The legacy compliance sentence was not executable. ADR-0005 records the explicit pilot choice: jurisdiction guidance is advisory, while sender identity, unsubscribe, approval, audit, and opt-out/do-not-call suppression are hard controls.

## No production quick start yet

Do not run the legacy scheduled-task/enrichment path for production contact data or outreach. It is archived migration evidence and does not meet the new verification, approval, suppression, or audit contract. The safe quick start will be added when Wave 3 and the final adversarial gate pass.

For the guarded, generic blank-workspace flow and its strict local-only boundary, see [Generic company onboarding](docs/GENERIC-ONBOARDING.md).

## Legacy status

The Mining strategy and assets exist. The old agent/enrichment pipeline is not the new application's runtime and must not be treated as production-safe.
