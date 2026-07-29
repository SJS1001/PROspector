# ONE for Mining Migration Manifest

Status: Review required before pilot import

This manifest prevents legacy files from becoming active platform truth merely because they are in Git. Import creates Proposed Knowledge unless a row below says `confirmed seed`. The operator reviews every imported scope before Product/Profile readiness.

## Target structure

- Company: Digitalrain
- Product: ONE
- Market Play: ONE for Mining
- Customer Profile: Operating mineral-processing sites
- Draft Customer Profile: Greenfield mining projects
- Initial schedule: weekdays 06:00 America/Toronto
- Weekly target: seven Export-ready Prospects

## Classification

| Source | Import classification | Scope | Treatment |
|---|---|---|---|
| `source/Digitalrain-ONE-for-Mining.md` | proposed source | Product and Mining Play | extract capabilities, limitations, proof, delivery, and claims; require confirmation |
| `source/Miningbrochure.md` | proposed source | Mining Play | extract positioning and market claims; require confirmation |
| `strategy/CONTEXT.md` | proposed/legacy glossary | Mining Play | map terms to canonical root `CONTEXT.md`; do not activate conflicting legacy terms |
| `strategy/ICP-MINING.md` | proposed seed | Mining Profiles | split Operating and Greenfield; confirm fit and disqualifiers |
| `strategy/SALES-MARKETING-PLAN.md` | proposed seed | Mining Play/Profiles | import offers, roles, messages, call script, and guardrails; never import drafts as approvals |
| `strategy/BATTLECARD-MINING.md` | proposed seed | Mining Play | extract competitor context and claim risks |
| `strategy/EVENTS-ORGS-CACHE.md` | account context | Mining Play | import only still-sourced entries; re-research dates before use |
| `assets/ONE-PAGER.md` | proposed document | Mining Play | retain as source artifact; extract claims for confirmation |
| `assets/SECURITY-ONE-PAGER.md` | proposed document with placeholders | Product/Mining Play | placeholders such as retention/deletion are invalid and cannot become confirmed claims |
| `assets/CHANNELS-AND-SOCIAL.md` | proposed strategy | Mining Play | content context only; does not authorize outreach |
| `ops/nightly-agent-prompt.md` | legacy instruction | Mining Operating Profile | archive as migration evidence; replace with versioned generic runner instruction |
| `ops/SETUP-RUNBOOK.md` | legacy operations | Mining Play | archive as migration evidence; no production authority |
| `enrichment/**` | unsafe legacy prototype code | excluded from production | keep for reference/tests until retired; never deploy or expose MCP tools |
| `/Users/stevensmith/Desktop/digest-2026-07-24.md` | pilot import data | Mining Play, typed by track | owner-supplied outside Git; SHA-256 `6f3c8b5c3b984dbe6df1ea21f378c9e10d37ce01c80483df19e888d69967f012`; upload/import as historical run evidence |
| `/Users/stevensmith/Desktop/leads-2026-07-24.json` | pilot import data | Mining Play, typed by track | owner-supplied outside Git; SHA-256 `176eaced470acd38f2195b6f3cec0901055d9d78312c63af08775d4588a748ed`; import 25 source objects into typed destinations, preserving nine missing-pain records and zero contacts |

## Confirmed seed from the consensus interview

The following may be staged as `confirmed seed` with decision date 2026-07-29 and operator identity, but still require a final readiness review in the application:

- the generic hierarchy and Digitalrain/ONE/Mining placement;
- Operating as initial active priority and Greenfield as Draft/nurture;
- the five-dimension rubric structure, 7/10 threshold, and non-zero pain/timing rule;
- the source tiers and 30-day normal Signal recency;
- the weekday 06:00 America/Toronto schedule and seven-per-week target;
- champion and economic-buyer two-reveal budget;
- Gmail-only sending and manual phone workflow;
- Company-wide hard suppression and per-message approval;
- existing four-touch Mining email sequence as proposed templates, not approved messages.

## July 24 import mapping (`one-mining-history/v1`)

