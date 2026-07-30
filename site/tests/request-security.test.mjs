import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("consequential mutations require same-origin metadata, intent, JSON, and bounded bytes", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const security = await vite.ssrLoadModule(
      new URL("../domain/request-security.ts", import.meta.url).pathname,
    );
    const valid = request({ body: JSON.stringify({ action: "bootstrap" }) });
    assert.equal(
      security.validateSameOriginMutation(valid, "interview-mutation", 8192),
      null,
    );
    assert.deepEqual(await security.readBoundedJson(valid, 8192), {
      action: "bootstrap",
    });

    assert.deepEqual(
      security.validateSameOriginMutation(
        request({ origin: "https://attacker.example" }),
        "interview-mutation",
        8192,
      ),
      { error: "foreign_origin", status: 403 },
    );
    assert.deepEqual(
      security.validateSameOriginMutation(
        request({ fetchSite: "cross-site" }),
        "interview-mutation",
        8192,
      ),
      { error: "foreign_origin", status: 403 },
    );
    assert.deepEqual(
      security.validateSameOriginMutation(
        request({ intent: "wrong-intent" }),
        "interview-mutation",
        8192,
      ),
      { error: "missing_intent", status: 403 },
    );
    assert.deepEqual(
      security.validateSameOriginMutation(
        request({ contentType: "text/plain" }),
        "interview-mutation",
        8192,
      ),
      { error: "unsupported_content_type", status: 415 },
    );
    await assert.rejects(
      security.readBoundedJson(request({ body: `{"x":"${"a".repeat(9000)}"}` }), 8192),
      (error) => error?.status === 413,
    );
  } finally {
    await vite.close();
  }
});

function request({
  origin = "https://prospector.example",
  fetchSite = "same-origin",
  intent = "interview-mutation",
  contentType = "application/json",
  body = "{}",
} = {}) {
  return new Request("https://prospector.example/api/interview", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": fetchSite,
      "x-prospector-intent": intent,
      "content-type": contentType,
    },
    body,
  });
}
