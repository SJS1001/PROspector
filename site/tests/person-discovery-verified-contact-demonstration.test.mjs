import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_DISCOVERY_NOW,
  createPersonDiscoveryFixture,
  loadPersonDiscoveryModules,
} from "./helpers/person-discovery-fixture.mjs";

/**
 * Closes part of the checkbox-5 evidence gap: person-discovery only ever
 * records a verification *intent* (`providerCallAuthorized: false`,
 * `contactEvidenceCreated: false` — see domain/person-discovery.ts) and
 * deliberately never calls a provider or writes eligible evidence. That is
 * the correct, reviewed C1-C4 boundary and this test changes none of it.
 *
 * IMPORTANT — what this test does NOT prove: no production route or service
 * anywhere in this repository reads `contact_verification_intents` to
 * construct an enrichment assignment/verification envelope. That composition
 * (domain/enrichment-repository.ts into a route) does not exist, so this
 * test cannot exercise a real intent consumer -- there isn't one. It is
 * a component-reachability check only: it independently proves that IF
 * something (a future route/service) supplied a verified observation for
 * the exact Contact person-discovery's decision produced, the existing,
 * unmodified contact-evidence/contact-eligibility machinery
 * (domain/contact-evidence.ts, domain/contact-eligibility.ts -- the
 * "current enrichment foundations" the issue names as prior art for an
 * already-known Contact) can carry it to genuine ContactReady/eligible
 * state. The assignment/envelope below are independently synthetic
 * fixtures tied only to the decided Contact's identity (`authority.*`),
 * not derived from or consuming the recorded intent, except for the
 * channel, which is read from the intent record to keep the two
 * consistent. No new domain/service export, no new route or transport
 * action, and no persisted row anywhere.
 *
 * Reaching a real end-to-end outcome through the browser/UI additionally
 * requires composing the enrichment reservation/grant/settlement pipeline
 * (domain/enrichment-repository.ts) into a route that actually consumes
 * `contact_verification_intents` -- that pipeline is currently composed
 * nowhere in app/ and doing so is a materially bigger, separately-owned
 * change outside person-discovery's scope. See the handoff note in the
 * person-discovery lane report for exactly what a browser-acceptance
 * extension would still need.
 */
