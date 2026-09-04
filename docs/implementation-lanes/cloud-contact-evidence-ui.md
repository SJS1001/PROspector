# Cloud contact evidence UI lane

Recovered integration now validates bounded reject-only projections, replaces
server capability labels with trusted copy, omits contact-like identifiers, and
uses shared GET-only unknown-outcome recovery with confirmation reset and stale
generation fencing. Its focused tests cover functions and static rendering;
they do not establish real-browser acceptance. See
`2026-09-04-recovered-integration.md` for evidence and remaining gates.

- Base: `origin/main` at `38d86681cd7a8e9f5be70b56365d9be2a786f0ad` (tree `098689052d412d93972c67131dda8b2b5638e772`, identical to the merged pilot tree).
- Branch: `codex/cloud-contact-evidence-ui`.
- Scope: bounded presentation of already-public contact observation kind, verification class, method, and verification time; fail-closed confirmation refresh and asynchronous-response state.
- Files: `site/app/prospects/contact-leaves.tsx`, `site/app/prospects/contacts-workspace.tsx`, `site/app/prospects/contact-confirmation-state.ts`, `site/tests/contact-evidence-presentation.test.mjs`, `site/tests/contact-confirmation-state.test.mjs`, and this record.
- Validation: focused contact evidence/confirmation tests, existing Contacts UI tests, and touched-file ESLint only.
- Limitations: synthetic fixtures only; POST remains reject-only; granted operation remains disabled; no contact values, source locators, provider details, credentials, provider calls, hosted actions, phase acceptance, or operational activation. Canonical full test/build/preflight and CI validation remain pending under coordinator authority.
