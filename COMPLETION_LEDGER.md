# PROspector completion ledger

This ledger is the v1 requirement inventory. It is not the 26/74 plan-credit ledger in `COMPLETION.md`. Formal acceptance is the count of rows whose status is `verified`. That count is 0. A product percent is unknown while `verification_mapping` is `partial`. Do not divide 26 by 74 or by 17 and call the result completion.

Local extracts merged on 2026-11-09 are recorded below as test evidence only. Requirement status is unchanged. Formal acceptance stays 0/17. Plan credit stays 26/74. PR #163 adds a fail-closed monitoring classifier that is not one of the 17 v1 requirements, so it is not attached to a requirement row.

Session `claude-ee67a286-2026-11-09` (owner-authorized local work, branch `claude/owner-local-completion-20261109`, commit `0c3ce490d707c0fa0b4eac9178ab05c75491d96f`): merged issue work for #6 (docs), #7 (protocol, label-agreement scorer and fixtures), #8 (plain-language Contacts labels and a Review-to-Contacts link) and #11 (browser run record). `cd site && npm test` exited 0 with 1175 pass, 0 fail, 0 cancelled, 0 skipped across 169 files; `npm run lint` exited 0; `npm run test:browser` 2 pass; `npm run test:browser:operator-journey` 2 pass; `npm run test:browser:person-discovery` 1 fail (recorded as negative evidence under REQ-contact-verification). Fix `72a1b74` then made that lane pass and the full suite pass with 1176 tests (positive evidence under the same row). No requirement status changed.

Session `claude-session_011p7Tficwu9deKJtxSa8dhw` (2026-11-09, owner-authorized local work, 2026-11-09 code review batch 09): PR #168 merged into `claude/owner-local-completion-20261109` as merge commit `769b0401c82d32f2770f106c7a669887fe104f6f` (tested head `ee13240a47dcba940bb667b44312f2ab64e8201c`). The home page now uses a read-only `readCapabilityProjection` in `site/domain/capability-handler.ts`. Server render writes no `csrf_tokens` row, and only a confirmed absent workspace lands on onboarding; a failed capability read stays on Status. `GET /api/capabilities` still issues the CSRF cookie with unchanged HTTP responses. On `ee13240`: `cd site && npm ci` exited 0; `npm run build` exited 0; `node scripts/run-test-suite.mjs tests/home-admission-boundary.test.mjs` 17 pass / 0 fail; `tests/capabilities-route.test.mjs` 5 pass; `tests/capability-state.test.mjs` 1 pass; `tests/csrf-cookie.test.mjs` 1 pass; `npm run lint` exited 0; `npm test` exited 0 with 1181 pass, 0 fail, 0 cancelled, 0 skipped across 169 files; `node --test tests/completion-ledger.test.mjs` 3 pass. Local and synthetic only (in-memory D1 fake for the home tests); not checked in a browser. This is a code-review fix, not one of the 17 v1 requirements, so it is not attached to a requirement row. No requirement status changed; formal acceptance stays 0/17 and plan credit stays 26/74.

