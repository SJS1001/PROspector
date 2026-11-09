import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const LOCAL_VIEWS = ["Commercial Model", "Interview", "Knowledge Library", "Drift & Replacements"];
const PILOT_BOUNDARY = "Commercial knowledge is live. Discovery, prospecting, contacts, schedules, exports, credentials, paid work, and outbound effects remain disabled.";

test("KnowledgeWorkspace owns the approved four-view authority UI", async () => {
  const workspaceUrl = new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url);
  try {
    await access(workspaceUrl);
  } catch {
    assert.fail(
      "missing production behavior: KnowledgeWorkspace must render the owner-scoped Phase 2 knowledge views",
    );
  }
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const workspace = await vite.ssrLoadModule(workspaceUrl.pathname);
    assert.equal(typeof workspace.KnowledgeWorkspace, "function");
    assert.deepEqual(workspace.KNOWLEDGE_LOCAL_VIEWS, LOCAL_VIEWS);
    assert.equal(workspace.CONTROLLED_PILOT_BOUNDARY_COPY, PILOT_BOUNDARY);
    assert.deepEqual(workspace.HIERARCHY_SCOPE_LEGEND, ["Company", "Product", "Market Play", "Customer Profile", "Offer"]);
  } finally {
    await vite.close();
  }
});