test("the existing evidence/eligibility modules can independently reach genuine ContactReady for the Contact a discovery decision produced, with zero persistence (no production intent consumer exists yet)", async () => {
  const fixture = await createPersonDiscoveryFixture("person-discovery-verified-contact");
  try {
    const { discovery, testPort, repository } = await loadPersonDiscoveryModules(fixture);
    const evidence = await fixture.vite.ssrLoadModule(new URL("../domain/contact-evidence.ts", import.meta.url).pathname);
    const eligibility = await fixture.vite.ssrLoadModule(new URL("../domain/contact-eligibility.ts", import.meta.url).pathname);

    const port = testPort.bindPersonDiscoveryTestPort(async () => ({
      kind: "completed",
      candidates: [{
        displayName: "Synthetic Verified Person",
        roleTitle: "Operations Director",
        roleSummary: "Synthetic role relevance only; not a verified contact.",
        provenance: [{ sourceReference: "synthetic:verified-demo", excerpt: "Synthetic bounded provenance.", retrievedAt: PERSON_DISCOVERY_NOW + 10 }],
      }],
    }));
    const service = discovery.createPersonDiscoveryService({ database: fixture.database, port, now: () => PERSON_DISCOVERY_NOW + 100, idFactory: ids("verified-demo") });

    const started = await service.start(fixture.scope, {
      prospectId: fixture.prospectId,
      expectedProspectRevision: fixture.prospectRevision,
      expectedConfigurationId: fixture.configurationId,
      expectedConfigurationDigest: fixture.configurationDigest,
      expectedConfigurationRevision: fixture.configurationRevision,
      maxCandidates: 1,
      maxProvenancePerCandidate: 1,
      idempotencyKey: "person-discovery-verified-demo-start",
    });
    assert.equal(started.kind, "accepted");

    const decided = await service.decide(fixture.scope, {
      runId: started.run.id,
      expectedResultDigest: started.run.resultDigest,
      decision: "create_new",
      candidateId: started.run.candidates[0].id,
      idempotencyKey: "person-discovery-verified-demo-decision",
    });
    assert.equal(decided.kind, "accepted");

    const intent = await service.recordVerificationIntent(fixture.scope, {
      relevanceId: decided.decision.relevanceId,
      intent: "initial_verification",
      channel: "email",
      expectedProspectRevision: fixture.prospectRevision,
      expectedContactRevision: 1,
      expectedConfigurationId: fixture.configurationId,
      expectedConfigurationDigest: fixture.configurationDigest,
      expectedConfigurationRevision: fixture.configurationRevision,
      idempotencyKey: "person-discovery-verified-demo-intent",
    });
    assert.equal(intent.kind, "accepted");
    assert.equal(intent.providerCallAuthorized, false, "person-discovery itself never authorizes a provider call");
    assert.equal(intent.contactEvidenceCreated, false, "person-discovery itself never creates contact evidence");
    assert.equal(intent.intent.channel, "email", "the recorded intent durably carries the requested channel");

    // No production code reads this intent record: there is no route or
    // service in this repository that consumes `contact_verification_intents`
    // to build an enrichment assignment/verification envelope. The
    // assignment/envelope below are therefore independently synthetic
    // fixtures, tied to the decided Contact's identity via `authority.*`
    // (which person-discovery genuinely produced) and to the intent's own
    // channel (`intent.intent.channel`) so the two stay consistent -- not
    // proof that anything actually consumes the intent.
    const authority = await repository.loadRelevanceAuthority(fixture.database, fixture.scope, decided.decision.relevanceId);
    assert.ok(authority, "the decided Contact carries current relevance authority");

    const assignment = Object.freeze({
      assignmentId: "verified-demo-assignment",
      prospectId: authority.prospectId,
      role: "general",
      quoteRevision: 1,
      workspaceId: authority.workspaceId,
      contactId: authority.contactId,
      profileConfigurationId: authority.configurationId,
      profileConfigurationDigest: authority.configurationDigest,
      providerAuthority: Object.freeze({ providerId: "synthetic-demo-provider", providerVersion: "v1", catalogRef: "synthetic-demo-catalog" }),
    });
    const envelope = Object.freeze({
      id: "verified-demo-observation", workspaceId: assignment.workspaceId, contactId: assignment.contactId,
      profileConfigurationId: assignment.profileConfigurationId, profileConfigurationDigest: assignment.profileConfigurationDigest,
      kind: intent.intent.channel, value: "  VERIFIED@EXAMPLE.TEST ", confidence: 0.01,
      provenance: { sourceReference: "synthetic-demo-source", excerpt: "synthetic mailbox verification record", objectReference: "synthetic-demo-object", contentHash: "b".repeat(64), retrievedAt: PERSON_DISCOVERY_NOW - 2_000 },
      observedAt: PERSON_DISCOVERY_NOW - 1_000, lineage: { parentObservationId: null },
    });
    let verifierCalls = 0;
    const verifier = evidence.bindContactEvidenceVerifier({ verifierId: "synthetic-demo-verifier", verifierVersion: "v1" }, async () => {
      verifierCalls += 1;
      return {
        observationId: envelope.id, workspaceId: assignment.workspaceId, contactId: assignment.contactId,
        profileConfigurationId: assignment.profileConfigurationId, profileConfigurationDigest: assignment.profileConfigurationDigest,
        kind: intent.intent.channel, normalizedValue: "verified@example.test", contentHash: envelope.provenance.contentHash,
        verificationClass: "mailbox_verified", method: "mailbox_verification", verifiedAt: PERSON_DISCOVERY_NOW - 1_500,
        providerId: "synthetic-demo-provider", providerVersion: "v1", catalogRef: "synthetic-demo-catalog",
        verdictReference: "verified-demo-verdict", verdictDigest: "d".repeat(64),
      };
    });
    const receipt = await evidence.executeContactVerification(verifier, {
      assignmentId: "verified-demo-assignment", prospectId: authority.prospectId, role: "general",
      assignment: {
        workspaceId: assignment.workspaceId, contactId: assignment.contactId,
        profileConfigurationId: assignment.profileConfigurationId, profileConfigurationDigest: assignment.profileConfigurationDigest,
        providerId: assignment.providerAuthority.providerId, providerVersion: assignment.providerAuthority.providerVersion,
        catalogRef: assignment.providerAuthority.catalogRef, quoteRevision: 1,
      },
      envelope,
    });
    assert.ok(receipt, "the synthetic in-memory verifier issues a trusted receipt");
    assert.equal(verifierCalls, 1);

    const ingested = evidence.ingestContactEvidence(assignment, envelope, receipt);
    assert.equal(ingested.accepted, true, ingested.accepted ? "" : ingested.reason);
    assert.equal(ingested.observation.verificationClass, "mailbox_verified");
    assert.equal(ingested.observation.normalizedValue, "verified@example.test");

    const projected = eligibility.projectContactEligibility({
      target: { workspaceId: assignment.workspaceId, prospectId: authority.prospectId, contactId: assignment.contactId },
      points: [ingested.observation],
      strategy: { configurationId: assignment.profileConfigurationId, configurationDigest: assignment.profileConfigurationDigest },
      authority: {
        prospectId: authority.prospectId, configurationId: assignment.profileConfigurationId, configurationDigest: assignment.profileConfigurationDigest,
        profileAvailable: true, configurationCurrent: true, drifted: false, disqualified: false, suppressed: false,
        phase4Approved: true, contactCapabilityEnabled: true,
      },
      now: PERSON_DISCOVERY_NOW,
    });
    assert.equal(projected.state, "ContactReady", "the discovered-and-decided Contact can reach genuine eligibility through the existing evidence/eligibility modules");
    assert.equal(projected.eligible, true);
    assert.deepEqual(projected.reasonCodes, []);

    // The demonstration is provably in-memory only: no route, service, or
    // repository call in this test wrote to any persisted evidence/eligibility
    // table, and person-discovery's own durable rows are unaffected by it.
    for (const table of ["contact_point_observations", "contact_eligibility_snapshots", "contact_verification_receipts", "enrichment_reservation_events", "enrichment_grants"]) {
      const row = await fixture.database.prepare(`SELECT count(*) total FROM ${table}`).first();
      assert.equal(Number(row.total), 0, `${table} must remain empty: this demonstration persists nothing`);
    }
    assert.equal(await count(fixture, "contact_verification_intents"), 1, "person-discovery's own durable intent record is unaffected");
    assert.equal(await count(fixture, "prospect_contact_role_relevance"), 1);
  } finally {
    await fixture.dispose();
  }
});

function ids(prefix) {
  let ordinal = 0;
  return () => `${prefix}-${++ordinal}`;
}

async function count(fixture, table) {
  const row = await fixture.database.prepare(`SELECT count(*) total FROM ${table}`).first();
  return Number(row.total);
}
