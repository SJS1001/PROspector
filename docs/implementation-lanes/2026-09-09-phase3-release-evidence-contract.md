# Phase 3 release-evidence contract repair

This local integration repairs the candidate originally proposed in PR #111. It does not provide hosted evidence, authorize a deployment, or advance a Phase 3 plan.

## Contract

- Private synthetic-proof authorization and consumption require an explicit server-derived release-evidence tuple.
- Only the fully fenced `LOCAL_DEMO` route may inject the checked disposable synthetic tuple. Ordinary and hosted routes require explicit runtime bindings and fail closed when they are absent or malformed.
- Authorization rows bind source revision, migration identity and digest, fixture digest and provenance. The offline preflight compares the authorization tuple to the exact reviewed local manifest tuple.
- Migration `0020_private-synthetic-proof-migration-identity.sql` adds a required immutable migration identity. Pre-existing rows are retained as `legacy-unbound`; they remain harmless historical data and cannot be consumed as current authority. New authorizations must carry a canonical identity.
- Legacy or stale authorization rows project neutral private-proof state on reads. Mutating or consuming proof still fails closed.

## Regression evidence

The migration upgrade test constructs a valid database at the `0019` boundary with foreign keys and all admission triggers enabled, inserts a legitimate predecessor authorization, applies `0020`, and verifies backfill, canonical admission, rejection of a new legacy identity, immutability, and clean `PRAGMA foreign_key_check` results before and after the upgrade.

The migration source-of-truth tests derive their adversarial next index from the checked head so a real new migration cannot collide with a hardcoded test filename. Handler tests verify that the aggregate release-evidence contract is required and threaded into both proof commands without depending on source-comment spelling.

## Authority retained

This is local code and test evidence only. It selects no target or provider, accesses no credential or real data, performs no export or outbound action, changes no hosted state, and earns no plan or phase credit. Hosted Phase 3 execution remains gated on the exact real-principal, target, migration, private-boundary, zero-effect, independent-review, and owner-acceptance evidence required by the checked plans.
