import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const ORIGIN = "https://prospector.example.invalid";
const OWNER_EMAIL = "owner-private-marker@example.invalid";
const OUTSIDER_EMAIL = "outsider-private-marker@example.invalid";
const TENANT_MARKER = "workspace-private-marker-cross-tenant";
const SECRET_MARKERS = [OWNER_EMAIL, OUTSIDER_EMAIL, TENANT_MARKER, "company-private-marker"];
const PUBLIC_ROUTES = Object.freeze({
  "capabilities/route.ts": ["GET"],
  "capability-probe/route.ts": ["POST"],
  "contacts/person-discovery/route.ts": ["GET", "POST"],
  "contacts/route.ts": ["GET", "POST"],
  "discovery/route.ts": ["GET", "POST"],
  "interview/route.ts": ["GET", "POST"],
  "knowledge/route.ts": ["GET", "POST"],
  "morning-brief/route.ts": ["GET"],
  "prospecting/route.ts": ["GET", "POST"],
  "prospecting/runner/route.ts": ["POST"],
});

test("the production API inventory stays explicit and separate from local-demo routes", async () => {
  const apiRoot = new URL("../app/api/", import.meta.url);
  const routeFiles = (await filesBelow(apiRoot))
    .filter((path) => path.endsWith("/route.ts") || path.endsWith("/route.localdemo"))
    .sort();
  const publicRoutes = routeFiles.filter((path) => !path.startsWith("local-demo/"));
  const localDemoRoutes = routeFiles.filter((path) => path.startsWith("local-demo/"));

  assert.deepEqual(publicRoutes, Object.keys(PUBLIC_ROUTES).sort());
  assert.deepEqual(localDemoRoutes, [
    "local-demo/composition/route.localdemo",
    "local-demo/operator-journey-e1/route.ts",
    "local-demo/person-discovery-c4/route.ts",
    "local-demo/person-discovery-c4/verification/route.ts",
  ]);

  for (const [route, methods] of Object.entries(PUBLIC_ROUTES)) {
    const source = await readFile(new URL(route, apiRoot), "utf8");
    const exported = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/gu)]
      .map((match) => match[1]);
    assert.deepEqual(exported.sort(), [...methods].sort(), route);
  }
});

test("anonymous and outsider requests cannot read or mutate any owner-facing domain entry point", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const handlers = await loadHandlers(vite);
    for (const identity of [null, { email: OUTSIDER_EMAIL, displayName: "Outsider" }]) {
      for (const entry of ownerEntryPoints(handlers)) {
        const tripwire = makeTripwire();
        const dependencies = ownerDependencies(identity, tripwire);
        for (const invoke of [entry.read, entry.mutate].filter(Boolean)) {
          const response = await invoke(dependencies);
          await assertNeutralDenial(response, entry.name);
        }
        assert.equal(tripwire.touches(), 0, `${entry.name} touched a protected dependency`);
      }
    }
  } finally {
    await vite.close();
  }
});

test("caller-spoofed identity and tenant fields grant neither owner nor runner authority", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const handlers = await loadHandlers(vite);
    for (const entry of ownerEntryPoints(handlers)) {
      const tripwire = makeTripwire();
      const response = await entry.spoof(ownerDependencies(null, tripwire));
      await assertNeutralDenial(response, entry.name);
      assert.equal(tripwire.touches(), 0, `${entry.name} trusted caller scope before admission`);
    }

    const runnerTripwire = makeTripwire();
    const response = await handlers.runner.handleRunnerRuntimeRequest(
      mutationRequest("/api/prospecting/runner", "runner-submission", {
        workspaceId: TENANT_MARKER,
        tenantId: TENANT_MARKER,
        ownerEmail: OWNER_EMAIL,
        capability: "caller-controlled-capability",
        idempotencyKey: "caller-controlled-key",
        payload: { workspaceId: TENANT_MARKER, ownerEmail: OWNER_EMAIL },
      }),
      { DB: runnerTripwire.database },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "runner_ingress_unavailable" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(runnerTripwire.touches(), 0);
  } finally {
    await vite.close();
  }
});

