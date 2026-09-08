import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_DISCOVERY_NOW,
  createPersonDiscoveryFixture,
  loadPersonDiscoveryModules,
} from "./helpers/person-discovery-fixture.mjs";

/**
 * Closes the checkbox-5 evidence gap: person-discovery only ever records a
 * verification *intent* (`providerCallAuthorized: false`,
 * `contactEvidenceCreated: false` — see domain/person-discovery.ts) and
 * deliberately never calls a provider or writes eligible evidence. That is
 * the correct, reviewed C1-C4 boundary and this test changes none of it.
 *
 * What was unproven is whether the discovered -> explicit Contact ->
 * verification-intent chain this issue owns can, once handed off, actually
 * reach a genuinely eligible/verified contact point through the existing,
 * unmodified, already-reviewed contact-evidence/contact-eligibility
 * machinery (domain/contact-evidence.ts, domain/contact-eligibility.ts) --
 * the "current enrichment foundations" the issue names as prior art for an
 * already-known Contact. This test proves that reachability end-to-end with
 * a synthetic, in-memory-only, test-injected verifier: no new domain/service
 * export, no new route or transport action, and no persisted row anywhere.
 *
 * Reaching this same outcome through the real browser/UI additionally
 * requires composing the enrichment reservation/grant/settlement pipeline
 * (domain/enrichment-repository.ts) into a route -- that pipeline is
 * currently composed nowhere in app/ and doing so is a materially bigger,
 * separately-owned change outside person-discovery's scope. See the
 * handoff note in the person-discovery lane report for exactly what a
 * browser-acceptance extension would still need.
 */
test("a decided Contact can reach genuine ContactReady eligibility through the existing evidence/eligibility modules, with zero persistence", async () => {
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

    // From here on, nothing more is asked of person-discovery: the exact
    // current relevance authority it already produced is handed to the
    // existing, unmodified evidence/eligibility modules exactly as any
    // already-known-Contact caller would.
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
      kind: "email", value: "  VERIFIED@EXAMPLE.TEST ", confidence: 0.01,
      provenance: { sourceReference: "synthetic-demo-source", excerpt: "synthetic mailbox verification record", objectReference: "synthetic-demo-object", contentHash: "b".repeat(64), retrievedAt: PERSON_DISCOVERY_NOW - 2_000 },
      observedAt: PERSON_DISCOVERY_NOW - 1_000, lineage: { parentObservationId: null },
    });
    let verifierCalls = 0;
    const verifier = evidence.bindContactEvidenceVerifier({ verifierId: "synthetic-demo-verifier", verifierVersion: "v1" }, async () => {
      verifierCalls += 1;
      return {
        observationId: envelope.id, workspaceId: assignment.workspaceId, contactId: assignment.contactId,
        profileConfigurationId: assignment.profileConfigurationId, profileConfigurationDigest: assignment.profileConfigurationDigest,
        kind: "email", normalizedValue: "verified@example.test", contentHash: envelope.provenance.contentHash,
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
