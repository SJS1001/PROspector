#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const SAFE_STATUS_VALUES = new Set(["proven", "blocked", "unproven"]);
const DENIAL_MARKERS = [
  "companyName",
  "workspaceId",
  "auditId",
  "csrfToken",
  "capabilities",
  "owner",
  "email",
];
const PROOF_STEPS = ["put", "read", "digest", "delete", "absence"];

const HELP = `PROspector hosted boundary proof

Usage:
  node scripts/hosted-boundary-proof.mjs --base-url <https-url>
  node scripts/hosted-boundary-proof.mjs --base-url <https-url> --mode owner-read --session-headers-file <path>
  node scripts/hosted-boundary-proof.mjs --base-url <https-url> --mode owner-proof --session-headers-file <path>

Modes:
  denied       Verify an unauthenticated request is denied without private metadata (default).
  owner-read   Verify an authenticated capability read is non-cacheable and evidence-backed.
  owner-proof  Run the server-fixed storage proof, mutation denials, replay denial, and durable read.

Authenticated transport:
  --session-headers-file points to a local JSON object containing the authenticated
  request headers supplied by the operator. The file is read at runtime only. Its
  path, names, and values are never printed or written by this harness.

Safe output:
  Emits HTTP outcomes, allowed capability statuses, proof step booleans, timestamps,
  and opaque evidence references only. It never accepts an owner email, workspace ID,
  object key, object payload, subject pepper, provider key, lead/contact data, or export.
`;

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, check: "harness", outcome: safeError(error) })}\n`,
  );
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const headers = options.headersFile
    ? await loadSessionHeaders(options.headersFile)
    : {};

  if (options.mode !== "denied" && !options.headersFile) {
    throw new Error("authenticated_session_transport_required");
  }
  if (options.mode === "denied" && options.headersFile) {
    throw new Error("denied_mode_must_not_use_authenticated_transport");
  }

  if (options.mode === "denied") {
    await verifyDeniedRead(baseUrl);
    return;
  }

  const initial = await readOwnerState(baseUrl, headers);
  emit({
    ok: true,
    check: "owner_read",
    status: initial.response.status,
    overallStatus: initial.body.overallStatus,
    capabilityStatuses: statusCounts(initial.body.capabilities),
  });

  if (options.mode === "owner-proof") {
    await runOwnerProof(baseUrl, headers, initial.body.csrfToken);
  }
}

function parseArgs(args) {
  const options = {
    baseUrl: "",
    mode: "denied",
    headersFile: "",
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--base-url") {
      options.baseUrl = requiredValue(args, ++index, argument);
    } else if (argument === "--mode") {
      options.mode = requiredValue(args, ++index, argument);
    } else if (argument === "--session-headers-file") {
      options.headersFile = requiredValue(args, ++index, argument);
    } else {
      throw new Error("unsupported_argument");
    }
  }

  if (
    !options.help &&
    !new Set(["denied", "owner-read", "owner-proof"]).has(options.mode)
  ) {
    throw new Error("unsupported_mode");
  }
  if (!options.help && !options.baseUrl) throw new Error("base_url_required");
  return options;
}

function requiredValue(args, index, argument) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${argument.slice(2).replaceAll("-", "_")}_required`);
  }
  return value;
}

function normalizedBaseUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && !isLocalhost(url.hostname)) {
    throw new Error("https_base_url_required");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function loadSessionHeaders(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("invalid_authenticated_session_transport");
  }
  const headers = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (
      typeof headerValue !== "string" ||
      !name ||
      /[\r\n]/u.test(name) ||
      /[\r\n]/u.test(headerValue)
    ) {
      throw new Error("invalid_authenticated_session_transport");
    }
    headers[name] = headerValue;
  }
  return headers;
}

async function verifyDeniedRead(baseUrl) {
  const response = await fetch(new URL("/api/capabilities", baseUrl), {
    redirect: "manual",
  });
  const text = await response.text();
  const body = safeJson(text);
  assert(response.status === 401 || response.status === 404, "denial_expected");
  assertNoPrivateMetadata(text, body);
  emit({
    ok: true,
    check: "unauthenticated_denial",
    status: response.status,
    neutral: true,
  });
}

async function readOwnerState(baseUrl, headers) {
  const response = await fetch(new URL("/api/capabilities", baseUrl), {
    headers,
    redirect: "manual",
  });
  const body = await response.json();
  assert(response.status === 200 && body.ok === true, "owner_read_failed");
  assertNoStore(response);
  assertCapabilityState(body);
  return { response, body };
}