test("protected dependency failures return only bounded public errors", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  const expected = new Map([
    ["capabilities", [503, "capability_status_unavailable"]],
    ["contacts", [503, "contacts_unavailable"]],
    ["person discovery", [503, "person_discovery_unavailable"]],
    ["discovery", [500, "server_error"]],
    ["interview", [500, "server_error"]],
    ["knowledge", [500, "server_error"]],
    ["morning brief", [503, "morning_brief_unavailable"]],
    ["prospecting", [500, "server_error"]],
  ]);
  try {
    const handlers = await loadHandlers(vite);
    for (const entry of ownerEntryPoints(handlers)) {
      const response = await entry.read(ownerDependencies(
        { email: OWNER_EMAIL, displayName: "Owner Private Marker" },
        makeTripwire("database-private-marker"),
      ));
      const [status, error] = expected.get(entry.name);
      assert.equal(response.status, status, entry.name);
      assert.equal(response.headers.get("cache-control"), "no-store", entry.name);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", entry.name);
      const body = await response.json();
      assert.deepEqual(body, { error }, entry.name);
      assert.doesNotMatch(JSON.stringify(body), /private-marker|owner-private|database-private/u, entry.name);
    }
  } finally {
    await vite.close();
  }
});

async function loadHandlers(vite) {
  const load = (name) => vite.ssrLoadModule(new URL(`../domain/${name}.ts`, import.meta.url).pathname);
  const [capability, contacts, discovery, interview, knowledge, morningBrief, personDiscovery, prospecting, runner] = await Promise.all([
    load("capability-handler"), load("contacts-handler"), load("discovery-handler"),
    load("interview-handler"), load("knowledge-handler"), load("morning-brief-handler"),
    load("person-discovery-handler"), load("prospecting-handler"), load("runner-runtime"),
  ]);
  return { capability, contacts, discovery, interview, knowledge, morningBrief, personDiscovery, prospecting, runner };
}

function ownerEntryPoints(handlers) {
  return [
    {
      name: "capabilities",
      read: (dependencies) => handlers.capability.handleCapabilitiesGet(dependencies),
      mutate: (dependencies) => handlers.capability.handleCapabilityProbePost(mutationRequest("/api/capability-probe", "capability-proof", {}), dependencies),
      spoof: (dependencies) => handlers.capability.handleCapabilityProbePost(spoofRequest("/api/capability-probe", "capability-proof"), dependencies),
    },
    {
      name: "contacts",
      read: (dependencies) => handlers.contacts.handleContactsGet(readRequest("/api/contacts"), dependencies),
      mutate: (dependencies) => handlers.contacts.handleContactsPost(mutationRequest("/api/contacts", "contacts-mutation", { action: "create_grant_confirmation" }), dependencies),
      spoof: (dependencies) => handlers.contacts.handleContactsPost(spoofRequest("/api/contacts", "contacts-mutation"), dependencies),
    },
    {
      name: "person discovery",
      read: (dependencies) => handlers.personDiscovery.handlePersonDiscoveryGet(readRequest("/api/contacts/person-discovery"), dependencies),
      mutate: (dependencies) => handlers.personDiscovery.handlePersonDiscoveryPost(mutationRequest("/api/contacts/person-discovery", "person-discovery-mutation", { action: "start_person_discovery" }), dependencies),
      spoof: (dependencies) => handlers.personDiscovery.handlePersonDiscoveryPost(spoofRequest("/api/contacts/person-discovery", "person-discovery-mutation"), dependencies),
    },
    {
      name: "discovery",
      read: (dependencies) => handlers.discovery.handleDiscoveryGet(readRequest("/api/discovery"), dependencies),
      mutate: (dependencies) => handlers.discovery.handleDiscoveryPost(mutationRequest("/api/discovery", "discovery-mutation", { action: "read_current_state" }), dependencies),
      spoof: (dependencies) => handlers.discovery.handleDiscoveryPost(spoofRequest("/api/discovery", "discovery-mutation"), dependencies),
    },
    {
      name: "interview",
      read: (dependencies) => handlers.interview.handleInterviewGet(dependencies),
      mutate: (dependencies) => handlers.interview.handleInterviewPost(mutationRequest("/api/interview", "interview-mutation", { action: "bootstrap" }), dependencies),
      spoof: (dependencies) => handlers.interview.handleInterviewPost(spoofRequest("/api/interview", "interview-mutation"), dependencies),
    },
    {
      name: "knowledge",
      read: (dependencies) => handlers.knowledge.handleKnowledgeGet(dependencies),
      mutate: (dependencies) => handlers.knowledge.handleKnowledgePost(mutationRequest("/api/knowledge", "knowledge-mutation", { action: "initialize_owner_workspace" }), dependencies),
      spoof: (dependencies) => handlers.knowledge.handleKnowledgePost(spoofRequest("/api/knowledge", "knowledge-mutation"), dependencies),
    },
    {
      name: "morning brief",
      read: (dependencies) => handlers.morningBrief.handleMorningBriefGet(readRequest("/api/morning-brief"), dependencies),
      spoof: (dependencies) => handlers.morningBrief.handleMorningBriefGet(readRequest(`/api/morning-brief?workspaceId=${TENANT_MARKER}&ownerEmail=${OWNER_EMAIL}`), dependencies),
    },
    {
      name: "prospecting",
      read: (dependencies) => handlers.prospecting.handleProspectingGet(readRequest("/api/prospecting"), dependencies),
      mutate: (dependencies) => handlers.prospecting.handleProspectingPost(mutationRequest("/api/prospecting", "prospecting-mutation", { action: "read_profile_readiness" }), dependencies),
      spoof: (dependencies) => handlers.prospecting.handleProspectingPost(spoofRequest("/api/prospecting", "prospecting-mutation"), dependencies),
    },
  ];
}

