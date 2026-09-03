import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildStage3ReadCommands,
  verifyStage3Evidence,
} from "../scripts/greenfield-stage3-evidence.mjs";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");
const bootstrapMessage = "Plan 02-99 Stage 3 unreachable bootstrap";
const finalMessage = "Plan 02-99 Stage 3 unreachable private candidate";

test("Stage 3 evidence double-reads only versions and deployments and emits no private material", async () => {
  const fixture = await createFixture("success");
  const privateEmail = "private-owner@example.invalid";
  const privateVersionIds = [
    "11111111-2222-4333-8444-555555555555",
    "66666666-7777-4888-8999-aaaaaaaaaaaa",
  ];
  const versions = [
    version(privateVersionIds[0], bootstrapMessage, privateEmail, "2026-09-03T01:00:00.000Z"),
    version(privateVersionIds[1], finalMessage, privateEmail, "2026-09-03T01:10:00.000Z"),
  ];
  const calls = [];
  try {
    const receipt = await verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: async (command) => {
        calls.push(command);
        return {
          stdout: JSON.stringify(command.key === "versions" ? versions : []),
          stderr: `private warning for ${privateEmail}`,
        };
      },
    });

    assert.deepEqual(calls, [
      ...buildStage3ReadCommands(fixture.configPath),
      ...buildStage3ReadCommands(fixture.configPath),
    ]);
    assert.deepEqual(Object.keys(receipt).sort(), [
      "code",
      "configDigest",
      "deploymentCount",
      "ok",
      "sourceDigest",
      "status",
      "versionCount",
      "versionInventoryDigest",
    ]);
    assert.deepEqual({ ok: receipt.ok, status: receipt.status, code: receipt.code }, {
      ok: true,
      status: "passed",
      code: "stage3_unreachable_versions_verified",
    });
    assert.equal(receipt.versionCount, 2);
    assert.equal(receipt.deploymentCount, 0);
    assert.match(receipt.versionInventoryDigest, /^[a-f0-9]{64}$/u);
    const serialized = JSON.stringify(receipt);
    assert.doesNotMatch(serialized, new RegExp(privateEmail, "u"));
    for (const versionId of privateVersionIds) {
      assert.doesNotMatch(serialized, new RegExp(versionId, "u"));
    }
  } finally {
    await fixture.cleanup();
  }
});

test("Stage 3 evidence rejects any deployment or unexpected version inventory", async () => {
  const fixture = await createFixture("inventory");
  const versions = expectedVersions();
  try {
    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: runner({ versions, deployments: [{ id: "private-deployment" }] }),
    }), { message: "unexpected_deployment" });

    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: runner({ versions: [...versions, versions[1]], deployments: [] }),
    }), { message: "version_inventory_invalid" });
  } finally {
    await fixture.cleanup();
  }
});

test("Stage 3 evidence rejects cross-read drift and malformed provider output", async () => {
  const fixture = await createFixture("drift");
  const versions = expectedVersions();
  let versionReads = 0;
  try {
    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: async (command) => {
        if (command.key === "deployments") return { stdout: "[]", stderr: "" };
        versionReads += 1;
        const current = structuredClone(versions);
        if (versionReads === 2) current[1].metadata.created_on = "2026-09-03T01:11:00.000Z";
        return { stdout: JSON.stringify(current), stderr: "private provider output" };
      },
    }), { message: "stage3_evidence_drift" });

    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: async () => ({ stdout: "private malformed json", stderr: "private error" }),
    }), { message: "provider_output_invalid" });
  } finally {
    await fixture.cleanup();
  }
});

test("Stage 3 evidence binds current source and exact runtime candidate bytes", async () => {
  const fixture = await createFixture("binding");
  try {
    await writeFile(fixture.expectationPath, `${JSON.stringify({
      runtimeCandidateDigest: "f".repeat(64),
      sourceCommit: fixture.sourceCommit,
    })}\n`, { mode: 0o600 });
    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: runner({ versions: expectedVersions(), deployments: [] }),
    }), { message: "runtime_candidate_digest_mismatch" });

    await writeFile(fixture.expectationPath, `${JSON.stringify({
      runtimeCandidateDigest: digest(fixture.configSource),
      sourceCommit: "a".repeat(40),
    })}\n`, { mode: 0o600 });
    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: runner({ versions: expectedVersions(), deployments: [] }),
    }), { message: "source_commit_mismatch" });
  } finally {
    await fixture.cleanup();
  }
});

