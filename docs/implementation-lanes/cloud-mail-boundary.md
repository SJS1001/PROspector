# Cloud mail boundary implementation lane

Recovered integration binds all approved-message fields into each originated
marker and rejects unknown symbol keys at every record level. Revised focused
tests pass 6/6; standalone strict TypeScript and touched lint pass. See
`2026-09-04-recovered-integration.md` for integration evidence and pending gates.

- Branch: `codex/cloud-mail-boundary`
- Base: `38d86681cd7a8e9f5be70b56365d9be2a786f0ad`
- Base tree: `098689052d412d93972c67131dda8b2b5638e772`
- Scope: disconnected provider-neutral mail port plus immutable reject-only Gmail adapter

## Files

- `site/domain/ports/mail.ts`
- `site/adapters/gmail.ts`
- `site/tests/gmail-boundary.test.mjs`
- `docs/implementation-lanes/cloud-mail-boundary.md`

## Validation

- `cd site && node --test tests/gmail-boundary.test.mjs tests/outreach-preparation-boundary.test.mjs` — PASS, 7/7
- `cd site && npx eslint domain/ports/mail.ts adapters/gmail.ts tests/gmail-boundary.test.mjs` — PASS
- `cd site && npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler domain/ports/mail.ts adapters/gmail.ts` — PASS

## Limitations and claims

- The Gmail adapter is `UNCONFIGURED`, immutable, disconnected, and always rejects.
- No provider transport, endpoint, SDK, credential resolver, OAuth binding, account selection, network capability, runtime caller, route, worker, or provider invocation was added.
- Reconciliation retains `delivery_unknown` when originated evidence is absent or conflicting and never authorizes automatic retry.
- Tests use synthetic `.invalid` references only and record zero provider invocation.
- Canonical full test/build, preflight, deployment, and CI validation remain pending under the coordinator's hold.
- This lane makes no hosted evidence, provider capability, phase completion, phase acceptance, deployment, or production activation claim.
