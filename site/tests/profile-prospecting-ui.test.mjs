import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { applyMigrations, createD1Fixture } from "./helpers/d1.mjs";
import { seedProfileAuthority } from "./helpers/phase4.mjs";

const NOW = 1_780_000_000_000;
const OWNER = {
  subject: "phase4-ui-owner",
  legacySubject: "phase4-ui-owner-legacy",
  displayName: "Phase 4 UI owner",
};
const DIGEST = "a".repeat(64);

test("unauthorized and malformed authority render one neutral zero-detail state", async () => {
  await withView("prospecting-workspace.tsx", async (view) => {
    for (const authority of ["blocked", "malformed"]) {
      const html = renderToStaticMarkup(
        React.createElement(view.ProspectingWorkspace, {
          projection: {
            authority,
            readiness: {
              profile: {
                id: "must-not-leak-profile",
                revision: 1,
              },
            },
            runs: [{ id: "must-not-leak-run" }],
            evidence: [{ excerpt: "must-not-leak-evidence" }],
            queue: [{ account: { value: "must-not-leak-account" } }],
          },
        }),
      );
      assert.match(html, /Prospecting unavailable/);
      assert.match(
        html,
        /No profile, run, evidence, or prospect details are shown/,
      );
      assert.doesNotMatch(
        html,
        /must-not-leak-profile|must-not-leak-run|must-not-leak-evidence|must-not-leak-account/,
      );
    }
  });
});