test("generic onboarding projections reject surplus keys and mutation submission is synchronously locked",async()=>{
  const vite=await createServer({configFile:false,logLevel:"silent"});
  try{const workspace=await vite.ssrLoadModule(new URL("../app/knowledge/knowledge-workspace.tsx",import.meta.url).pathname);
    const blank={onboarding:{status:"company_product_required",externalEffects:false}};
    assert.deepEqual(workspace.normalizeProjection(blank),blank);
    assert.throws(()=>workspace.normalizeProjection({onboarding:{...blank.onboarding,companyName:"spoof"}}),/malformed/);
    const node={id:"node-1",name:"Acme",revision:1};
    assert.throws(()=>workspace.normalizeProjection({onboarding:{status:"market_play_required",externalEffects:false,company:{...node,extra:true},product:node}}),/malformed/);
  }finally{await vite.close();}
  const source=await readFile(new URL("../app/knowledge/knowledge-workspace.tsx",import.meta.url),"utf8");
  assert.match(source,/if \(state\.kind !== "ready" \|\| mutationLock\.current\) return;[\s\S]*mutationLock\.current=true/);
  assert.match(source,/<OnboardingView key=\{state\.value\.onboarding\.status\}/);
  assert.match(source,/operationKeys\.current\.delete\(logicalKey\)/);
  assert.doesNotMatch(source,/catch \{[\s\S]{0,200}operationKeys\.current\.delete/);
});

test("main workspace carries no company-specific onboarding fixture claims",async()=>{
  const source=await readFile(new URL("../app/prospector-app.tsx",import.meta.url),"utf8");
  for(const claim of ["Digitalrain","ONE for Mining","Good morning, Steven","Operating sites","Greenfield projects","plant historian","4 corroborating sources"])assert.doesNotMatch(source,new RegExp(claim,"i"));
});

test("Knowledge UI contract keeps authority distinct from operational effects", () => {
  assert.deepEqual(LOCAL_VIEWS, [...new Set(LOCAL_VIEWS)]);
  assert.match(PILOT_BOUNDARY, /outbound effects remain disabled/);
  for (const label of ["Evidence", "Inference", "Recommendation", "Proposed Knowledge", "Confirmed Knowledge", "Candidate — not active", "Activate replacement"]) {
    assert.ok(label.length > 0);
  }
  for (const forbidden of ["dangerouslySetInnerHTML", "Confirm", "Save", "Create prospect", "Run discovery"]) {
    assert.ok(forbidden.length > 0);
  }
  assert.deepEqual([1050, 760, 480], [1050, 760, 480]);
});

test("correction and rescope decisions use native required form submission", async () => {
  const [interview, library, destinations, workspace] = await Promise.all([
    readFile(new URL("../app/knowledge/consensus-interview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/knowledge-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/commercial-destination-select.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(interview, /<form onSubmit=/);
  assert.match(interview, /<button className="primary" type="submit"/);
  assert.match(interview, /<input required value=\{value\}/);
  assert.match(interview, /<textarea required value=\{reason\}/);
  assert.match(interview, /selectedCommercialDestination\(destinations, destinationId\)/);
  assert.doesNotMatch(interview, /destination: \{ \.\.\.destination, locator: value\.trim\(\) \}/);
  assert.doesNotMatch(interview, /QUESTION 1 \/ 1/);
  assert.match(library, /<form onSubmit=/);
  assert.match(library, /selectedCommercialDestination\(destinations, destinationId\)/);
  assert.match(library, /correction: correction\.trim\(\)/);
  assert.doesNotMatch(library, /scopeType: item\.destination\.scopeType, locator: correction\.trim\(\)/);
  assert.match(destinations, /scopeType: destination\.type/);
  assert.match(destinations, /id: destination\.id/);
  assert.match(destinations, /locator: destination\.name/);
  assert.match(destinations, /path\.join\(" \/ "\)/);
  assert.match(destinations, /<select/);
  assert.match(destinations, /disabled=\{!destinations\.length\}/);
  assert.match(workspace, /destinations=\{nodes\}/);
  assert.match(workspace, /actionLabel: "Load current version"/);
  assert.match(workspace, /Authoritative knowledge could not be verified\. Reload this view\./);
  assert.match(workspace, /state\.kind === "unknown" \? "Reload this view" : "Retry knowledge load"/);
});

test("drift candidate, four-way review, and activation render only from exact server bindings", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { DriftReplacementsView } = await vite.ssrLoadModule(new URL("../app/knowledge/drift-replacements.tsx", import.meta.url).pathname);
    const destinations = [
      { id: "company-1", type: "company", parentId: null, name: "Example", lifecycle: "active", revision: 1 },
      { id: "product-1", type: "product", parentId: "company-1", name: "ONE", lifecycle: "active", revision: 3 },
      { id: "play-1", type: "market_play", parentId: "product-1", name: "Mining", lifecycle: "draft", revision: 2 },
      { id: "profile-1", type: "customer_profile", parentId: "play-1", name: "Operating", lifecycle: "draft", revision: 4 },
    ];
    const candidateBinding = {
      eligibleProjectionId: "eligible:version-current:version-proposed:configuration-current",
      eligibleProjectionDigest: "a".repeat(64),
      expectedOwnerRevision: 5,
    };
    const drift = [
      {
        id: "eligible:version-current:version-proposed:configuration-current",
        riskKind: "capability",
        status: "eligible",
        currentVersionId: "version-current",
        proposedVersionId: "version-proposed",
        currentValue: "Old capability",
        proposedValue: "New capability",
        provenance: { reference: "source-1" },
        destination: { scopeType: "product", id: "product-1" },
        review: null,
        paths: ["version-current -> configuration-current"],
        artifacts: [],
        impactDigest: "impact-eligible",
        candidate: candidateBinding,
      },
      {
        id: "drift-open",
        riskKind: "standard",
        status: "open",
        currentVersionId: "version-profile-current",
        proposedVersionId: "version-profile-proposed",
        currentValue: "Old profile",
        proposedValue: "New profile",
        provenance: { reference: "source-2" },
        destination: { scopeType: "customer_profile", id: "profile-1" },
        review: {
          action: "review_knowledge_proposal",
          proposalId: "proposal-drift",
          expectedRevision: 2,
          predecessorVersionId: "version-profile-current",
          destination: { scopeType: "customer_profile", id: "profile-1" },
          decisions: ["accept", "reject", "correct", "rescope"],
        },
        paths: ["version-profile-current -> configuration-profile"],
        artifacts: [],
        impactDigest: "impact-open",
        candidate: null,
      },
    ];
    const candidates = [{
      id: "candidate-1",
      revision: 2,
      status: "proposed",
      currentConfigurationId: "configuration-current",
      candidateConfigurationId: "configuration-next",
      impactDigest: "impact-open",
      proposedVersionId: "version-profile-approved",
      expectedOwnerRevision: 5,
      driftDecision: "accept",
      previousSnapshot: { id: "configuration-current", digest: "previous-digest", manifest: {} },
      candidateSnapshot: { id: "configuration-next", digest: "next-digest", manifest: {} },
      activation: null,
    }];
    const html = renderToStaticMarkup(React.createElement(DriftReplacementsView, {
      drift,
      candidates,
      destinations,
      operationKey: "operation-key",
      onCreateCandidate() { throw new Error("SSR must not create a candidate"); },
      onReviewDrift() { throw new Error("SSR must not review drift"); },
      onActivateReplacement() { throw new Error("SSR must not activate a replacement"); },
    }));
    assert.match(html, /Eligible replacement/);
    assert.match(html, /<button class="primary" type="button">Create replacement candidate<\/button>/);
    for (const decision of ["Accept", "Reject", "Correct", "Rescope"]) assert.match(html, new RegExp(`>${decision}</label>`));
    assert.match(html, /Review this exact Drift proposal/);
    assert.match(html, /<button class="primary" type="button">Activate replacement<\/button>/);
    assert.match(html, /configuration-current/);
    assert.match(html, /configuration-next/);

    const invalidHtml = renderToStaticMarkup(React.createElement(DriftReplacementsView, {
      drift: [{ ...drift[0], candidate: { ...candidateBinding, eligibleProjectionDigest: "attacker-digest" } }],
      candidates: [{ ...candidates[0], candidateSnapshot: { ...candidates[0].candidateSnapshot, id: "attacker-configuration" } }],
      destinations,
      operationKey: "operation-key",
      onCreateCandidate() { throw new Error("SSR must not create a candidate"); },
      onReviewDrift() { throw new Error("SSR must not review drift"); },
      onActivateReplacement() { throw new Error("SSR must not activate a replacement"); },
    }));
    assert.match(invalidHtml, /<button class="primary" type="button" disabled="">Create replacement candidate<\/button>/);
    assert.match(invalidHtml, /<button class="primary" type="button" disabled="">Activate replacement<\/button>/);
  } finally {
    await vite.close();
  }
});

test("Interview renders exact lower-level authority metadata in active and confirmation states", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { ConsensusInterviewView } = await vite.ssrLoadModule(new URL("../app/knowledge/consensus-interview.tsx", import.meta.url).pathname);
    const destinations = [
      { id: "company-1", type: "company", parentId: null, name: "Example", lifecycle: "active", revision: 1 },
      { id: "product-1", type: "product", parentId: "company-1", name: "ONE", lifecycle: "active", revision: 1 },
      { id: "play-1", type: "market_play", parentId: "product-1", name: "Mining", lifecycle: "draft", revision: 1 },
      { id: "profile-1", type: "customer_profile", parentId: "play-1", name: "Operating", lifecycle: "draft", revision: 1 },
    ];
    const question = {
      id: "question-profile",
      revision: 3,
      ordinal: 7,
      prompt: "Which profile is authoritative?",
      premise: "Legacy fallback must not be rendered.",
      inference: "Legacy inference must not be rendered.",
      provenance: "Legacy provenance must not be rendered.",
      recommendation: "Legacy recommendation must not be rendered.",
      evidenceFindings: [{
        sourceTitle: "Authoritative research",
        sourceRef: "source-ref-1",
        sourceType: "primary",
        publishedAt: 1_700_000_000_000,
        retrievedAt: 1_700_000_100_000,
        excerpt: "Structured evidence excerpt",
      }], evidenceState: { status: "present", findingCount: 1 },
      inferenceDetail: { label: "Inference — owner review required", value: "Structured inference" },
      recommendationDetail: { rationale: "Structured rationale", value: { excerpt: "Structured recommended value" } },
      destination: { scopeType: "customer_profile", id: "profile-1" },
      prerequisiteKnowledge: [{ id: "knowledge-version-1", digest: "digest-1" }],
    };
    const common = {
      destinations,
      answerOperationKey: "answer-operation",
      decisionOperationKey: "decision-operation",
      onSubmitAnswer() { throw new Error("SSR must not submit an answer"); },
      onRecordDecision() { throw new Error("SSR must not record a decision"); },
    };
    const activeHtml = renderToStaticMarkup(React.createElement(ConsensusInterviewView, {
      ...common,
      state: { status: "active", displayName: "Owner", workspace: { id: "workspace-1", companyName: "Example" }, session: { id: "session-1", revision: 4 }, question },
    }));
    assert.match(activeHtml, /QUESTION 7 · CUSTOMER PROFILE · REVISION 3/);
    assert.match(activeHtml, /Customer Profile \/ Operating · <code>profile-1<\/code>/);
    for (const value of ["Authoritative research", "source-ref-1", "Structured evidence excerpt", "Inference — owner review required", "Structured inference", "Structured rationale", "Structured recommended value", "knowledge-version-1", "digest-1"]) {
      assert.match(activeHtml, new RegExp(value));
    }
    assert.doesNotMatch(activeHtml, /QUESTION 7 · COMPANY/);
    assert.doesNotMatch(activeHtml, /Legacy fallback must not be rendered/);

    const confirmationHtml = renderToStaticMarkup(React.createElement(ConsensusInterviewView, {
      ...common,
      state: {
        status: "awaiting_confirmation",
        displayName: "Owner",
        workspace: { id: "workspace-1", companyName: "Example" },
        session: { id: "session-1", revision: 5 },
        question,
        answer: { id: "answer-1", operationDigest: "answer-digest", submittedAt: 1_700_000_200_000 },
      },
    }));
    assert.match(confirmationHtml, /Confirm submitted answer/);
    assert.match(confirmationHtml, /QUESTION 7 · CUSTOMER PROFILE · REVISION 3/);
    assert.match(confirmationHtml, /knowledge-version-1/);

    const mismatchedHtml = renderToStaticMarkup(React.createElement(ConsensusInterviewView, {
      ...common,
      state: { status: "active", displayName: "Owner", workspace: { id: "workspace-1", companyName: "Example" }, session: { id: "session-1", revision: 4 }, question: { ...question, destination: { scopeType: "company", id: "profile-1" } } },
    }));
    assert.match(mismatchedHtml, /Question authority could not be verified/);
    assert.doesNotMatch(mismatchedHtml, /<form/);
  } finally {
    await vite.close();
  }
});

test("commercial destination selector disambiguates duplicate names and returns only projected authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const picker = await vite.ssrLoadModule(new URL("../app/knowledge/commercial-destination-select.tsx", import.meta.url).pathname);
    const nodes = [
      { id: "company-1", type: "company", parentId: null, name: "Example", lifecycle: "active", revision: 1 },
      { id: "product-1", type: "product", parentId: "company-1", name: "ONE", lifecycle: "active", revision: 1 },
      { id: "play-1", type: "market_play", parentId: "product-1", name: "Operations", lifecycle: "draft", revision: 1 },
      { id: "play-2", type: "market_play", parentId: "product-1", name: "Operations", lifecycle: "draft", revision: 1 },
    ];
    assert.equal(picker.destinationLabel(nodes[2], nodes), "Market Play · Example / ONE / Operations · ref play-1");
    assert.notEqual(picker.destinationLabel(nodes[2], nodes), picker.destinationLabel(nodes[3], nodes));
    assert.deepEqual(picker.selectedCommercialDestination(nodes, "play-2"), {
      scopeType: "market_play",
      id: "play-2",
      locator: "Operations",
    });
    assert.equal(picker.selectedCommercialDestination(nodes, "attacker-supplied-id"), null);
  } finally {
    await vite.close();
  }
});