function ownerDependencies(identity, tripwire) {
  return {
    database: tripwire.database,
    pilotOwnerEmail: OWNER_EMAIL,
    subjectPepper: "tenant-isolation-test-pepper-with-at-least-32-bytes",
    getIdentity: async () => identity,
    releaseEvidence: Object.freeze({}),
    getWorkspace: tripwire.call,
    readEvidence: tripwire.call,
    issueCsrfToken: tripwire.call,
    consumeCsrfToken: tripwire.call,
    runStorageProof: tripwire.call,
    prerequisites: { database: true, objectStorage: true, secrets: true },
    read: tripwire.call,
  };
}

function makeTripwire(detail = "protected dependency touched before tenant admission") {
  let touched = 0;
  const touch = () => {
    touched += 1;
    throw new Error(detail);
  };
  return {
    database: new Proxy({}, { get: touch }),
    call: async () => touch(),
    touches: () => touched,
  };
}

function readRequest(path) {
  return new Request(new URL(path, ORIGIN));
}

function spoofRequest(path, intent) {
  return mutationRequest(path, intent, {
    action: "read_current_state",
    workspaceId: TENANT_MARKER,
    workspace_id: TENANT_MARKER,
    tenantId: TENANT_MARKER,
    tenant_id: TENANT_MARKER,
    ownerEmail: OWNER_EMAIL,
    principalSubject: "owner-subject-private-marker",
    companyName: "company-private-marker",
  });
}

function mutationRequest(path, intent, body) {
  return new Request(new URL(path, ORIGIN), {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-prospector-intent": intent,
      "oai-authenticated-user-email": OWNER_EMAIL,
      "cf-access-authenticated-user-email": OWNER_EMAIL,
    },
    body: JSON.stringify(body),
  });
}

async function assertNeutralDenial(response, name) {
  assert.equal(response.status, 404, name);
  assert.equal(response.headers.get("cache-control"), "no-store", name);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", name);
  assert.equal(response.headers.get("set-cookie"), null, name);
  const body = await response.json();
  assert.deepEqual(body, { error: "private_workspace_unavailable" }, name);
  for (const marker of SECRET_MARKERS) {
    assert.doesNotMatch(JSON.stringify(body), new RegExp(escapeRegex(marker), "u"), name);
  }
}

async function filesBelow(root, prefix = "") {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesBelow(new URL(`${entry.name}/`, root), `${relative}/`));
    else files.push(relative);
  }
  return files;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
