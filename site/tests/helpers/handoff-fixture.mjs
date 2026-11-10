// Shared synthetic D1 fixture for Phase 7 handoff tests: one workspace with an
// activated Profile, one approved Outreach Package for one Contact, and the
// canonical migrations rolled forward through 0023. It mirrors the fixture in
// tests/handoff-recovery-repository.test.mjs. Everything is local and synthetic.

import { readFile } from "node:fs/promises";
import { CANONICAL_MIGRATION_FILENAMES } from "../../scripts/migration-chain.mjs";
import { createD1Fixture } from "./d1.mjs";
import { OUTREACH_FIXTURE_FORWARD_MIGRATIONS, OUTREACH_NOW, OUTREACH_OWNER, seedOutreachAuthority } from "./outreach-fixture.mjs";

export const HANDOFF_T0 = OUTREACH_NOW + 1_000;

const hex = (character) => character.repeat(64);

export async function loadDomain(fixture, path) {
  return fixture.vite.ssrLoadModule(new URL(`../../domain/${path}`, import.meta.url).pathname);
}

async function applyFiles(database, filenames) {
  for (const filename of filenames) {
    const sql = await readFile(new URL(`../../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await database.prepare(trimmed).run();
    }
  }
}

function packageInput(seeded) {
  return {
    packageId: "handoff-package-root",
    prospectId: seeded.prospectId,
    contactId: seeded.contactId,
    profileId: seeded.profileId,
    version: 1,
    expectedVersion: 0,
    configurationId: seeded.configurationId,
    configurationDigest: seeded.configurationDigest,
    configurationRevision: seeded.configurationRevision,
    prospectRevision: seeded.prospectRevision,
    contactRevision: seeded.contactRevision,
    contactEligibilitySnapshotId: seeded.eligibilityId,
    snapshot: {
      evidenceDigests: [seeded.evidenceDigest],
      claimGuardrailDigests: [seeded.guardrailDigest],
      recommendedAngle: "Synthetic handoff angle",
      selectedRole: "champion",
      selectedContactPointDigests: [seeded.contactPointDigest],
      callScript: "Synthetic offline call script.",
      draftMessageIds: ["handoff-message-root"],
    },
    bindings: [
      { kind: "configuration", id: seeded.configurationId, digest: seeded.configurationDigest },
      { kind: "qualification", id: "outreach-assessment", digest: hex("2") },
      { kind: "review_decision", id: "outreach-review", digest: hex("5") },
      { kind: "source", id: "outreach-source", digest: seeded.sourceDigest },
      { kind: "evidence", id: "outreach-evidence", digest: seeded.evidenceDigest },
      { kind: "claim_guardrail", id: "outreach-guardrail", digest: seeded.guardrailDigest },
      { kind: "contact_observation", id: seeded.observationId, digest: seeded.observationDigest },
      { kind: "contact_eligibility", id: seeded.eligibilityId, digest: seeded.eligibilityDigest },
    ],
    idempotencyKey: "handoff-package-version",
  };
}

/**
 * Caller disposes `fixture`. `identity` renames the seeded Prospect/Contact/email;
 * `approvalExpiresAt` sets the Package approval's expiry.
 */
export async function handoffFixture(name, { identity, approvalExpiresAt = OUTREACH_NOW + 20_000 } = {}) {
  const fixture = await createD1Fixture(name);
  try {
    const seeded = await seedOutreachAuthority(fixture, identity ? { identity } : {});
    await fixture.database.prepare("UPDATE prospecting_candidates SET status='observed' WHERE id='outreach-candidate'").run();
    const outreachModule = await loadDomain(fixture, "outreach-repository.ts");
    const outreach = outreachModule.createD1OutreachRepository(fixture.database, {
      workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => OUTREACH_NOW,
    });
    const packageVersion = await outreach.createPackageVersion(packageInput(seeded));
    const packageApproval = await outreach.approvePackageVersion({
      packageVersionId: packageVersion.id, expectedVersion: 1, expiresAt: approvalExpiresAt, idempotencyKey: "handoff-package-approval",
    });
    const cutoff = CANONICAL_MIGRATION_FILENAMES.findIndex((filename) => filename.startsWith("0017_"));
    await applyFiles(fixture.database, CANONICAL_MIGRATION_FILENAMES.slice(cutoff + 1)
      .filter((filename) => !OUTREACH_FIXTURE_FORWARD_MIGRATIONS.includes(filename)));
    return { fixture, seeded, outreach, packageVersion, packageApproval };
  } catch (error) {
    await fixture.dispose();
    throw error;
  }
}
