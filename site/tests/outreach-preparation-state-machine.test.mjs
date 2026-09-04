import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_900_000_000_000;
const PACKAGE_DIGEST = "a".repeat(64);
const MESSAGE_DIGEST = "b".repeat(64);

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, module: await vite.ssrLoadModule(new URL("../preparation/outreach-approval-suppression.ts", import.meta.url).pathname) };
}

function fixture(patch = {}) {
  return {
    workspaceId: "synthetic-workspace",
    companyId: "synthetic-company",
    contactId: "synthetic-contact",
    organizationId: "synthetic-organization",
    selectedEmail: "prospect@example.invalid",
    confirmedEmailDomains: ["example.invalid"],
    selectedPhone: "+12025550101",
    packageArtifact: { id: "synthetic-package", digest: PACKAGE_DIGEST },
    messageArtifact: {
      id: "synthetic-message",
      digest: MESSAGE_DIGEST,
      packageId: "synthetic-package",
      packageDigest: PACKAGE_DIGEST,
    },
    ...patch,
  };
}

function packageApproval(patch = {}) {
  return {
    type: "approve_package",
    idempotencyKey: "synthetic-package-approval-key",
    approvalId: "synthetic-package-approval",
    packageId: "synthetic-package",
    packageDigest: PACKAGE_DIGEST,
    approvedAt: NOW,
    expiresAt: NOW + 10_000,
    ...patch,
  };
}

function messageApproval(patch = {}) {
  return {
    type: "approve_message",
    idempotencyKey: "synthetic-message-approval-key",
    approvalId: "synthetic-message-approval",
    messageId: "synthetic-message",
    messageDigest: MESSAGE_DIGEST,
    packageId: "synthetic-package",
    packageDigest: PACKAGE_DIGEST,
    approvedAt: NOW + 1,
    expiresAt: NOW + 9_000,
    complianceAcknowledged: true,
    ...patch,
  };
}

function suppression(kind, value, channel, patch = {}) {
  const keyKind = kind.replaceAll("_", "-");
  return {
    type: "add_suppression",
    idempotencyKey: `synthetic-${keyKind}-suppression-key`,
    tombstoneId: `synthetic-${keyKind}-tombstone`,
    subject: { kind, value, channel },
    reason: "synthetic_owner_request",
    source: "synthetic_owner",
    effectiveAt: NOW + 2,
    ...patch,
  };
}

async function approved(module) {
  let state = module.createSyntheticOutreachPreparation(fixture());
  state = await module.applySyntheticOutreachCommand(state, packageApproval());
  state = await module.applySyntheticOutreachCommand(state, messageApproval());
  return state;
}

test("package and message approvals are immutable separate authorities with zero effects", async () => {
  const { vite, module } = await load();
  try {
    let state = module.createSyntheticOutreachPreparation(fixture());
    let projection = module.projectSyntheticOutreachPreparation(state, NOW);
    assert.equal(projection.package.status, "blocked_missing_package_approval");
    assert.equal(projection.email.status, "blocked_missing_package_approval");

    state = await module.applySyntheticOutreachCommand(state, packageApproval());
    projection = module.projectSyntheticOutreachPreparation(state, NOW + 1);
    assert.equal(projection.package.status, "approved_for_future_crm_eligibility");
    assert.equal(projection.email.status, "blocked_missing_message_approval");

    state = await module.applySyntheticOutreachCommand(state, messageApproval());
    projection = module.projectSyntheticOutreachPreparation(state, NOW + 2);
    assert.equal(projection.email.status, "ready_for_future_composition");
    assert.equal(projection.email.eligibleForFutureComposition, true);
    assert.equal(projection.phone.status, "unavailable_not_implemented");
    assert.deepEqual(projection.effects, {
      providerCalls: 0,
      outboxMutations: 0,
      sendInvocations: 0,
      callInvocations: 0,
      exportMutations: 0,
      durableMutations: 0,
    });
    assert.equal(Object.isFrozen(state), true);
    assert.equal(Object.isFrozen(state.messageApproval), true);
    assert.equal(Object.isFrozen(projection), true);
  } finally {
    await vite.close();
  }
});

test("append-only suppression blocks the matching channel across every synthetic subject scope", async () => {
  const { vite, module } = await load();
  try {
    const cases = [
      ["company", "synthetic-company", "all", true],
      ["organization", "synthetic-organization", "all", true],
      ["contact", "synthetic-contact", "all", true],
      ["exact_email", "prospect@example.invalid", "email", true],
      ["confirmed_email_domain", "example.invalid", "email", true],
      ["exact_phone", "+12025550101", "phone", false],
    ];
    for (const [kind, value, channel, emailBlocked] of cases) {
      const before = await approved(module);
      const state = await module.applySyntheticOutreachCommand(before, suppression(kind, value, channel));
      const projection = module.projectSyntheticOutreachPreparation(state, NOW + 3);
      assert.equal(projection.email.status === "blocked_suppression", emailBlocked, kind);
      assert.equal(projection.suppression.matchedTombstoneIds.length, 1, kind);
      assert.equal(state.tombstones.length, 1, kind);
      assert.deepEqual(projection.effects, before.effects, kind);
    }
  } finally {
    await vite.close();
  }
});

