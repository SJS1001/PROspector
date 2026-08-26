# Accelerated implementation program

## Scope and boundary

This program applies only to the fresh, isolated, owner-only PROspector pilot.
Its non-secret controller identity is recorded in
[`DEPLOYMENT-OWNERSHIP.md`](DEPLOYMENT-OWNERSHIP.md). The original deployment
and database are historical and must not be accessed, copied, restored, or
changed by this program.

The objective is a usable governed product: confirmed commercial knowledge,
evidence-backed discovery and qualification, controlled enrichment, governed
Gmail/manual-call preparation, CSV handoff, and recoverable workspace export.
No real prospects, paid providers, messages, calls, schedules, integrations,
or credentials are activated by implementation work alone.

## Current baseline

- The application builds, lints, and its local suite passes.
- Phase 1 and the local portions of Phases 2 and 3 are implemented; Phase 4
  has foundation work; later phases are planned.
- The first fresh private release failed before publishing because its database
  migration importer returned `incomplete input: SQLITE_ERROR`.
- Local SQLite and Miniflare-style migration tests accept the chain, but they
  do not prove compatibility with the Sites migration importer.
- The repository now has a disposable local SQLite bootstrap at
  `site/scripts/local-bootstrap.mjs`; it applies the complete chain only to
  ignored local state and verifies foreign keys. It creates no operational,
  provider, contact, or outbound data.
- The guarded `LOCAL_DEMO` runtime now exercises the first complete governed
  product loop in a real browser: initialize a disposable interview, enter the
  URL-addressable Knowledge workspace, review the exact projected commercial
  destination, submit an answer, and separately confirm it into a Knowledge
  Version. The local transport uses the dedicated interview boundary only for
  those two interview commands on canonical loopback hostnames; every other
  Knowledge command remains on the Phase 2 activation-gated boundary. Focused
  regression coverage proves exact destination and revision authority and
  zero change to downstream operational tables.

## Dependency-ordered master plan

1. **Release-foundation repair.** Add a Sites-compatible migration-boundary
   contract; normalize the fresh migration chain; inspect the failed fresh
   database only through supported read-only views to establish whether it is
   empty/transactionally rolled back or partial; then save and privately
   deploy a reviewed replacement version. Never alter the original system.
2. **Private-boundary acceptance.** Configure the owner-only runtime values in
   Sites, prove owner admission and neutral denial with controlled synthetic
   data, and retain no secrets or private evidence in Git.
3. **Commercial-model acceptance.** Complete the confirmed-knowledge,
   hierarchy, drift, and activation checks against the fresh target. Keep the
   consensus gate absent until its exact authorization requirements pass.
4. **Product readiness and discovery.** Finish remaining Phase 3 owner and
   private-hosted evidence; implement/test Phase 4 profile readiness,
   runner-scope contracts, provenance, qualification, and review queue using
   synthetic fixtures only.
5. **Controlled contact preparation.** Complete Phase 5’s grant, budget,
   verified-contact, freshness, and identity-resolution code/tests. Provider
   composition stays reject-only until an owner supplies approved provider and
   cost authority.
6. **Governed outreach.** Implement and test Phase 6 approval, suppression,
   Gmail composition, delivery-unknown, and manual-call outcome paths behind
   disabled adapters. OAuth, sending, and calling require later specific owner
   authorization and credentials.
7. **Pilot handoff and recovery.** Implement and test Phase 7 seeded Mining
   hierarchy, CSV export, encrypted archive, and clean-restore dry run with
   synthetic data and all schedules/sending disabled.
8. **Final release.** Independently review security/privacy, execute private
   synthetic UAT, prove restore and negative cases, then obtain exact owner
   acceptance before enabling any real-world effect.

## Parallel work lanes

While the release-foundation repair is underway, these non-overlapping local
lanes may proceed: migration compatibility tests; Phase 4 qualification and
UI contracts; Phase 5 verification/freshness and budget tests; Phase 6
suppression/approval tests with disabled adapters; Phase 7 CSV/archive tests;
independent security, privacy, accessibility, and documentation reviews.
Each lane must use synthetic fixtures and preserve disabled external adapters.

## External handoff checklist

Before any real provider or outbound capability is enabled, the owner must
provide the exact scoped approval, approved account/credential setup, cost
limit where applicable, private target acceptance, and required independent
review evidence. Gmail requires controlled OAuth and per-message immutable
approval; calling requires verified business numbers and manual outcome
logging; enrichment requires a single-use provider/cost grant; schedules and
prospecting require explicit owner activation. Generic approval never enables
any of these effects.