The JSON root must contain `date` and `leads`; unknown fields are retained in a bounded raw-import object but never promoted. The digest is a source document linked to the same configuration-independent Import Batch. Import items are not Runs, Accounts, Signals, Candidates, or Prospects. Stable imported IDs are UUIDv5 values derived from the import namespace plus artifact SHA-256, zero-based lead index, and record type.

| Source field | Destination | Transform/rule |
|---|---|---|
| root `date` | `import_batch.source_date`, display date | require ISO date `2026-07-24`; no application Run is created before configuration/readiness |
| artifact hash + lead index | batch/item/identity-proposal stable IDs | deterministic UUIDv5; rerun returns the identical batch for import version/hash |
| `company` | unresolved identity bundle | preserve original; parentheses/slashes are not parsed automatically and cannot create Account/Prospect until owner resolves Organization(s), ownership/JV relation, and Target(s) |
| `domain` | Proposed Organization domain | normalize lowercase/IDNA; domain does not prove identity or contact verification |
| `track` | historical source label and typed destination | `operating` -> 13 historical Candidate proposals pending identity review in Operating Profile; `greenfield` -> 8 historical proposals/context under Draft Greenfield (not Candidates); `channel`/`multiplier` -> 4 Organization/strategy proposals with no Prospect state |
| `pains[]` | Proposed signal pain taxonomy refs | map only known legacy integers; empty remains missing and scores 0 |
| `country` | Proposed geography text | do not split multi-country text automatically |
| `commodity` | Proposed Account Context | retain as sourced text, not qualification evidence by itself |
| `signal` | Proposed Signal text | retain verbatim as untrusted text; link source and import hash; never auto-qualify |
| `source_url` | Source URL | require HTTPS; normalize for dedup; historical import does not fetch automatically |
| `disqualified` | historical source flag | `true` creates proposed Disqualified reason pending review; `false` never implies Qualified |
| `name`, `title`, `linkedin` | legacy contact hints | empty values ignored; populated values become Contact Suggestions only and never Enriched Contacts |

Expected validation counts: 25 source objects total; 13 operating historical Candidate proposals pending identity resolution, 8 greenfield historical proposals/context, 2 channel and 2 multiplier Organization/strategy proposals; 9 with empty `pains`; 0 Contact records or Enriched Contacts; 0 automatically Qualified/Approved records. Composite names remain unresolved identity bundles and do not count as created Accounts until reviewed. The Markdown digest headings/rows are retained for historical presentation and cross-checked to the JSON, but JSON is the structured source authority when the two differ. Any mismatch creates an import warning and Proposed Knowledge Conflict.

## Required pre-activation review

1. Confirm every Product capability, limitation, proof point, owner, and Claim Guardrail.
2. Resolve any “live,” Engebø, data-residency, security, Rolls-Royce, or roadmap wording conflicts.
3. Confirm each Operating rubric anchor and hard disqualifier in `IMPLEMENTATION-SPEC.md`.
4. Confirm geography, languages, contact verification providers, and compliance advisory text.
5. Confirm the Offer and commercial viability evidence expected.
6. Re-research sources older than 30 days.
7. Resolve imported July 24 identity bundles and review typed proposals individually; missing pain remains missing.
8. Verify no contact, email, suppression, credential, or private source is committed to Git.

## Acceptance checks

- Migration is idempotent by source path, content hash, and import version.
- Every extracted item retains source path/section, classification, proposed scope, provenance, and decision.
- Placeholders, TODOs, and unresolved conflicts cannot satisfy readiness.
- Legacy `certified` states map to `Candidate`, never `Qualified` or `Approved`.
- Legacy MX scores and generated patterns map to `Contact Suggestion`, never `Enriched Contact`.
- Re-running import creates a drift proposal for changed source content and never overwrites confirmed state.
- Operational artifacts enter only through an authenticated ignored upload/import channel. CI uses a synthetic fixture with the same schema/count edge cases; it never copies the real organizations or signals.
