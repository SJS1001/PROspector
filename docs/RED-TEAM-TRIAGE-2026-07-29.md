# Clean Adversarial Review Triage — 2026-07-29

Two independent clean reviews attacked the agreed product/plan before implementation. Both returned `BLOCKED`. This is the ground-truthed disposition, not a dismissal of the reports.

## Blocker and high findings

| Finding | Disposition | Ground truth and resolution |
|---|---|---|
| Plan lacked executable contracts | valid | The prior consensus described intent but not schemas, state transitions, job semantics, rubric anchors, exports, or tests. Added `IMPLEMENTATION-SPEC.md` and measurable wave gates. |
| Advisory compliance contradicted legacy hard rule | severity-adjusted | `README.md:46-49` does contain a hard “honor GDPR/CASL/Australia” statement. The operator later explicitly chose advisory legal guidance. ADR-0005 records that accepted risk and the generic README will supersede the legacy wording. Identity, unsubscribe, approval, audit, and suppression remain hard. Official guidance confirms material jurisdictional risk, which must remain visible in product copy. |
| MX-only guessed emails exported as contacts | valid blocker in legacy code | `config.yaml:30-32`, `pipeline.py:75-89`, and `verify.py:58-59` allow exactly this. Legacy enrichment is excluded from production. The new verification classes categorically exclude suggested/domain-valid addresses from export/approval/send, with regression tests required. |
| Sites compatibility was assumed | valid | ADR-0004 is conditional. Wave 0 must prove identity, D1/R2, schedules, runner callback, Gmail OAuth, secrets, observability, and export/restore before sensitive import. |
| Deployment isolation substituted for authorization | valid | Added principal authorization matrix, server-derived workspace scope, route/row/object enforcement, invitation requirements, and cross-role negative tests. |
| Runner token lifecycle/replay/disclosure undefined | valid | Added short-lived assignment credentials, hash/expiry/audience/nonce/idempotency/state/quota/size rules, minimized context, and abuse tests. |
| Approval/budget/suppression atomicity undefined | valid | Added immutable grants and message digests, durable budget reservations, transactional outbox, send-time suppression/drift checks, idempotency, and race tests. |
| Message approval had “substantive edit” ambiguity | valid | Every canonical field change creates a new digest and invalidates approval. There is no edit classifier. |
| Global suppression lacked identity semantics | valid | Added exact subject types, E.164 phones, cautious alias handling, merge union, tombstones, import-before-activation, and send-boundary checks. |
| Full inherited configuration was not versioned | valid | Replaced profile-only operational reliance with immutable Effective Configuration Snapshot referencing every inherited version. |
| Workspace export was an exfiltration/restore risk | valid | Added step-up authorization, encrypted versioned archive, checksums/authentication, expiring delivery, audit, dry-run restore, and drills. |
| Cross-company reusable package sanitization undefined | valid | Added versioned positive allowlist, source confirmation, provenance/license, PII/secret scanning, destination proposal/confirmation, digest, revocation, and lineage. Owner-only pilot cannot supply two-person review; automated scanning plus explicit source/destination confirmations are required. |
| Prompt injection and unsafe fetching undefined | valid | Added fetch isolation, network destination blocking, content limits, sandboxed extraction, escaped rendering, minimal runner tools/context, and strict submissions. |
| Legacy agent tool bypassed paid approval | valid | `mcp_server.py:35-47` can invoke Hunter through `discover.py:33-34`. It is excluded from production. New provider calls require a durable, single-use reservation and abuse tests. |
| Mining migration lacked classification | valid | Added `MIGRATION-ONE-MINING.md`; legacy files and July 24 artifacts import as proposed/historical data, not authority. |

## Medium and low findings carried into the contract

- Organization and Contact merge/split policies are explicit and preserve lineage.
- Pilot “consensus” means explicit operator confirmation; future roles can represent additional stakeholders.
- Queue overflow, fingerprints, cool-downs, misfires, overlap, retries, and DST are specified.
- Drift dependencies are immutable and deterministically checked at send time.
- Transactional storage replaces lossy date-named files and swallow-all state reads.
- Retention, deletion propagation, reply minimization, and suppression survival have defaults.
- Run manifests include instructions, tools, sources, transformations, assignments, and approvals.
- Every wave has measurable release evidence.
- Legacy “certification” maps to Candidate and is removed from canonical language.

## Policy risk accepted by the operator

Official regulator guidance makes clear that outreach requirements vary and can include consent, identification, unsubscribe, lawful-basis, and objection handling. ADR-0005 deliberately leaves jurisdictional legal judgment with the operator while enforcing universal product controls. This is the only finding not converted into a full automatic blocking engine; it is an explicit scope choice, not an overlooked defect.