test("persisted candidate projection renders the complete frozen decision authority", async () => {
  const fixture = await createD1Fixture("phase4-ui-frozen-authority");
  try {
    await applyMigrations(fixture.database);
    const readiness = await fixture.vite.ssrLoadModule(
      new URL("../domain/profile-readiness.ts", import.meta.url).pathname,
    );
    const view = await fixture.vite.ssrLoadModule(
      new URL("../app/prospecting/profile-readiness.tsx", import.meta.url)
        .pathname,
    );
    const seeded = await seedProfileAuthority(fixture, OWNER, NOW);
    await readiness.createProfileConfigurationCandidate(
      fixture.database,
      OWNER,
      {
        profileId: seeded.profileId,
        expectedProfileRevision: seeded.revision,
        idempotencyKey: "0198f400-0000-7000-8000-000000002001",
        now: NOW,
      },
    );
    const projection = await readiness.readProfileReadiness(
      fixture.database,
      OWNER,
      seeded.profileId,
    );
    const html = renderToStaticMarkup(
      React.createElement(view.ProfileReadiness, {
        readiness: projection,
        busy: false,
        onCommand() {
          throw new Error("SSR must not mutate");
        },
        onReload() {
          throw new Error("SSR must not reload");
        },
      }),
    );
    for (const expected of [
      "Digitalrain",
      "ONE",
      "ONE for Mining",
      "Operating",
      "Candidate — not active",
      "Frozen candidate authority review",
      "Product configuration",
      "Market Play",
      "Offer",
      "Source policy",
      "Runner policy",
      "Rubric versions",
      "Output policy versions",
      "weekdays at 06:00",
      "reject_only · no silent failover",
      "Activate Profile configuration",
    ]) {
      assert.match(html, new RegExp(escape(expected)));
    }
    assert.equal(projection.candidate.digest, projection.candidate.frozenAuthority
      ? projection.candidate.digest
      : null);
    assert.match(projection.candidate.digest, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(html, /Find Prospects/);
  } finally {
    await fixture.dispose();
  }
});

test("Prospect Workspace keeps evidence ahead of score, exposes the complete ledger, and escapes hostile excerpts", async () => {
  await withView("prospect-workspace.tsx", async (view) => {
    const hostile = '<img src=x onerror="steal()"> & hostile';
    const html = renderToStaticMarkup(
      React.createElement(view.ProspectWorkspace, {
        profileId: "profile-1",
        activation: activation(),
        busy: false,
        onCommand() {
          throw new Error("SSR must not mutate");
        },
        runs: [
          {
            id: "run-1",
            configuration_id: "configuration-1",
            configuration_digest: DIGEST,
            trigger_kind: "manual",
            trigger_key: "manual:slot-1",
            execution_state: "rejected",
            window_lower_exclusive: NOW - 86_400_000,
            window_upper_inclusive: NOW,
            successful_watermark: NOW - 86_400_000,
            schedule_id: "schedule-1",
            schedule_key: "weekday:slot-1",
            timezone: "America/Toronto",
            intended_local_time: "06:00",
            utc_offset_minutes: -240,
            assignment_id: "assignment-1",
            assignment_status: "revoked",
            instruction_version: "runner-instructions/v1",
            tool_configuration_digest: "b".repeat(64),
            provider: "bounded-provider",
            model: "bounded-model",
            allowedTools: ["search"],
            quotas: { maxBytes: 20000, maxFindings: 3, maxSources: 3 },
            expires_at: NOW + 60_000,
            attempt: 2,
            terminalReason: "validation_rejected",
            terminalRetryable: false,
          },
        ],
        evidence: [
          {
            id: "signal-1",
            source_url: "https://evidence.example/source",
            source_tier: 2,
            publisher_identity: "Evidence title",
            underlying_origin_identity: "Independent publisher",
            independence_group: "group-1",
            retrieved_at: NOW,
            published_at: NOW - 60_000,
            excerpt: hostile,
            lineage_digest: "c".repeat(64),
            run_id: "run-1",
            submission_id: "submission-1",
            configuration_digest: DIGEST,
            signal_json: JSON.stringify({
              recency: "account_context_reconfirmation_required",
            }),
          },
          {
            id: "signal-unsafe-url",
            source_url: "javascript:alert('blocked')",
            source_tier: 3,
            publisher_identity: "Rejected URL scheme",
            underlying_origin_identity: "Untrusted origin",
            independence_group: "group-unsafe",
            retrieved_at: NOW - 1,
            excerpt: "The text remains inspectable without a navigable link.",
            run_id: "run-1",
            submission_id: "submission-1",
          },
        ],
        assessments: [
          {
            id: "assessment-1",
            candidate_id: "candidate-1",
            configuration_digest: DIGEST,
            anchor_json: JSON.stringify({
              accountFit: 2,
              painStrength: 2,
              timingUrgency: 1,
              dataReadiness: 1,
              commercialViability: 1,
            }),
            gate_json: JSON.stringify([
              { gate: "pain_and_timing", passed: true, detail: "pain:2;timing:1" },
              {
                gate: "independent_qualifying_sources",
                passed: true,
                detail: "tier1:0;tier2_groups:2",
              },
            ]),
            score_json: JSON.stringify({ missingFields: [] }),
            score: 7,
            outcome: "Passed",
            tie_order: JSON.stringify([2, 1, 2, NOW, "candidate-1"]),
            assessment_digest: "d".repeat(64),
          },
        ],
      }),
    );
    for (const expected of [
      "Active configuration",
      "Manual run confirmation",
      "I confirm this scoped source window and quota",
      "Run ledger",
      "manual:slot-1",
      "weekday:slot-1",
      "America/Toronto",
      "bounded-provider / bounded-model",
      "runner-instructions/v1",
      "maxFindings 3",
      "Attempt / terminal reason",
      "validation_rejected",
      "Evidence title",
      "evidence.example",
      "https://evidence.example/source",
      "Account Context — reconfirmation required",
      "Application-calculated qualification",
      "Qualified",
      "Pain / timing gate",
      "Source independence gate",
    ]) {
      assert.match(html, new RegExp(escape(expected)));
    }
    assert.ok(
      html.indexOf("Validated evidence") <
        html.indexOf("Application-calculated qualification"),
      "evidence must precede every score and assessment",
    );
    assert.match(html, /&lt;img src=x onerror=&quot;steal\(\)&quot;\/?&gt; &amp; hostile/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(
      html,
      /aria-label="Open evidence URL externally: https:\/\/evidence\.example\/source"/,
    );
    assert.match(
      html,
      /Evidence URL is not a permitted HTTP\(S\) destination/,
    );
    assert.doesNotMatch(html, /href="javascript:/);
    assert.match(
      html,
      /type="checkbox"[\s\S]{0,120}I confirm this scoped source window and quota/,
    );
    assert.match(
      html,
      /<button[^>]*disabled=""[^>]*>Find Prospects<\/button>/,
      "manual run remains disabled until explicit confirmation",
    );
  });
});

test("Review Queue admits Passed only, links the assessment, and retains authority while a decision is pending", async () => {
  await withView("review-queue.tsx", async (view) => {
    const html = renderToStaticMarkup(
      React.createElement(view.ReviewQueue, {
        busy: true,
        onCommand() {
          throw new Error("SSR must not mutate");
        },
        queue: [
          {
            id: "qualified-prospect",
            assessment_id: "assessment-qualified",
            revision: 2,
            offer_id: "offer-1",
            score: 8,
            outcome: "Passed",
            configuration_digest: DIGEST,
            account: { id: "account-1", value: "Exact Account" },
            target: { id: "target-1", value: "Exact Target" },
            evidenceFreshness: {
              state: "reconfirmation_required",
              newestRetrievedAt: NOW,
              sources: [{ id: "signal-1", retrievedAt: NOW, tier: 2 }],
            },
            cooldownState: "reentered",
            decisionHistory: [
              {
                prospect_id: "prior-prospect",
                decision: "defer",
                decision_at: NOW,
                owner_subject: "owner-1",
                audit_event_id: "audit-1",
              },
            ],
            cooldownHistory: [
              {
                prospect_id: "prior-prospect",
                status: "released",
                ends_at: NOW,
              },
            ],
            reentryHistory: [
              {
                event_kind: "material_signal",
                created_at: NOW,
                prior_prospect_id: "prior-prospect",
                reentered_prospect_id: "qualified-prospect",
              },
            ],
          },
          {
            id: "below-threshold-prospect",
            assessment_id: "assessment-below",
            revision: 1,
            offer_id: "offer-2",
            score: 6,
            outcome: "NotQualified",
            configuration_digest: DIGEST,
            account: { id: "account-2", value: "Must not enter queue" },
          },
        ],
      }),
    );
    for (const expected of [
      "Decision pending",
      "Exact Account",
      "Exact Target",
      "Offer",
      "offer-1",
      "Account Context — reconfirmation required",
      "View immutable assessment assessment-qualified",
      'href="#assessment-assessment-qualified"',
      "Authoritative decision: defer",
      "audit audit-1",
      "Approved prospects still require governed contact verification",
      "authorizes no external effect",
    ]) {
      assert.match(html, new RegExp(escape(expected)));
    }
    assert.doesNotMatch(html, /Must not enter queue|below-threshold-prospect/);
    assert.match(html, /aria-busy="true"/);
    for (const action of [
      "Approve prospect",
      "Reject prospect",
      "Defer prospect",
    ]) {
      assert.match(
        html,
        new RegExp(`disabled=""[^>]*>${escape(action)}</button>`),
      );
    }
  });
});

test("stale, unknown, missing, and stale-predecessor states give explicit recovery without automatic retry authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const workspace = await vite.ssrLoadModule(
      new URL("../app/prospecting/prospecting-workspace.tsx", import.meta.url)
        .pathname,
    );
    const readiness = await vite.ssrLoadModule(
      new URL("../app/prospecting/profile-readiness.tsx", import.meta.url)
        .pathname,
    );
    const ownerProjection = {
      authority: "owner",
      readiness: { profile: { id: "profile-1", revision: 1 }, items: [] },
      runs: [],
      evidence: [],
      assessments: [],
      queue: [],
    };
    const stale = renderToStaticMarkup(
      React.createElement(workspace.ProspectingWorkspace, {
        projection: ownerProjection,
        initialNotice: "stale",
      }),
    );
    assert.match(stale, /This candidate changed in another tab/);
    assert.match(stale, /Load current candidate/);
    const unknown = renderToStaticMarkup(
      React.createElement(workspace.ProspectingWorkspace, {
        projection: ownerProjection,
        initialNotice: "unknown",
      }),
    );
    assert.match(unknown, /Nothing will be retried automatically/);
    assert.match(unknown, /Check current profile configuration/);
    let recoveryLoads = 0;
    const missingProps = {
      readiness: null,
      busy: false,
      onCommand() {},
      onReload() {
        recoveryLoads += 1;
      },
    };
    const missingElement = readiness.ProfileReadiness(missingProps);
    const missing = renderToStaticMarkup(missingElement);
    assert.match(missing, /No readiness items are available/);
    assert.match(missing, /Load current authority/);
    findButton(missingElement, "Load current authority").props.onClick();
    assert.equal(recoveryLoads, 1, "recovery delegates to the owning transport");

    const staleCandidateProps = {
      readiness: {
        profile: { id: "profile-1", revision: 4 },
        complete: true,
        missing: ["source_policy"],
        items: [
          {
            category: "source_policy",
            status: "stale",
            versionIds: ["version-old"],
          },
        ],
        candidate: {
          id: "candidate-stale",
          revision: 2,
          digest: DIGEST,
          status: "candidate",
        },
      },
      busy: false,
      onCommand() {
        throw new Error("stale authority must not mutate");
      },
      onReload() {
        recoveryLoads += 1;
      },
    };
    const staleCandidateElement =
      readiness.ProfileReadiness(staleCandidateProps);
    const staleCandidate = renderToStaticMarkup(staleCandidateElement);
    assert.match(staleCandidate, /Candidate authority needs recovery/);
    assert.match(
      staleCandidate,
      /persisted candidate exists[\s\S]*stale or incomplete/i,
    );
    assert.match(staleCandidate, /Load current authority/);
    assert.doesNotMatch(
      staleCandidate,
      /Activate Profile configuration/,
      "incomplete predecessor authority must never expose activation",
    );
    findButton(staleCandidateElement, "Load current authority").props.onClick();
    assert.equal(recoveryLoads, 2);

    const stalePredecessor = renderToStaticMarkup(
      React.createElement(readiness.ProfileReadiness, {
        readiness: {
          profile: { id: "profile-1", revision: 1 },
          complete: false,
          missing: ["fit_target"],
          items: [
            {
              category: "fit_target",
              status: "stale",
              versionIds: [],
            },
          ],
        },
        busy: false,
        onCommand() {},
        onReload() {},
      }),
    );
    assert.match(stalePredecessor, /Stale predecessor/);
    assert.match(
      stalePredecessor,
      /This profile is not ready. Confirm the required item/,
    );
    assert.match(
      stalePredecessor,
      /Create Profile configuration candidate<\/button>/,
    );
    assert.match(
      stalePredecessor,
      /<button[^>]*disabled=""[^>]*>Create Profile configuration candidate/,
    );
  } finally {
    await vite.close();
  }
});

