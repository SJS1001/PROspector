# ONE for Mining — OSS Contact Enrichment Pipeline

> **Archived unsafe prototype — do not use for production contacts or outreach.** This code can generate email patterns, treat MX-only domain checks as sufficient confidence, call a paid provider without the new approval-grant ledger, and export the result. It is retained only as migration evidence. The generic PROspector runtime must follow `docs/IMPLEMENTATION-SPEC.md`. The CLI and MCP entry points require an explicit local-only acknowledgement and remain ineligible for deployment.

Historically, this was described as a self-hosted enrichment engine. That description is preserved below for forensic context, not as current operating guidance.

It does **not** replicate Apollo's contact *database* (that's Apollo's moat — contributed + licensed data you can't legally recreate). It owns the *orchestration* and rents the *data layer* only when needed.

---

## The certification gate (answers: "will it only enrich warm certified leads?")

**Yes.** `enrich/gate.py` runs first. Only leads that pass are enriched; everything else is logged with a reason and skipped — no effort/credits spent on cold leads.

A lead is **certified** when ALL are true (configurable in `config.yaml`):
- track is `operating` or `greenfield` (your beachheads) — `channel`/`multiplier` are logged, not enriched
- it matches ≥1 pain signal from the taxonomy
- it has a resolvable company domain
- it is not disqualified

Plus two cost guards: a **nightly cap** (default 10, strongest leads first) and **dedup** (won't re-enrich an account seen in the last 30 days).

---

## How it works

```
leads.json (from nightly agent)
        │
   [1] GATE  enrich/gate.py        → certified? else skip (logged)
        │
   [2] CAP + DEDUP                 → keep top-N freshest certified
        │
   [3] DISCOVER  enrich/discover.py
        │   ├─ Hunter domain-search (if HUNTER_API_KEY)  → name+title+email  [best]
        │   └─ theHarvester CLI (if installed)           → emails (+derived names) [free]
        │
   [4] PATTERN GAP-FILL  enrich/patterns.py  → name+domain → ranked email guesses
        │
   [5] VERIFY  enrich/verify.py    → mx | smtp | hunter | none → confidence 0..1
        │
   [6] OUTPUT  → out/contacts-YYYY-MM-DD.{csv,json}  (title-ranked, LinkedIn hints)
```

Everything degrades gracefully: no Hunter key + no theHarvester = it still runs (gate + patterns + verify), just with thinner discovery.

---

## Install

```bash
cd oss-enrichment
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# optional, much better discovery:
pipx install theHarvester        # free, OSS
export HUNTER_API_KEY=...         # optional, paid; best name+title+email + verification
```

## Usage

```bash
# from the nightly agent's structured output
python -m enrich.cli --leads leads-2026-06-28.json

# or parse the markdown digest (fallback, lossy)
python -m enrich.cli --digest digest-2026-06-28.md

# single company
python -m enrich.cli --company "Northvale Copper" --domain northvale.com --track operating --pains 3,5

# overrides
python -m enrich.cli --leads leads.json --cap 5 --verify hunter
```

Try it now with the bundled sample:
```bash
python -m enrich.cli --leads sample_leads.json --verify none
```

---

## Discovery & verification options

| | What it needs | Gives you | Quality |
|---|---|---|---|
| Hunter domain-search | `HUNTER_API_KEY` (free tier: 25/mo) | name + title + email | best |
| theHarvester | `pipx install theHarvester` | emails (names derived) | free, decent |
| pattern gap-fill | a name + domain | candidate emails | needs verification |

| Verify method | Needs | Note |
|---|---|---|
| `none` | — | confidence = pattern prior only |
| `mx` | dnspython | confirms the **domain** receives mail, not the mailbox |
| `smtp` | port 25 egress | RCPT probe; often blocked/greylisted, many servers accept-all |
| `hunter` | `HUNTER_API_KEY` | real per-address score — recommended |

> Honest limitation: `mx` only proves the domain accepts mail. For real per-address validation use `hunter`. Pattern-guessed emails are *candidates* until a real verifier scores them — don't blast unverified addresses (bounces wreck sender reputation).

---

## Wiring to the nightly agent

The `mining-prospector` scheduled task writes a `digest-YYYY-MM-DD.md` and (once updated) a machine-readable `leads-YYYY-MM-DD.json` with: `company, domain, track, pains, country, commodity, signal, source_url, disqualified`. Point this pipeline at that JSON:

```bash
python -m enrich.cli --leads /Users/stevensmith/Documents/Claude/Scheduled/mining-prospector/leads-2026-06-28.json --verify hunter
```

You can also schedule this pipeline to run right after the agent. (Or use `mcp_server.py` to expose `enrich_company` / `enrich_leads` as tools your assistant calls directly.)

---

## Compliance — read before you send anything

You become the **data controller** for any personal data you collect and store. That carries real obligations:

- **GDPR / UK GDPR (EU/UK contacts):** B2B cold email is generally allowed under *legitimate interest*, but you must keep a lawful-basis record, honor opt-outs, state who you are and why you have their data, and respect erasure requests.
- **CASL (Canada):** stricter — needs express *or* implied consent (e.g. a publicly published business address without a no-marketing notice). Fines to CA$10M.
- **Australia Spam Act:** consent (express/inferred) + identify + unsubscribe.
- **ToS:** scraping LinkedIn violates its terms and has been litigated — this pipeline does **not** scrape LinkedIn (it only generates a public search hint URL for you to click).
- Keep a suppression list; delete on request; don't retain longer than needed.

This tool gathers from public sources and generates/verifies email patterns. Using it lawfully (consent basis, opt-outs, retention) is on you.

---

## Honest comparison to Apollo

| | This pipeline | Apollo |
|---|---|---|
| Contact database | none — discovers per-domain | ~270M verified, queryable |
| Cold "find me 50 plant managers in Chile" | weak | strong |
| Enrich a company you already found | good | good |
| Cost | ~$0 (OSS) → ~$90/mo with Hunter+PDL | $49–400/mo |
| Ownership | fully yours | rented |
| Compliance provenance | yours to carry | theirs |
| Maintenance | you | them |

Use this when you want to own the pipeline and you're enriching companies the agent already surfaced. Use Apollo when you need to query a cold universe of contacts. They can coexist — gate first, then call whichever source you've configured.

---

## Files
- `config.yaml` — gate thresholds, target titles, discovery/verify settings
- `enrich/gate.py` — certification gate (the warm-certified rule)
- `enrich/discover.py` — Hunter / theHarvester discovery
- `enrich/patterns.py` — email-pattern generator
- `enrich/verify.py` — mx / smtp / hunter verification
- `enrich/digest.py` — load leads.json (or parse markdown digest)
- `enrich/pipeline.py` — orchestrator + output writer
- `enrich/cli.py` — command-line entry
- `mcp_server.py` — optional: expose as MCP tools for your assistant
- `sample_leads.json` — runnable example
