import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

async function runnerService(vite) {
  try { return await vite.ssrLoadModule(new URL("../domain/runner-assignment.ts", import.meta.url).pathname); }
  catch { assert.fail("missing production behavior: site/domain/runner-assignment.ts must issue and validate minimized assignment-bound runner connections"); }
}

test("D-03 runner connections are assignment-bound, short-lived, revocable, quota-limited, and append-only", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await runnerService(vite);
    const issued = await runner.issueRunnerAssignment({ workspaceId: "workspace-a", profileId: "profile-a", configurationId: "config-a", runId: "run-a", audience: "runner-a", provider: "declared-provider", model: "declared-model", instructionVersion: "instruction-v1", allowedTools: ["bounded_source_window"], expiresAt: 1_780_000_060_000, quotas: { bytes: 1024, findings: 1, sources: 1 } });
    assert.ok(issued.token);
    for (const mutation of [
      { audience: "runner-b" }, { profileId: "profile-b" }, { configurationId: "config-b" }, { runId: "run-b" },
      { now: 1_780_000_060_001 }, { nonce: "replayed" }, { revoked: true }, { bytes: 1025 },
      { provider: "different-provider" }, { model: "different-model" }, { unknownField: "reject" },
      { credentials: "never accepted" }, { terminalState: "succeeded" },
    ]) await assert.rejects(() => runner.validateRunnerSubmission(issued.token, { observations: [], status: "submitted", ...mutation }), /assignment|audience|scope|expired|nonce|revok|quota|provider|model|unknown|credential|terminal/i);
  } finally { await vite.close(); }
});

test("D-03/D-04 application assigns evidence tier and preserves retrieval boundary", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const runner = await runnerService(vite);
    const accepted = await runner.normalizeRunnerObservation({ url: "https://example.invalid/source", excerpt: "<script>untrusted</script>", publicationDate: 1_779_000_000_000, retrievedAt: 1_780_000_000_000, claimedTier: 1, claimedOutcome: "Passed" });
    assert.notEqual(accepted.tier, 1, "a runner cannot assign source tier");
    assert.equal(accepted.outcome, undefined, "a runner cannot claim qualification");
    assert.equal(accepted.excerpt.includes("<script>"), false, "stored display excerpt is escaped data");
    assert.equal(accepted.recency, "account_context_reconfirmation_required");
  } finally { await vite.close(); }
});
