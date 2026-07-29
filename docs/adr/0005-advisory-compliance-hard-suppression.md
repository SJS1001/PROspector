# ADR-0005: Advisory compliance with hard suppression controls

- Status: Accepted risk
- Date: 2026-07-29

## Context

Jurisdiction-specific outreach laws differ and change. The original Mining repository said outreach must “honor” GDPR, CASL, and the Australian Spam Act, but did not define executable rules. During the product interview, the operator explicitly chose advice rather than automated legal adjudication.

## Decision

The pilot records and presents jurisdiction, lawful/consent basis, identity, unsubscribe, and evidence as an Outreach Advisory. The operator remains accountable for the decision to send.

The application nevertheless hard-enforces sender identity, a working unsubscribe path, immutable message approval, Company-wide opt-out/do-not-call suppression, and a transactional send-time suppression check. It never represents an advisory as legal approval.

## Consequences

- The pilot does not claim to determine legality.
- The operator knowingly carries jurisdictional compliance risk.
- A future version may install configurable blocking Compliance Policies.
- This ADR supersedes the ambiguous legacy README rule for the generic application; migrated Mining material remains evidence, not platform policy.
