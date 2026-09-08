import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const CLOSED_ACTIONS = [
  "initialize_owner_workspace",
  "create_onboarding_draft",
  "start_onboarding_interview",
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
  assert.match(source, /runtimeIdentity/);
  assert.doesNotMatch(source, /authenticated-user-email|request\.headers/i);
  assert.doesNotMatch(source, /multipart|formData\(|file upload|uploadFile/i);
});

test("generic onboarding is fenced to a resolver-proven local demo and exact loopback origin",async()=>{
  const handler=await readFile(new URL("../domain/knowledge-handler.ts",import.meta.url),"utf8");
  const route=await readFile(new URL("../app/api/knowledge/route.ts",import.meta.url),"utf8");
  // This asserts the writesActivated-bypass seam (localOnboardingSeam), not
  // whether reads attach interview progression -- that gate was removed by
  // issue #9's fix: the generalized queue composer is safe for any
  // authenticated owner of their own workspace, and gating its projection
  // behind enableLocalDemoProgression left ordinary secure identity with no
  // supported way to see the queue digest needed to advance the interview.
  assert.match(handler,/enableLocalDemoProgression\s*===\s*true/);
  assert.match(handler,/runtimeIsDevelopment\s*===\s*true/);
  assert.match(handler,/exactLoopbackMutation\(request\)/);
  assert.match(handler,/new URL\(origin!\)\.origin===url\.origin/);
  assert.match(route,/runtimeIsDevelopment: import\.meta\.env\.DEV/);
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(page,/admitOperatorSession\(bindings\)/);
  const admission=await readFile(new URL("../app/owner-admission.ts",import.meta.url),"utf8");
  assert.match(admission,/admitPilotOwner\(\s*await runtimeIdentity/);
  const identity=await readFile(new URL("../app/runtime-identity.ts",import.meta.url),"utf8");
  // dd0727f flipped this gate from negative to positive form so the block, and
  // the demo identity constant it imports, fold out of the production bundle
  // entirely. The fence itself is unchanged in strength: the demo path is still
  // reachable only in a development build, under the local-demo provider, with
  // Cloudflare Access disabled and LOCAL_DEMO set, and only from a loopback
  // host. Assert the conjunction rather than any one literal, so dropping a
  // single condition fails here.
  assert.match(
    identity,
    /import\.meta\.env\.DEV\s*&&\s*bindings\.TRUSTED_IDENTITY_PROVIDER === "local-demo"\s*&&\s*accessMode === "disabled"\s*&&\s*bindings\.LOCAL_DEMO === "1"/u,
  );
  assert.match(identity,/if \(!isLoopbackHostname\(host\)\) return null;/u);
  // A non-GET demo request must additionally match origin to URL exactly.
  assert.match(identity,/new URL\(origin\)\.origin !== new URL\(request\.url\)\.origin\) return null/u);
  // The identity constant must stay behind the folded dynamic import, never a
  // static top-level import that would survive into dist/.
  assert.match(identity,/await import\("\.\/_local-demo-identity"\)/u);
  assert.doesNotMatch(identity,/^import .*_local-demo-identity/mu);
  // The exported isLocalDemoRequest predicate is a second entry point to the
  // same demo path and must carry the same four conditions plus loopback.
  assert.match(
    identity,
    /export function isLocalDemoRequest[\s\S]{0,400}?return import\.meta\.env\.DEV\s*&&\s*bindings\.TRUSTED_IDENTITY_PROVIDER === "local-demo"\s*&&\s*bindings\.LOCAL_DEMO === "1"\s*&&\s*accessMode === "disabled"\s*&&\s*isLoopbackHostname\(/u,
  );
});

test("knowledge mutation routing cannot drop an exact Explore selection before answer or confirmation", async () => {
  const handler = await readFile(new URL("../domain/knowledge-handler.ts", import.meta.url), "utf8");
  assert.match(handler, /submitInterviewAnswer\(database, principal,[\s\S]{0,500}\}, selection\)/);
  assert.match(handler, /recordInterviewDecision\(database, principal,[\s\S]{0,650}\}, selection\)/);
  assert.match(handler, /projectionResponse\(dependencies\.database, principal, dependencies\.interviewSelection\)/);
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