test("Stage 3 evidence requires owner-only private inputs before provider reads", async () => {
  const fixture = await createFixture("custody");
  let calls = 0;
  try {
    await chmod(fixture.configPath, 0o644);
    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: async () => { calls += 1; return { stdout: "[]" }; },
    }), { message: "config_permissions_invalid" });
    assert.equal(calls, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("Stage 3 evidence rejects any reachable or effect-capable runtime candidate before provider reads", async () => {
  const fixture = await createFixture("exposure");
  let calls = 0;
  fixture.config.workers_dev = true;
  fixture.config.routes = [{ pattern: "example.com/*" }];
  const configSource = `${JSON.stringify(fixture.config, null, 2)}\n`;
  await writeFile(fixture.configPath, configSource, { mode: 0o600 });
  await writeFile(fixture.expectationPath, `${JSON.stringify({
    runtimeCandidateDigest: digest(configSource),
    sourceCommit: fixture.sourceCommit,
  })}\n`, { mode: 0o600 });
  try {
    await assert.rejects(() => verifyStage3Evidence({
      configPath: fixture.configPath,
      expectationPath: fixture.expectationPath,
      runCommand: async () => { calls += 1; return { stdout: "[]" }; },
    }), { message: "runtime_candidate_invalid" });
    assert.equal(calls, 0);
  } finally {
    await fixture.cleanup();
  }
});

function version(id, message, authorEmail, createdOn) {
  return {
    id,
    number: 1,
    metadata: {
      created_on: createdOn,
      source: "wrangler",
      author_email: authorEmail,
    },
    annotations: {
      "workers/message": message,
      "workers/triggered_by": "upload",
    },
  };
}

async function createFixture(label) {
  const nonce = `${process.pid}-${Date.now()}-${label}`;
  const directory = resolve(root, `.wrangler/greenfield-stage3-test-${nonce}`);
  const configPath = resolve(directory, "runtime.json");
  const expectationPath = resolve(directory, "expectation.json");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const config = {
    name: "prospector-greenfield-test",
    workers_dev: false,
    preview_urls: false,
    triggers: { crons: [] },
    vars: {
      TRUSTED_IDENTITY_PROVIDER: "cloudflare-access",
      CLOUDFLARE_ACCESS_ISSUER: "https://prospector-test.cloudflareaccess.com",
      CLOUDFLARE_ACCESS_AUDIENCE: "abcdefghijklmnop1234567890",
    },
    secrets: { required: ["OWNER_SUBJECT_PEPPER", "PILOT_OWNER_EMAIL"] },
  };
  const configSource = `${JSON.stringify(config, null, 2)}\n`;
  const expectation = {
    runtimeCandidateDigest: digest(configSource),
    sourceCommit,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(configPath, configSource, { mode: 0o600 });
  await writeFile(expectationPath, `${JSON.stringify(expectation)}\n`, { mode: 0o600 });
  return {
    configPath,
    expectationPath,
    sourceCommit,
    config,
    configSource,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function expectedVersions() {
  return [
    version(
      "11111111-2222-4333-8444-555555555555",
      bootstrapMessage,
      "private-owner@example.invalid",
      "2026-09-03T01:00:00.000Z",
    ),
    version(
      "66666666-7777-4888-8999-aaaaaaaaaaaa",
      finalMessage,
      "private-owner@example.invalid",
      "2026-09-03T01:10:00.000Z",
    ),
  ];
}

function runner({ versions, deployments }) {
  return async (command) => ({
    stdout: JSON.stringify(command.key === "versions" ? versions : deployments),
    stderr: "private provider output",
  });
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