test("exact email stays distinct and domain suppression requires owner-confirmed equivalence", async () => {
  const { vite, module } = await load();
  try {
    const state = await approved(module);
    const otherEmail = await module.applySyntheticOutreachCommand(state, suppression(
      "exact_email",
      "other@example.invalid",
      "email",
    ));
    assert.equal(module.projectSyntheticOutreachPreparation(otherEmail, NOW + 3).email.status, "ready_for_future_composition");

    await assert.rejects(
      module.applySyntheticOutreachCommand(state, suppression("confirmed_email_domain", "unconfirmed.invalid", "email")),
      /synthetic_outreach_command_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("replay is exact, key reuse conflicts, and suppression cannot be removed", async () => {
  const { vite, module } = await load();
  try {
    const initial = module.createSyntheticOutreachPreparation(fixture());
    const approvedOnce = await module.applySyntheticOutreachCommand(initial, packageApproval());
    const replayed = await module.applySyntheticOutreachCommand(approvedOnce, packageApproval());
    assert.equal(replayed, approvedOnce);
    await assert.rejects(
      module.applySyntheticOutreachCommand(approvedOnce, packageApproval({ packageDigest: "c".repeat(64) })),
      /synthetic_outreach_idempotency_conflict/,
    );
    await assert.rejects(
      module.applySyntheticOutreachCommand(approvedOnce, { type: "remove_suppression", idempotencyKey: "synthetic-remove" }),
      /synthetic_outreach_command_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("effective suppression defeats later approval while future suppression blocks only when effective", async () => {
  const { vite, module } = await load();
  try {
    const initial = module.createSyntheticOutreachPreparation(fixture());
    const alreadySuppressed = await module.applySyntheticOutreachCommand(initial, suppression(
      "exact_email",
      "prospect@example.invalid",
      "email",
      { effectiveAt: NOW - 1 },
    ));
    await assert.rejects(
      module.applySyntheticOutreachCommand(alreadySuppressed, packageApproval()),
      /synthetic_outreach_command_invalid/,
    );

    const futureSuppressed = await module.applySyntheticOutreachCommand(initial, suppression(
      "exact_email",
      "prospect@example.invalid",
      "email",
      { effectiveAt: NOW + 5 },
    ));
    const packageApproved = await module.applySyntheticOutreachCommand(futureSuppressed, packageApproval());
    const messageApproved = await module.applySyntheticOutreachCommand(packageApproved, messageApproval());
    assert.equal(module.projectSyntheticOutreachPreparation(messageApproved, NOW + 2).email.status, "ready_for_future_composition");
    assert.equal(module.projectSyntheticOutreachPreparation(messageApproved, NOW + 5).email.status, "blocked_suppression");
  } finally {
    await vite.close();
  }
});

test("stale, forged, cross-artifact, malformed, accessor, and non-synthetic inputs fail closed", async () => {
  const { vite, module } = await load();
  try {
    const initial = module.createSyntheticOutreachPreparation(fixture());
    await assert.rejects(
      module.applySyntheticOutreachCommand(initial, packageApproval({ packageId: "synthetic-other-package" })),
      /synthetic_outreach_command_invalid/,
    );
    const packageApproved = await module.applySyntheticOutreachCommand(initial, packageApproval());
    await assert.rejects(
      module.applySyntheticOutreachCommand(packageApproved, messageApproval({ packageDigest: "c".repeat(64) })),
      /synthetic_outreach_command_invalid/,
    );
    assert.equal(module.projectSyntheticOutreachPreparation(packageApproved, NOW + 20_000).package.status, "blocked_expired_package_approval");

    const getter = {};
    Object.defineProperty(getter, "type", { enumerable: true, get() { throw new Error("must-not-run"); } });
    await assert.rejects(module.applySyntheticOutreachCommand(initial, getter), /synthetic_outreach_command_invalid/);
    const symbolExtra = packageApproval();
    symbolExtra[Symbol("forged")] = true;
    await assert.rejects(module.applySyntheticOutreachCommand(initial, symbolExtra), /synthetic_outreach_command_invalid/);
    assert.throws(
      () => module.createSyntheticOutreachPreparation(fixture({ selectedEmail: "real@example.com" })),
      /synthetic_outreach_fixture_invalid/,
    );
    const accessorDomains = [];
    Object.defineProperty(accessorDomains, "0", { enumerable: true, get() { throw new Error("must-not-run"); } });
    accessorDomains.length = 1;
    assert.throws(
      () => module.createSyntheticOutreachPreparation(fixture({ confirmedEmailDomains: accessorDomains })),
      /synthetic_outreach_fixture_invalid/,
    );
    assert.throws(
      () => module.createSyntheticOutreachPreparation(fixture({ confirmedEmailDomains: new Array(1) })),
      /synthetic_outreach_fixture_invalid/,
    );
    assert.throws(
      () => module.createSyntheticOutreachPreparation(new Proxy(fixture(), { ownKeys() { throw new Error("must-not-run"); } })),
      /synthetic_outreach_fixture_invalid/,
    );
  } finally {
    await vite.close();
  }
});
