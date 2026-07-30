import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadSessionHeaders,
  normalizedBaseUrl,
  readOwnerState,
  runOwnerProof,
  verifyDeniedRead,
} from "../scripts/hosted-boundary-proof.mjs";

const PROBE_ID = "0123456789abcdef0123456789abcdef";
const EVIDENCE_REFERENCE = `r2-proof-${PROBE_ID}`;
const CHECKED_AT = 1_785_284_800_000;

test("hosted proof harness validates denial and durable R2 evidence", async () => {
  const state = {
    token: 0,
    proofRecorded: false,
    usedTokens: new Set(),
  };
  const baseUrl = normalizedBaseUrl("http://127.0.0.1:8787");
  const fetchBeforeTest = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const headers = new Headers(options.headers);
    if (url.pathname === "/api/capabilities" && !options.method) {
      if (!headers.get("cookie")?.includes("session=controlled-test")) {
        return json(404, { error: "private_workspace_unavailable" });
      }
      state.token += 1;
      return json(200, {
        ok: true,
        owner: { admitted: true },
        workspace: { companyName: "Fixture company" },
        overallStatus: state.proofRecorded ? "proven" : "unproven",
        capabilities: [
          {
            id: "r2_object_lifecycle",
            name: "R2 write/read/delete durability",
            status: state.proofRecorded ? "proven" : "unproven",
            reason: state.proofRecorded
              ? "Current accepted evidence demonstrates the complete gate."
              : "Accepted evidence has not been recorded.",
            unavailableEffects: ["Documents, exports, and recovery objects"],
            ...(state.proofRecorded
              ? {
                  checkedAt: CHECKED_AT,
                  evidenceReference: EVIDENCE_REFERENCE,
                }
              : {}),
          },
        ],
      }, {
        "set-cookie": `__Host-prospector-csrf=${String(state.token).padStart(43, "a")}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict`,
      });
    }

    if (
      url.pathname === "/api/capability-probe" &&
      options.method === "POST"
    ) {
      if (
        headers.get("origin") !== baseUrl.origin ||
        headers.get("sec-fetch-site") !== "same-origin"
      ) {
        return json(403, { error: "foreign_origin" });
      }
      const token = headers.get("cookie")?.match(/__Host-prospector-csrf=([A-Za-z0-9_-]{43})/)?.[1];
      if (
        !token ||
        state.usedTokens.has(token)
      ) {
        return json(403, { error: "invalid_csrf_token" });
      }
      state.usedTokens.add(token);
      if (options.body === "{") {
        return json(400, { error: "invalid_json" });
      }
      state.proofRecorded = true;
      return json(200, {
        ok: true,
        proof: {
          status: "proven",
          probeId: PROBE_ID,
          checkedAt: CHECKED_AT,
          evidenceReference: EVIDENCE_REFERENCE,
          digest: "a".repeat(64),
          steps: {
            put: true,
            read: true,
            digest: true,
            delete: true,
            absence: true,
          },
          reason:
            "The fixed write, read, digest, delete, and absence proof passed.",
        },
      });
    }

    return json(404, { error: "not_found" });
  };

  try {
    await verifyDeniedRead(baseUrl);
    const initial = await readOwnerState(baseUrl, {
      cookie: "session=controlled-test",
    });
    await runOwnerProof(
      baseUrl,
      { cookie: "session=controlled-test" },
      initial.csrfCookie,
    );
    assert.equal(state.proofRecorded, true);
  } finally {
    globalThis.fetch = fetchBeforeTest;
  }
});

test("hosted proof harness rejects untrusted destinations and identity headers", async () => {
  assert.throws(
    () => normalizedBaseUrl("https://invalid.example"),
    /untrusted_base_url/u,
  );

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "prospector-proof-test-"),
  );
  try {
    const headersFile = join(temporaryDirectory, "session.json");
    await writeFile(
      headersFile,
      JSON.stringify({
        "oai-authenticated-user-email": "spoofed@example.test",
      }),
      { mode: 0o600 },
    );
    await assert.rejects(
      loadSessionHeaders(headersFile),
      /invalid_authenticated_session_transport/u,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
});

function json(status, value, headers = {}) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
