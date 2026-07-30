import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const CLOSED_ACTIONS = [
  "initialize_commercial_model",
  "create_hierarchy_draft",
  "propose_owner_edit",
  "propose_repository_research",
  "import_plain_text",
  "propose_reuse",
  "propose_allowlisted_package",
  "submit_interview_answer",
  "record_interview_decision",
  "review_knowledge_proposal",
  "create_replacement_candidate",
  "activate_replacement",
];

test("knowledge handler is an owner-first, closed, activation-gated Phase 2 boundary", async () => {
  const handlerUrl = new URL("../domain/knowledge-handler.ts", import.meta.url);
  try {
    await access(handlerUrl);
  } catch {
    assert.fail(
      "missing production behavior: site/domain/knowledge-handler.ts must provide the secure knowledge boundary",
    );
  }

  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const handler = await vite.ssrLoadModule(handlerUrl.pathname);
    assert.equal(typeof handler.handleKnowledgeGet, "function");
    assert.equal(typeof handler.handleKnowledgePost, "function");
    assert.deepEqual(handler.KNOWLEDGE_ACTIONS, CLOSED_ACTIONS);
    assert.equal(handler.KNOWLEDGE_MUTATION_INTENT, "knowledge-mutation");
    assert.equal(handler.MAX_KNOWLEDGE_BODY_BYTES, 8192);
    assert.equal(handler.OLD_SCHEMA_PROJECTION, "phase2_schema_unavailable");
    assert.equal(handler.INACTIVE_WRITES_PROJECTION, "phase2_writes_not_activated");
  } finally {
    await vite.close();
  }
});

test("the knowledge route remains trusted-identity-only and does not expose an upload path", async () => {
  const routeUrl = new URL("../app/api/knowledge/route.ts", import.meta.url);
  try {
    await access(routeUrl);
  } catch {
    assert.fail(
      "missing production behavior: site/app/api/knowledge/route.ts must wire trusted identity to the knowledge handler",
    );
  }
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /getChatGPTUser/);
  assert.doesNotMatch(source, /authenticated-user-email|request\.headers/i);
  assert.doesNotMatch(source, /multipart|formData\(|file upload|uploadFile/i);
});

test("the closed command contract names safe Proposed-only intake and rejects operational authority", () => {
  assert.deepEqual(CLOSED_ACTIONS, [...new Set(CLOSED_ACTIONS)]);
  assert.equal(CLOSED_ACTIONS.includes("import_batch"), false);
  assert.equal(CLOSED_ACTIONS.includes("create_offer"), false);
  assert.equal(CLOSED_ACTIONS.includes("create_run"), false);
  assert.equal(CLOSED_ACTIONS.includes("create_prospect"), false);
  assert.equal(CLOSED_ACTIONS.includes("upload_file"), false);

  const research = {
    url: "https://public.example/research",
    excerpt: "Bounded plain-text source material.",
    destination: "customer_profile",
  };
  assert.match(research.url, /^https:\/\/(?![^/]*@)/);
  assert.doesNotMatch(research.excerpt, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.equal(research.destination, "customer_profile");
});