test("responsive and accessibility contracts are present on the real composed surface", async () => {
  await withView("prospecting-workspace.tsx", async (view) => {
    const html = renderToStaticMarkup(
      React.createElement(view.ProspectingWorkspace, {
        projection: {
          authority: "owner",
          readiness: {
            profile: { id: "profile-1", revision: 1 },
            complete: false,
            items: [],
          },
          runs: [],
          evidence: [],
          assessments: [],
          queue: [],
        },
        initialNotice: "unknown",
      }),
    );
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /min-height:44px/);
    assert.match(html, /@media\(max-width:760px\)/);
    assert.match(html, /grid-template-columns:1fr/);
    for (const forbidden of [
      "Enrich contact",
      "Buy credits",
      "Export CRM",
      "Approve package",
      "Send email",
      "Call prospect",
    ]) {
      assert.match(
        html,
        new RegExp(`<button[^>]*disabled=""[^>]*>${escape(forbidden)} disabled`),
      );
    }
  });
});

test("Review Queue keeps each prospect draft and exact command isolated", async () => {
  await withView("review-command.ts", async (review) => {
    const first = {
      id: "prospect-1",
      assessment_id: "assessment-1",
      revision: 2,
    };
    const second = {
      id: "prospect-2",
      assessment_id: "assessment-2",
      revision: 7,
    };
    let drafts = review.updateReviewDraft({}, first.id, {
      reason: "Approve exact first prospect",
    });
    drafts = review.updateReviewDraft(drafts, second.id, {
      reason: "Defer only second prospect",
      reviewAt: "2026-08-15T09:30",
    });
    assert.deepEqual(drafts[first.id], {
      reason: "Approve exact first prospect",
      reviewAt: "",
    });
    assert.deepEqual(drafts[second.id], {
      reason: "Defer only second prospect",
      reviewAt: "2026-08-15T09:30",
    });
    assert.deepEqual(
      review.buildReviewCommand(first, "approve", drafts[first.id]),
      {
        action: "review",
        prospectId: "prospect-1",
        assessmentId: "assessment-1",
        expectedRevision: 2,
        decision: "approve",
        reason: "Approve exact first prospect",
      },
    );
    const deferred = review.buildReviewCommand(
      second,
      "defer",
      drafts[second.id],
    );
    assert.equal(deferred.prospectId, "prospect-2");
    assert.equal(deferred.assessmentId, "assessment-2");
    assert.equal(deferred.expectedRevision, 7);
    assert.equal(deferred.reason, "Defer only second prospect");
    assert.equal(
      deferred.reviewAt,
      new Date("2026-08-15T09:30").getTime(),
    );
    assert.equal(
      review.buildReviewCommand(second, "defer", {
        reason: "Missing date",
        reviewAt: "",
      }),
      null,
    );
  });
});

