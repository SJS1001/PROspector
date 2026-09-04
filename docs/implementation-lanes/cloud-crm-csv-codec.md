# Cloud CRM CSV codec lane

Recovered integration adds whitespace/control/BOM formula defenses, immutable
checksum-bound byte access, and exact UTF-8 input/output/multibyte-ID limit
tests. The revised focused suite passes 8/8; standalone strict TypeScript and
touched lint pass. See `2026-09-04-recovered-integration.md`. The original
six-case cloud result below is historical, not the final integration evidence.

- Base: `origin/main` at `38d86681cd7a8e9f5be70b56365d9be2a786f0ad`
- Branch: `codex/cloud-crm-csv-codec`
- Owned files: `site/domain/crm-csv-codec.ts`, `site/tests/crm-csv-codec.test.mjs`, and this record
- Scope: offline closed-input CSV encoding using the existing Phase 7 canonical 22-column policy, deterministic stable-ID ordering/deduplication, formula neutralization, and exact-byte SHA-256
- Focused verification: `node --test tests/crm-csv-codec.test.mjs` — PASS, 6/6; `npx eslint domain/crm-csv-codec.ts tests/crm-csv-codec.test.mjs` — PASS
- Limitations: no eligibility/source read, persistence, route, download, delivery, provider, hosted action, phase acceptance, or operational activation; canonical full test/build validation remains pending coordinator authorization
