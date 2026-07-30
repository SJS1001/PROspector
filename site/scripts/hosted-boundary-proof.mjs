#!/usr/bin/env node

import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SAFE_STATUS_VALUES = new Set(["proven", "blocked", "unproven"]);
const DENIAL_MARKERS = new Set([
  "companyname",
  "workspaceid",
  "auditid",
  "csrftoken",
  "capabilities",
  "owner",
  "email",
]);
const PROOF_STEPS = ["put", "read", "digest", "delete", "absence"];
const OBJECT_STORAGE_CAPABILITY_ID = "r2_object_lifecycle";
const PRODUCTION_HOST = "prospector-steven-pilot.djstif.chatgpt.site";
const MAXIMUM_SESSION_TRANSPORT_BYTES = 32 * 1024;

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
  session transport supplied by the operator. Only the session transport header is
  accepted. The file is read at runtime only; its path and value are never printed
  or written by this harness.

Safe output:
  Emits HTTP outcomes, allowed capability statuses, proof step booleans, timestamps,
  and opaque evidence references only. It never accepts an owner email, workspace ID,
  object key, object payload, subject pepper, provider key, lead/contact data, or export.
`;

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, check: "harness", outcome: safeError(error) })}\n`,
    );
    process.exitCode = 1;
  });
}

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
    await runOwnerProof(baseUrl, headers, initial.csrfCookie);
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
  if (url.hostname !== PRODUCTION_HOST && !isLocalhost(url.hostname)) {
    throw new Error("untrusted_base_url");
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
  const file = await open(path, "r");
  let raw;
  try {
    const stats = await file.stat();
    if (stats.size > MAXIMUM_SESSION_TRANSPORT_BYTES) {
      throw new Error("authenticated_session_transport_too_large");
    }
    raw = await file.readFile("utf8");
  } finally {
    await file.close();
  }
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("invalid_authenticated_session_transport");
  }
  const headers = {};
  for (const [name, headerValue] of Object.entries(value)) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName !== "cookie" ||
      typeof headerValue !== "string" ||
      !name ||
      /[\r\n]/u.test(name) ||
      /[\r\n]/u.test(headerValue)
    ) {
      throw new Error("invalid_authenticated_session_transport");
    }
    headers[normalizedName] = headerValue;
  }
  if (Object.keys(headers).length !== 1) {
    throw new Error("invalid_authenticated_session_transport");
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
  assertNoStore(response);
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
  return { response, body, csrfCookie: csrfCookieFromResponse(response) };
}

async function runOwnerProof(baseUrl, headers, initialCsrfCookie) {
  const foreign = await postProbe(baseUrl, headers, {
    csrfCookie: initialCsrfCookie,
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
    csrfCookie: malformedState.csrfCookie,
    body: "{",
  });
  assert(malformed.response.status === 400, "malformed_body_not_denied");
  assertNoPrivateMetadata(malformed.text, malformed.body);
  emit({ ok: true, check: "malformed_body_denial", status: 400 });

  const proofState = await readOwnerState(baseUrl, headers);
  const usedToken = proofState.csrfCookie;
  const proofResult = await postProbe(baseUrl, headers, {
    csrfCookie: usedToken,
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
    csrfCookie: usedToken,
    body: "{}",
  });
  assert(replay.response.status === 403, "csrf_replay_not_denied");
  assertNoPrivateMetadata(replay.text, replay.body);
  emit({ ok: true, check: "csrf_replay_denial", status: 403 });

  const durable = await readOwnerState(baseUrl, headers);
  const objectStorage = durable.body.capabilities.find(
    (item) => item.id === OBJECT_STORAGE_CAPABILITY_ID,
  );
  assert(objectStorage?.status === "proven", "durable_proof_not_projected");
  assert(
    objectStorage.evidenceReference === proof.evidenceReference,
    "durable_evidence_reference_mismatch",
  );
  assert(
    objectStorage.checkedAt === proof.checkedAt,
    "durable_evidence_timestamp_mismatch",
  );
  emit({
    ok: true,
    check: "durable_evidence_after_reload",
    status: objectStorage.status,
    checkedAt: objectStorage.checkedAt,
    evidenceReference: objectStorage.evidenceReference,
  });
}

async function postProbe(
  baseUrl,
  sessionHeaders,
  { csrfCookie = "", origin, fetchSite, body },
) {
  const target = new URL("/api/capability-probe", baseUrl);
  const headers = {
    ...sessionHeaders,
    "content-type": "application/json",
    "x-prospector-intent": "capability-proof",
    ...(csrfCookie
      ? { cookie: [sessionHeaders.cookie, csrfCookie].filter(Boolean).join("; ") }
      : {}),
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
      !("csrfToken" in body),
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
    body.owner?.admitted === true &&
      !containsIdentityMetadata(body),
    "private_identity_leak",
  );
}

function assertProofShape(body) {
  const proof = body?.proof;
  const bodyKeys = sortedKeys(body);
  const proofKeys = sortedKeys(proof);
  assert(
    body?.ok === true &&
      JSON.stringify(bodyKeys) ===
        JSON.stringify(["ok", "proof"]) &&
      JSON.stringify(proofKeys) ===
        JSON.stringify([
          "checkedAt",
          "digest",
          "evidenceReference",
          "probeId",
          "reason",
          "status",
          "steps",
        ]) &&
      proof?.status === "proven" &&
      Number.isFinite(proof.checkedAt) &&
      proof.checkedAt > 0 &&
      /^[a-f0-9]{32}$/u.test(proof.probeId) &&
      /^[a-f0-9]{64}$/u.test(proof.digest) &&
      typeof proof.evidenceReference === "string" &&
      proof.evidenceReference === `r2-proof-${proof.probeId}` &&
      typeof proof.reason === "string" &&
      PROOF_STEPS.every((step) => proof.steps?.[step] === true),
    "invalid_fixed_probe_response",
  );
  return proof;
}

function csrfCookieFromResponse(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(
    /(?:^|[,;]\s*)(__Host-prospector-csrf=[A-Za-z0-9_-]{43})(?:;|$)/u,
  );
  assert(match, "csrf_cookie_required");
  assert(/(?:^|;)\s*Path=\/(?:;|$)/iu.test(setCookie), "csrf_cookie_path_required");
  assert(/(?:^|;)\s*Max-Age=900(?:;|$)/iu.test(setCookie), "csrf_cookie_ttl_required");
  assert(/(?:^|;)\s*HttpOnly(?:;|$)/iu.test(setCookie), "csrf_cookie_http_only_required");
  assert(/(?:^|;)\s*Secure(?:;|$)/iu.test(setCookie), "csrf_cookie_secure_required");
  assert(/(?:^|;)\s*SameSite=Strict(?:;|$)/iu.test(setCookie), "csrf_cookie_same_site_required");
  return match[1];
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
  assert(!containsPrivateMetadata(body), "private_metadata_leak");
}

function containsPrivateMetadata(value) {
  if (typeof value === "string") {
    return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu.test(value);
  }
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
    return DENIAL_MARKERS.has(normalizedKey) || containsPrivateMetadata(child);
  });
}

function containsIdentityMetadata(value) {
  if (typeof value === "string") {
    return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu.test(value);
  }
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
    return (
      normalizedKey.includes("email") ||
      normalizedKey === "owneremail" ||
      containsIdentityMetadata(child)
    );
  });
}

function sortedKeys(value) {
  return value && typeof value === "object"
    ? Object.keys(value).sort()
    : [];
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

export {
  assertProofShape,
  loadSessionHeaders,
  normalizedBaseUrl,
  readOwnerState,
  runOwnerProof,
  verifyDeniedRead,
};
