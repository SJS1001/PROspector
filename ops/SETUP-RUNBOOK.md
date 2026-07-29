# Digitalrain / ONE for Mining — Setup Runbook

Step-by-step to get the whole GTM system live. **[YOU]** = you do it; **[ME]** = I do it in chat. Work top to bottom; each phase notes what "done" looks like. We'll go through it together, one step at a time.

**Golden rule (your instruction):** nothing hits Apollo automatically. The nightly agent only delivers *leads*; you review and pick which ones get enriched; only then do I spend a credit. You have **90 Apollo lead credits** — treat them as ~90 reveals/month.

---

## Phase 0 — What's already built (no action)
- ✅ ICP locked (`ICP-MINING.md`), glossary (`CONTEXT.md`)
- ✅ Sales & marketing plan (`SALES-MARKETING-PLAN.md`), competitor battlecard (`BATTLECARD-MINING.md`)
- ✅ Nightly prospector scheduled (`mining-prospector`) — finds + certifies leads, writes digest + `leads.json`, **no Apollo calls**
- ✅ OSS enrichment pipeline (`oss-enrichment/`) — optional self-hosted enrichment
- ✅ Channels + social copy (`CHANNELS-AND-SOCIAL.md`), one-pagers (`ONE-PAGER.md`, `SECURITY-ONE-PAGER.md`)
- ✅ Apollo connected (Steven, 90 lead credits)

---

## Phase 1 — Apollo (human-in-the-loop)  ✅ connected
- ✅ **[done]** Apollo authenticated.
- **[YOU]** Decide your monthly enrichment budget. Recommended: enrich ≤3 leads/night (~90/mo) — or just on-demand when a lead looks strong.
- **[ME]** When you send me picked leads, I enrich via Apollo (`people_match` / `mixed_people_search`) and return name, title, verified email, LinkedIn. You approve before any outreach.
- **Definition of done:** you know your budget rule; you've seen one test enrichment (we'll do it in the walkthrough).

## Phase 2 — Nightly prospector (turn it on properly)
- **[YOU]** Open the **Scheduled** panel → `mining-prospector` → click **Run now** once. This pre-approves web-search permissions so future 6am runs don't pause.
- **[ME]** I review the first digest with you, tune queries/regions if needed.
- **Done:** a `digest-*.md` + `leads-*.json` appear in the Scheduled folder; quality looks right.

## Phase 3 — Enrichment loop (the core daily habit)
1. **[YOU]** Read the morning digest; mark the leads worth a credit.
2. **[YOU→ME]** Paste/point me to those leads.
3. **[ME]** Enrich them via Apollo (or the OSS pipeline if you prefer free-first); return contacts.
4. **[YOU]** Approve which go into outreach.
- **Done:** you have a repeatable "leads → pick → enrich → approve" rhythm.

## Phase 4 — LinkedIn (P0 presence)
- **[YOU]** Create the **company page** at linkedin.com/company/setup → paste copy from `CHANNELS-AND-SOCIAL.md` §2 (name, tagline, About, specialties). Add logo + banner.
- **[YOU]** Update the **founder profile** headline + About from §3 (only the parts literally true).
- **[YOU]** Post **Launch Post 1** (§4). 
- **[ME]** I'll review your drafts before you publish and adjust tone.
- **Done:** company page live + founder profile updated + first post up.

## Phase 5 — One-pagers → branded PDFs
- **[ME]** Copy is written (`ONE-PAGER.md`, `SECURITY-ONE-PAGER.md`).
- **[YOU + ME]** You confirm the bracketed facts (HQ, security specifics — confirm with engineering). I can generate branded PDF/DOCX versions once facts are filled.
- **[YOU]** Engineering signs off the security one-pager before it leaves the building.
- **Done:** two clean PDFs ready to send.

## Phase 6 — Website tightening
- **[YOU + ME]** I draft demo-request + trust/security section copy; you (or your web person) place it. Make `hello@digitalrain.ai` and "book a diagnostic" obvious.
- **Done:** site has a clear CTA + a proof/trust line.

## Phase 7 — Outreach (only after Phases 3–5)
- **[YOU]** Set up sending domain/mailbox + a suppression list. Read the compliance section (GDPR/CASL/Spam Act) in the plan & OSS README.
- **[ME]** Personalize the cold-email sequences (`SALES-MARKETING-PLAN.md` §3) per approved, enriched lead.
- **[YOU]** Send (you press send — I draft, you approve).
- **Done:** first sequence running to a real, approved contact.

## Phase 8 — Later (scale & credibility)
- **[YOU/ME]** Lightweight CRM to hold the pipeline (the real missing system).
- **[YOU]** Pursue a **second reference customer** (highest-leverage credibility).
- **[ME]** Walkthrough/demo video script; lead magnet; guest article.

---

## Quick decisions I need from you as we go
1. **Enrichment budget rule:** on-demand only, or auto-cap ≤3/night? *(default: on-demand)*
2. **Enrichment source default:** Apollo first (uses credits) or OSS/free-first then Apollo for gaps?
3. **Whose profile carries the Rolls-Royce line** (must be literally true for that person)?