async function withView(file, assertion) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const view = await vite.ssrLoadModule(
      new URL(`../app/prospecting/${file}`, import.meta.url).pathname,
    );
    await assertion(view);
  } finally {
    await vite.close();
  }
}
function activation() {
  return {
    configuration: { id: "configuration-1", digest: DIGEST },
    initialRun: {
      id: "run-initial",
      executionState: "succeeded",
      successfulWatermark: NOW,
    },
    schedule: {
      id: "schedule-1",
      timezone: "America/Toronto",
      localTime: "06:00",
      utcOffsetMinutes: -240,
      cadence: "weekdays",
      nextRunAt: NOW + 86_400_000,
      lastSuccessfulWatermark: NOW,
      executionState: "active",
    },
    auditEventId: "audit-activation",
    profilePath: {
      company: { id: "company-1", name: "Digitalrain" },
      product: { id: "product-1", name: "ONE" },
      marketPlay: { id: "play-1", name: "ONE for Mining" },
      profile: { id: "profile-1", name: "Operating" },
    },
  };
}
function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findButton(node, label) {
  const match = findElement(
    node,
    (element) =>
      element.type === "button" &&
      React.Children.toArray(element.props.children).join("").includes(label),
  );
  assert.ok(match, `expected button ${label}`);
  return match;
}
function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}
