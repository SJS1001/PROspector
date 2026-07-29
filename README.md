# PROspector — ONE for Mining GTM System

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

## Standing rules (do not break)
- **On-demand enrichment only** — nothing calls Apollo automatically; you approve each spend. Apollo free tier ≈ 90 lead credits/month.
- **Defensible language** (see CONTEXT.md): "live/production" attaches to the **software** at Engebø, not the mine's commercial production; Engebø figures are **masked for client data security**, not unproven; **Rolls-Royce = team background only**, never an endorsement, no logos.
- **Compliance:** cold outreach must honor GDPR / CASL / Australia Spam Act — keep a suppression list and lawful basis (details in SALES-MARKETING-PLAN.md and enrichment/README.md).

## Quick start
1. Read `ops/SETUP-RUNBOOK.md`.
2. Run the `mining-prospector` scheduled task (Cowork → Scheduled → Run now).
3. Review the digest, pick leads, enrich on-demand.
4. Stand up LinkedIn + one-pagers (`assets/`), then run outreach.

## Status
Strategy, assets, agent, and enrichment pipeline: built and tested. Open items: connect a CRM, land a second reference customer, join GMG. See `strategy/EVENTS-ORGS-CACHE.md` and the red-team notes in the plan.