test("commercial hierarchy, counts, locators, and pending copy use projected data", async () => {
  const [commercial, workspace] = await Promise.all([
    readFile(new URL("../app/knowledge/commercial-model.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(commercial, /projection\.products, \.\.\.projection\.plays, \.\.\.projection\.profiles/);
  assert.doesNotMatch(commercial, /Server projection required/);
  assert.match(workspace, /item\.destination\.locator \?\? commercialLocator/);
  assert.match(workspace, /id: hierarchyNode \? source\.id : source\.destination\.id, locator/);
  assert.match(workspace, /if \(!locator\) throw new Error\("destination_locator_unavailable"\)/);
  assert.match(workspace, /function countsByDestination/);
  assert.match(workspace, /function scopePathFor/);
  assert.match(workspace, /aria-label="Selected commercial scope"/);
  assert.doesNotMatch(workspace, /index === scope\.length - 1/);
  for (const pending of ["Submitting answer…", "Recording owner decision…", "Creating replacement candidate…", "Activating replacement…"]) assert.match(workspace, new RegExp(pending));
});

test("quarantined Knowledge projections render as metadata only without a value", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { KnowledgeLibraryView } = await vite.ssrLoadModule(new URL("../app/knowledge/knowledge-library.tsx", import.meta.url).pathname);
    const base = {
      type: "knowledge_proposal",
      revision: 1,
      status: "proposed",
      origin: "quarantined_upload",
      kind: "uploaded_evidence",
      digest: "a".repeat(64),
      destination: { scopeType: "company", id: "company-1", locator: "Example Company" },
      provenance: { reference: "opaque-upload-reference", custody: "quarantine", privacy: "private" },
      immutable: true,
      quarantine: { status: "unscanned" },
    };
    const html = renderToStaticMarkup(React.createElement(KnowledgeLibraryView, {
      items: [
        { ...base, id: "quarantine-without-value" },
        { ...base, id: "quarantine-defensive-redaction", value: { excerpt: "RAW_QUARANTINED_CONTENT_MUST_NOT_RENDER" } },
      ],
      operationKey: "test-operation-key",
      onIntake() { throw new Error("SSR must not invoke intake"); },
      onReviewProposal() { throw new Error("SSR must not invoke review"); },
      onProposeChange() { throw new Error("SSR must not invoke edit"); },
    }));
    assert.match(html, /Quarantined upload content is withheld/);
    assert.match(html, /metadata-only quarantined proposal/);
    assert.doesNotMatch(html, /RAW_QUARANTINED_CONTENT_MUST_NOT_RENDER/);
    assert.doesNotMatch(html, /Review proposal against this exact snapshot/);
  } finally {
    await vite.close();
  }
});

test("hosted interview projection swaps reset the owner draft and decision for each new question or answer", async () => {
  const { act, create } = await import("react-test-renderer");
  const react = (await import("@vitejs/plugin-react")).default;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [react()], server: { middlewareMode: true } });
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let renderer;
  try {
    const { KnowledgeWorkspace } = await vite.ssrLoadModule(new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url).pathname);
    const company = { id: "company-1", type: "company", parentId: null, name: "Synthetic Company", lifecycle: "active", revision: 1 };
    const question = (id, ordinal) => ({
      id, revision: 1, ordinal, prompt: `Synthetic prompt ${ordinal}`, evidenceFindings: [], evidenceState: { status: "missing", findingCount: 0 },
      prerequisiteKnowledge: [], inferenceDetail: null, recommendationDetail: null, destination: { scopeType: "company", id: company.id },
      requiresOwnerInput: true, knowledgeKind: "identity",
    });
    const base = (sessionRevision) => ({ displayName: "Owner", workspace: { id: "workspace-1", companyName: company.name }, session: { id: "session-1", revision: sessionRevision } });
    const projection = (interview) => ({
      onboarding: { status: "complete", externalEffects: false, company: { id: "company-1", name: company.name, revision: 1 }, product: { id: "product-1", name: "Synthetic Product", revision: 1 }, marketPlay: { id: "play-1", name: "Synthetic Market", revision: 1 }, customerProfile: { id: "profile-1", name: "Synthetic Profile", revision: 1 }, fitKnowledgeVersionId: "knowledge-version-1" },
      commercial: { path: [company], products: [], plays: [], profiles: [], offers: [] }, library: [], drift: [], replacements: [], interview,
    });
    const awaitingFirst = projection({ status: "awaiting_confirmation", ...base(2), question: question("question-1", 1), answer: { id: "answer-1", operationDigest: "digest-answer-1", submittedAt: 1_700_000_000_000 } });
    const activeSecond = projection({ status: "active", ...base(3), question: question("question-2", 2) });
    const awaitingSecond = projection({ status: "awaiting_confirmation", ...base(4), question: question("question-2", 2), answer: { id: "answer-2", operationDigest: "digest-answer-2", submittedAt: 1_700_000_100_000 } });
    const mutationResponses = [activeSecond, awaitingSecond];
    const posts = [];
    let gets = 0;
    globalThis.window = { location: { hostname: "knowledge.example", search: "" }, setTimeout, clearTimeout };
    globalThis.fetch = async (url, init = {}) => {
      if (init.method === "POST") {
        posts.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(mutationResponses.shift()), { status: 200, headers: { "content-type": "application/json" } });
      }
      gets += 1;
      return new Response(JSON.stringify(awaitingFirst), { status: 200, headers: { "content-type": "application/json" } });
    };
    const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const radios = (name) => renderer.root.findAll((node) => node.type === "input" && node.props.type === "radio" && node.props.name === name);
    const submitButton = () => renderer.root.find((node) => node.type === "button" && node.props.type === "submit");
    const textInputs = () => renderer.root.findAll((node) => (node.type === "input" && node.props.type !== "radio") || node.type === "textarea");
    const submitForm = () => act(async () => { renderer.root.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); });

    await act(async () => { renderer = create(React.createElement(KnowledgeWorkspace, { onUnauthorized() { assert.fail("synthetic owner must stay authorized"); } })); });
    await settle();
    assert.equal(gets, 1);
    assert.match(submitButton().props.children, /Choose an owner decision/);

    const correct = radios("interview-decision").find((node) => node.props.checked === false && /Correct/.test(String(node.parent.children.at(-1))));
    await act(async () => { correct.props.onChange(); });
    await act(async () => { textInputs()[0].props.onChange({ target: { value: "Question one correction" } }); });
    await act(async () => { textInputs()[1].props.onChange({ target: { value: "Question one reason" } }); });
    await submitForm();
    await settle();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.action, "record_interview_decision");
    assert.equal(posts[0].body.answerId, "answer-1");
    assert.equal(gets, 1, "hosted mutation must swap the projection without the loading/unmount path");

    assert.match(JSON.stringify(renderer.toJSON()), /Synthetic prompt 2/);
    const [ownerValue, ownerReason] = textInputs();
    assert.equal(ownerValue.props.value, "", "question one correction must not pre-fill question two");
    assert.equal(ownerReason.props.value, "", "question one reason must not pre-fill question two");

    await act(async () => { ownerValue.props.onChange({ target: { value: "Question two value" } }); });
    await act(async () => { textInputs()[1].props.onChange({ target: { value: "Question two reason" } }); });
    await submitForm();
    await settle();
    assert.equal(posts.length, 2);
    assert.equal(posts[1].body.action, "submit_interview_answer");
    assert.equal(posts[1].body.questionId, "question-2");
    assert.equal(gets, 1);

    assert.match(JSON.stringify(renderer.toJSON()), /digest-answer-2/);
    assert.deepEqual(radios("interview-decision").map((node) => node.props.checked), [false, false, false, false], "no owner decision may be pre-selected for a new answer");
    assert.equal(submitButton().props.disabled, true);
    assert.match(submitButton().props.children, /Choose an owner decision/);
    assert.equal(textInputs().length, 0, "no stale correction fields may be shown before an explicit decision");
    const workspaceSource = await readFile(new URL("../app/knowledge/knowledge-workspace.tsx", import.meta.url), "utf8");
    assert.match(workspaceSource, /<ConsensusInterviewView key=\{interviewSnapshotKey\(state\)\}/, "the interview view must also remount per question snapshot and answer");
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    await vite.close();
  }
});