async function runOwnerProof(baseUrl, headers, initialCsrfToken) {
  const foreign = await postProbe(baseUrl, headers, {
    csrfToken: initialCsrfToken,
    origin: "https://invalid.example",
    fetchSite: "cross-site",
    body: "{}",
  });
  assert(foreign.response.status === 403, "foreign_origin_not_denied");
  assertNoPrivateMetadata(foreign.text, foreign.body);
  emit({ ok: true, check: "foreign_origin_denial", status: 403 });

  const missingCsrf = await postProbe(baseUrl, headers, {
    body: "{}",
  });
  assert(missingCsrf.response.status === 403, "missing_csrf_not_denied");
  assertNoPrivateMetadata(missingCsrf.text, missingCsrf.body);
  emit({ ok: true, check: "missing_csrf_denial", status: 403 });

  const malformedState = await readOwnerState(baseUrl, headers);
  const malformed = await postProbe(baseUrl, headers, {
    csrfToken: malformedState.body.csrfToken,
    body: "{",
  });
  assert(malformed.response.status === 400, "malformed_body_not_denied");
  assertNoPrivateMetadata(malformed.text, malformed.body);
  emit({ ok: true, check: "malformed_body_denial", status: 400 });

  const proofState = await readOwnerState(baseUrl, headers);
  const usedToken = proofState.body.csrfToken;
  const proofResult = await postProbe(baseUrl, headers, {
    csrfToken: usedToken,
    body: "{}",
  });
  assert(proofResult.response.status === 200, "storage_proof_failed");
  assertNoStore(proofResult.response);
  const proof = assertProofShape(proofResult.body);
  emit({
    ok: true,
    check: "storage_lifecycle",
    status: proof.status,
    steps: proof.steps,
    checkedAt: proof.checkedAt,
    evidenceReference: proof.evidenceReference,
  });

  const replay = await postProbe(baseUrl, headers, {
    csrfToken: usedToken,
    body: "{}",
  });
  assert(replay.response.status === 403, "csrf_replay_not_denied");
  assertNoPrivateMetadata(replay.text, replay.body);
  emit({ ok: true, check: "csrf_replay_denial", status: 403 });

  const durable = await readOwnerState(baseUrl, headers);
  const objectStorage = durable.body.capabilities.find(
    (item) => item.id === "object-storage",
  );
  assert(objectStorage?.status === "proven", "durable_proof_not_projected");
  assert(
    objectStorage.evidence?.reference === proof.evidenceReference,
    "durable_evidence_reference_mismatch",
  );
  emit({
    ok: true,
    check: "durable_evidence_after_reload",
    status: objectStorage.status,
    checkedAt: objectStorage.evidence.checkedAt,
    evidenceReference: objectStorage.evidence.reference,
  });
}

async function postProbe(
  baseUrl,
  sessionHeaders,
  { csrfToken = "", origin, fetchSite, body },
) {
  const target = new URL("/api/capability-probe", baseUrl);
  const headers = {
    ...sessionHeaders,
    "content-type": "application/json",
    "x-prospector-intent": "capability-proof",
    ...(csrfToken ? { "x-prospector-csrf": csrfToken } : {}),
    origin: origin ?? target.origin,
    "sec-fetch-site": fetchSite ?? "same-origin",
  };
  const response = await fetch(target, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
  });
  const text = await response.text();
  return { response, text, body: safeJson(text) };
}

function assertCapabilityState(body) {
  assert(
    body &&
      Array.isArray(body.capabilities) &&
      body.capabilities.length > 0 &&
      typeof body.csrfToken === "string" &&
      body.csrfToken.length > 0,
    "invalid_capability_response",
  );
  assert(
    SAFE_STATUS_VALUES.has(body.overallStatus) &&
      body.capabilities.every(
        (item) =>
          item &&
          typeof item.id === "string" &&
          SAFE_STATUS_VALUES.has(item.status),
      ),
    "invalid_capability_status",
  );
  assert(
    !("email" in body) &&
      !("workspaceId" in body) &&
      !JSON.stringify(body.owner).includes("@"),
    "private_identity_leak",
  );
}

function assertProofShape(body) {
  const proof = body?.proof;
  assert(
    body?.ok === true &&
      proof?.status === "proven" &&
      typeof proof.checkedAt === "number" &&
      typeof proof.evidenceReference === "string" &&
      proof.evidenceReference.length > 0 &&
      PROOF_STEPS.every((step) => proof.steps?.[step] === true),
    "invalid_fixed_probe_response",
  );
  return proof;
}

function assertNoStore(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert(
    cacheControl
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .includes("no-store"),
    "no_store_required",
  );
}

function assertNoPrivateMetadata(text, body) {
  const lowered = text.toLowerCase();
  assert(!lowered.includes("digitalrain"), "private_company_leak");
  for (const marker of DENIAL_MARKERS) {
    assert(
      !Object.prototype.hasOwnProperty.call(body, marker),
      "private_metadata_leak",
    );
  }
}

function statusCounts(capabilities) {
  return Object.fromEntries(
    [...SAFE_STATUS_VALUES].map((status) => [
      status,
      capabilities.filter((item) => item.status === status).length,
    ]),
  );
}

function safeJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function safeError(error) {
  return error instanceof Error &&
    /^[a-z0-9_-]+$/u.test(error.message)
    ? error.message
    : "unexpected_failure";
}