Session `claude-011p7Tfj-2026-11-09` (owner-authorized local work, review fix batch 02, PR #167 from branch `claude/review-fix-02-dnc-crm-export`, commit `c8de3ea9b1ea0c22256878e21d5b6a19109b799b`, merged into `claude/owner-local-completion-20261109` as `59c8bdff75fcfc089a9c1a5a90a1458b4eb4cdb1` at 2026-11-09T18:48Z): do_not_call in the synthetic manual-call decision service is recordable after any eligibility or freshness gate lapses, and the synthetic CRM export rejects duplicate rows standing in for selected rows. From `site/` on Node v22.23.4: `npm run build` exit 0; `node --test --test-concurrency=1` gave tests/manual-call-decision-service 21/21, tests/outreach-preparation-manual-call 15/15, tests/outreach-preparation-audit-envelope 12/12 and tests/crm-handoff-export-artifact 9/9; `npm run lint` exit 0; `npm test` exited 0 with 1183 pass, 0 fail, 0 cancelled, 0 skipped (no loopback EPERM). From the repo root, `node --test tests/completion-ledger.test.mjs` 3/3. Recorded at 2026-11-09T18:50Z. No requirement status changed. Formal acceptance stays 0/17. Plan credit stays 26/74.

The source SHA below is the code inspected before this ledger file existed. It is not a hash of this file.

<!-- completion-ledger:v1 -->
```json
{
  "schema_version": "1",
  "project": "prospector",
  "source": {
    "repo": "SJS1001/PROspector",
    "branch": "cursor/schedule-overlap-state-de84",
    "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
    "pr_number": 157,
    "inspected_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
    "canonical_inventory_paths": [
      ".planning/REQUIREMENTS.md",
      "COMPLETION.md"
    ],
    "scope": "17 v1 requirements in .planning/REQUIREMENTS.md. Plan credit 26/74 is a separate ledger and is not a requirement count or a product percent.",
    "coverage": "complete",
    "expected_requirement_count": 17,
    "excluded_scope": "v2 requirements and the out-of-scope table in .planning/REQUIREMENTS.md; plan summaries; ServiceTitan; Distributor; DigitalRain. The dashboard is not built in this repo."
  },
  "snapshot": {
    "recorded_at": "2026-11-08T21:00:33Z",
    "session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
    "seeded_at": "2026-11-08T21:00:33Z",
    "last_source_review_at": "2026-11-09T17:30:00Z",
    "verification_mapping": "partial"
  },
  "requirements": [
    {
      "id": "REQ-private-human-governed-gtm",
      "title": "The operator can use PROspector as a private, human-governed go-to-market workspace in which consequential knowledge and external actions require explicit confirmation, no workflow silently authorizes spend or outreach, and no CRM opportunity/revenue model is introduced.",
      "class": "requirement",
      "status": "in_progress",
      "source_status": "Local implementation complete; greenfield acceptance pending under Plan 02-99",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": {
        "summary": "Greenfield acceptance under Plan 02-99 is still pending. Local implementation text is not formal acceptance.",
        "kind": "external",
        "source_refs": [
          {
            "repo": "SJS1001/PROspector",
            "path": ".planning/REQUIREMENTS.md",
            "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
            "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
          }
        ]
      },
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "insufficient",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "The requirements traceability cell says local implementation is complete and acceptance is pending. No requirement-scoped test count is recorded here. The session that wrote the 2026-09-03 requirements update is unknown. Plan credit 26/74 is not this requirement's acceptance."
        }
      ]
    },
    {
      "id": "REQ-company-workspace-isolation",
      "title": "The owner can operate exactly one isolated Company Workspace whose data is not pooled, whose pilot invitations are disabled, and whose history is auditable and exportable.",
      "class": "requirement",
      "status": "in_progress",
      "source_status": "Local implementation complete; greenfield identity/isolation acceptance pending under Plan 02-99",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": {
        "summary": "Greenfield acceptance under Plan 02-99 is still pending. Local implementation text is not formal acceptance.",
        "kind": "external",
        "source_refs": [
          {
            "repo": "SJS1001/PROspector",
            "path": ".planning/REQUIREMENTS.md",
            "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
            "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
          }
        ]
      },
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "insufficient",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "The requirements traceability cell says local implementation is complete and acceptance is pending. No requirement-scoped test count is recorded here. The session that wrote the 2026-09-03 requirements update is unknown. Plan credit 26/74 is not this requirement's acceptance."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/164",
          "pr_number": 164,
          "artifact_path": "site/tests/tenant-isolation-entrypoints.test.mjs",
          "evidence_commit": "12079b56afe99ee74f390c6ec3d7f8cd0673208c",
          "test_scope": "node --test --test-concurrency=1 tests/tenant-isolation-entrypoints.test.mjs",
          "test_counts": {
            "tests": 4,
            "passed": 4,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T06:05:00Z",
          "recorded_at": "2026-11-09T06:05:00Z",
          "session": "extract-merges-2026-11-09",
          "limitations": "Local proof that async owner-projection failures stay inside the handler and that anonymous, outsider, and spoofed calls are denied. This is not Plan 02-99 greenfield acceptance, not a requirement checkbox, and not plan credit. Formal acceptance stays 0/17. Plan credit stays 26/74."
        }
      ]
    },
    {
      "id": "REQ-commercial-hierarchy",
      "title": "The operator can represent `Company -> Product -> Market Play -> Customer Profile -> Offer`, with Company-wide Organization/Contact identity and Market Play-specific Account, Target, relevance, evidence, qualification, and outreach state.",
      "class": "requirement",
      "status": "in_progress",
      "source_status": "Local implementation complete; terminal Phase 2 acceptance pending under Plan 02-99",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": {
        "summary": "Greenfield acceptance under Plan 02-99 is still pending. Local implementation text is not formal acceptance.",
        "kind": "external",
        "source_refs": [
          {
            "repo": "SJS1001/PROspector",
            "path": ".planning/REQUIREMENTS.md",
            "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
            "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
          }
        ]
      },
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "insufficient",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "The requirements traceability cell says local implementation is complete and acceptance is pending. No requirement-scoped test count is recorded here. The session that wrote the 2026-09-03 requirements update is unknown. Plan credit 26/74 is not this requirement's acceptance."
        }
      ]
    },
    {
      "id": "REQ-consensus-interview",
      "title": "The operator can complete a research-first, one-question-at-a-time Consensus Interview that visibly separates evidence, inference, recommendation, and confirmed knowledge and records explicit confirmation, correction, rejection, or rescoping.",
      "class": "requirement",
      "status": "in_progress",
      "source_status": "Local implementation complete; terminal Phase 2 acceptance pending under Plan 02-99",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": {
        "summary": "Greenfield acceptance under Plan 02-99 is still pending. Local implementation text is not formal acceptance.",
        "kind": "external",
        "source_refs": [
          {
            "repo": "SJS1001/PROspector",
            "path": ".planning/REQUIREMENTS.md",
            "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
            "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
          }
        ]
      },
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "insufficient",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "The requirements traceability cell says local implementation is complete and acceptance is pending. No requirement-scoped test count is recorded here. The session that wrote the 2026-09-03 requirements update is unknown. Plan credit 26/74 is not this requirement's acceptance."
        }
      ]
    },
    {
      "id": "REQ-versioned-knowledge-and-drift",
      "title": "The operator can review Proposed Knowledge and drift without mutating Confirmed Knowledge or active typed configurations in place; replacement activation preserves snapshots, invalidates affected approvals, and pauses only dependency-reached high-risk outbound.",
      "class": "requirement",
      "status": "in_progress",
      "source_status": "Local implementation complete; terminal Phase 2 acceptance pending under Plan 02-99",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": {
        "summary": "Greenfield acceptance under Plan 02-99 is still pending. Local implementation text is not formal acceptance.",
        "kind": "external",
        "source_refs": [
          {
            "repo": "SJS1001/PROspector",
            "path": ".planning/REQUIREMENTS.md",
            "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
            "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
          }
        ]
      },
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "insufficient",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "The requirements traceability cell says local implementation is complete and acceptance is pending. No requirement-scoped test count is recorded here. The session that wrote the 2026-09-03 requirements update is unknown. Plan credit 26/74 is not this requirement's acceptance."
        }
      ]
    },
    {
      "id": "REQ-product-readiness",
      "title": "The operator can make a Product Ready only after confirming its complete capability, limitation, delivery, proof, ownership, guardrail, source/discovery, and runner policy; readiness creates an immutable Product Discovery Configuration and starts initial, manual, and monthly discovery without placeholder Plays, Profiles, or Offers.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    },
    {
      "id": "REQ-market-discovery",
      "title": "The operator can receive at most three bounded, evidence-backed Market Play proposals per monthly, manual, or material-change trigger and choose Explore, Defer, or Dismiss without automatically activating prospecting.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    },
    {
      "id": "REQ-profile-readiness",
      "title": "The operator can make a Customer Profile Ready only after confirming its complete fit, target, disqualifier, role, signal, geography/language, rubric, proof/guardrail, contact, outreach, schedule/timezone, compliance, and output policy; readiness creates an immutable Profile Effective Configuration and activates initial and recurring prospecting.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    },
    {
      "id": "REQ-deterministic-qualification",
      "title": "The operator can review qualification outcomes calculated by application code from cited observations under the exact Profile Effective Configuration, including the accepted Mining rubric, hard gates, explicit failure states, and reasoned Approve/Reject/Defer cooldown behavior.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    },
    {
      "id": "REQ-evidence-provenance",
      "title": "The operator can inspect every Signal's URL, source tier, publication/event dates, retrieval time, and supporting excerpt; Tier 3 evidence cannot qualify alone, discovery overlaps by 24 hours, and evidence older than 30 days is context unless reconfirmed.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    },
    {
      "id": "REQ-untrusted-runner-boundary",
      "title": "The operator can use replaceable AI Runners through short-lived, assignment-bound, revocable, quota-limited connections while every run records its provider/model, instructions, tools, configuration, sources, transformations, assignment, and grants and no credentials or silent failover enter PROspector.",
      "class": "requirement",
      "status": "in_progress",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "insufficient",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": "operator/src/lib/domain/openrouter-policy.test.ts",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": "offline operator: node --experimental-strip-types --test src/lib/domain/openrouter-policy.test.ts; node --test acceptance/keyboard/openrouter-settings.test.mjs; node --test scripts/jev-connection.test.mjs; npx tsc --noEmit. Not a hosted runner and not a live provider call.",
          "test_counts": {
            "tests": 8,
            "passed": 8,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-08T19:56:55Z",
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": "operator/src/lib/domain/openrouter-policy.ts",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/operator/src/lib/domain/openrouter-policy.ts"
            }
          ],
          "limitations": "observed_at is the commit time of f6abccc, which contains the tested tree. The commands ran on that dirty tree before the commit; a separate test-log clock was not retained. Counts are 6 policy + 1 settings + 1 Jev contract. tsc exit 0 has no test count. This does not prove short-lived runner assignments, quotas, or the absence of every silent failover. It does not accept the requirement."
        }
      ]
    },
    {
      "id": "REQ-controlled-enrichment",
      "title": "The operator can authorize paid enrichment only with a single-use provider/prospect/unit/cost/expiry-bound grant and separately billed model work only within explicit per-run and monthly budgets; retry or failover never inherits spend authority.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    },
    {
      "id": "REQ-contact-verification",
      "title": "The operator can distinguish Contact Suggestions from eligible Enriched Contacts using recorded source, method, confidence, verification class, and freshness; generated, pattern-guessed, directory-only, or MX-only contact points cannot enter enrichment, export, approval, calling, or sending.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-09T17:30:00Z",
      "last_touched_session": "claude-ee67a286-2026-11-09",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        },
        {
          "kind": "test",
          "pr_url": null,
          "pr_number": null,
          "artifact_path": "site/tests/browser/person-discovery-c4.spec.ts",
          "evidence_commit": "0c3ce490d707c0fa0b4eac9178ab05c75491d96f",
          "test_scope": "cd site && npm run test:browser:person-discovery",
          "test_counts": {
            "tests": 1,
            "passed": 0,
            "failed": 1,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 1,
          "observed_at": "2026-11-09T15:30:00Z",
          "recorded_at": "2026-11-09T15:30:00Z",
          "session": "claude-ee67a286-2026-11-09",
          "limitations": "Negative evidence. The synthetic no-known-person C4 lane stops before ContactReady: the Contacts projection only honours the settlement attestor when controlled_enrichment is activated, which this lane never does, so the contact stays NeedsReview with contact_attestation_unavailable. The issue-#6 checkbox 5 claim based on PR #82 is not supported on this commit. Not acceptance; formal acceptance stays 0/17 and plan credit stays 26/74."
        },
        {
          "kind": "test",
          "pr_url": null,
          "pr_number": null,
          "artifact_path": "site/tests/browser/person-discovery-c4.spec.ts",
          "evidence_commit": "72a1b749f8755e11bdb3900288b6392dd45762ce",
          "test_scope": "cd site && npm run test:browser:person-discovery",
          "test_counts": {
            "tests": 1,
            "passed": 1,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T17:30:00Z",
          "recorded_at": "2026-11-09T17:30:00Z",
          "session": "claude-ee67a286-2026-11-09",
          "limitations": "Local synthetic C4 lane after the dev-only Contacts read-projection fix: the discovered fictional contact is shown as Verified, the verifier passed with forbiddenRows=0 and no R2 objects, and no gate row was written. Same commit: cd site && npm test 1176 pass / 0 fail across 169 files; npm run lint exit 0. Dev-only local evidence, not hosted or live-provider acceptance. Formal acceptance stays 0/17 and plan credit stays 26/74."
        }
      ]
    },
    {
      "id": "REQ-immutable-outreach-approval",
      "title": "The operator can separately approve an immutable Outreach Package and each exact Gmail message; final dispatch uses a send lease and rechecks digest, suppression, approval, entity/configuration state, drift, sender identity, and compliance acknowledgement, while replies and bounces stop applicable follow-ups.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/162",
          "pr_number": 162,
          "artifact_path": "site/domain/local-outreach-command-orchestrator.ts",
          "evidence_commit": "826ee5971702bcd7d1d60648607f68e40ec2af21",
          "test_scope": "node --test --test-concurrency=1 tests/local-outreach-command-orchestrator.test.mjs",
          "test_counts": {
            "tests": 37,
            "passed": 37,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T06:05:00Z",
          "recorded_at": "2026-11-09T06:05:00Z",
          "session": "extract-merges-2026-11-09",
          "limitations": "In-memory orchestrator only. The unconfigured adapter stays reject-only. No Gmail send, live provider, credential, or spend. Not Plans 06-10, 06-11, or 06-13. Not plan credit. Formal acceptance stays 0/17."
        }
      ]
    },
    {
      "id": "REQ-hard-company-suppression",
      "title": "The operator can create and audit Company-wide email, phone, Contact, Organization, or all-outreach suppression that is enforced transactionally at call/send time, includes sender identity and working unsubscribe controls, and survives deletion, import, export, merge, and restore.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/161",
          "pr_number": 161,
          "artifact_path": "site/domain/manual-call-decision-service.ts",
          "evidence_commit": "a9b538aa0d211f3c27c6d1e8dfb3e30f8286a738",
          "test_scope": "node --test --test-concurrency=1 tests/manual-call-decision-service.test.mjs",
          "test_counts": {
            "tests": 15,
            "passed": 15,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T06:05:00Z",
          "recorded_at": "2026-11-09T06:05:00Z",
          "session": "extract-merges-2026-11-09",
          "limitations": "Synthetic decision service only. do_not_call orders suppression before the outcome inside an injected repository. No phone number, URI, dial, or provider. Not production suppression. Not plan credit. Formal acceptance stays 0/17."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/167",
          "pr_number": 167,
          "artifact_path": "site/domain/manual-call-decision-service.ts",
          "evidence_commit": "c8de3ea9b1ea0c22256878e21d5b6a19109b799b",
          "test_scope": "node --test --test-concurrency=1 tests/manual-call-decision-service.test.mjs",
          "test_counts": {
            "tests": 21,
            "passed": 21,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T17:20:00Z",
          "recorded_at": "2026-11-09T18:50:00Z",
          "session": "claude-011p7Tfj-2026-11-09",
          "limitations": "Review batch 02 (2026-11-09 code review finding 4). Synthetic decision service only: do_not_call is now recordable after approval expiry, phone-freshness lapse, an already-present suppression, or an authority change, and always uses the current suppression subjects and pending work; scope, approval and phone binding, and synthetic classification are still required, and other outcomes keep the fail-closed gate. Injected test repository only; no real commitCurrentOutcome implementation, route, phone number, URI, dial, or provider. Not production suppression. Not plan credit. Formal acceptance stays 0/17."
        }
      ]
    },
    {
      "id": "REQ-crm-and-workspace-exports",
      "title": "The owner can produce a CRM Handoff CSV with one row per eligible Enriched Contact and stable Prospect ID, and separately create an authenticated, audited, encrypted, versioned Company Workspace archive that restores cleanly into a compatible deployment.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/160",
          "pr_number": 160,
          "artifact_path": "site/domain/crm-handoff-export-artifact.ts",
          "evidence_commit": "f55a47366f416a315e466e3b7734030288ad28ac",
          "test_scope": "node --test --test-concurrency=1 tests/crm-handoff-export-artifact.test.mjs",
          "test_counts": {
            "tests": 8,
            "passed": 8,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T06:05:00Z",
          "recorded_at": "2026-11-09T06:05:00Z",
          "session": "extract-merges-2026-11-09",
          "limitations": "In-memory synthetic CSV selection validation only. No download, delivery, archive, or restore. Not Plans 07-07 or 07-10. Not plan credit. Formal acceptance stays 0/17."
        },
        {
          "kind": "test",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/167",
          "pr_number": 167,
          "artifact_path": "site/domain/crm-handoff-export-artifact.ts",
          "evidence_commit": "c8de3ea9b1ea0c22256878e21d5b6a19109b799b",
          "test_scope": "node --test --test-concurrency=1 tests/crm-handoff-export-artifact.test.mjs",
          "test_counts": {
            "tests": 9,
            "passed": 9,
            "failed": 0,
            "cancelled": 0,
            "skipped": 0,
            "todo": 0
          },
          "exit_code": 0,
          "observed_at": "2026-11-09T17:20:00Z",
          "recorded_at": "2026-11-09T18:50:00Z",
          "session": "claude-011p7Tfj-2026-11-09",
          "limitations": "Review batch 02 (2026-11-09 code review finding on duplicate export rows). In-memory synthetic CSV selection validation only: each selected row must be supplied exactly once, and the builder refuses if the artifact row count differs from the validated count. No download, delivery, archive, or restore. Not Plans 07-07 or 07-10. Not plan credit. Formal acceptance stays 0/17."
        }
      ]
    },
    {
      "id": "REQ-initial-operating-target",
      "title": "The operator can run the seeded `Digitalrain -> ONE -> ONE for Mining -> Operating` workflow weekdays at 06:00 America/Toronto, keep Greenfield Draft/nurture, and report seven newly Export-ready Prospects per Monday–Sunday week while showing all funnel losses and preserving every quality gate.",
      "class": "requirement",
      "status": "open",
      "source_status": "Pending",
      "source_refs": [
        {
          "repo": "SJS1001/PROspector",
          "path": ".planning/REQUIREMENTS.md",
          "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
        }
      ],
      "blocker": null,
      "user_decision": null,
      "accepted_exception": false,
      "exception_evidence": [],
      "external_acceptance_recorded": false,
      "verification_assessment": "not_assessed",
      "last_touched_at": "2026-11-08T21:00:33Z",
      "last_touched_session": "bc-883d1be0-7187-5703-b79b-59553a39de84",
      "evidence": [
        {
          "kind": "artifact",
          "pr_url": "https://github.com/SJS1001/PROspector/pull/157",
          "pr_number": 157,
          "artifact_path": ".planning/REQUIREMENTS.md",
          "evidence_commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
          "test_scope": null,
          "test_counts": null,
          "exit_code": null,
          "observed_at": null,
          "recorded_at": "2026-11-08T21:00:33Z",
          "session": null,
          "source_refs": [
            {
              "repo": "SJS1001/PROspector",
              "path": ".planning/REQUIREMENTS.md",
              "commit": "f6abccced88a1d520f4fea3a6a93c4a536cd6ae4",
              "url": "https://github.com/SJS1001/PROspector/blob/f6abccced88a1d520f4fea3a6a93c4a536cd6ae4/.planning/REQUIREMENTS.md"
            }
          ],
          "limitations": "Traceability status is Pending. This inventory row was not given a requirement-scoped acceptance receipt. Discovery did not treat the checkbox as proof."
        }
      ]
    }
  ]
}
```
<!-- /completion-ledger:v1 -->
