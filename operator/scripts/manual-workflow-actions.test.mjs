import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function compiled(path, require, extra = "") {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code + extra, { exports, require, URL, URLSearchParams, Date, console });
  return exports;
}
function harness(
  request = new Request("http://127.0.0.1:8080/", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  }),
) {
  const counts = { provider: 0, db: 0, hunt: 0, public: 0, approve: 0, handoff: 0 };
  const isolation = compiled("../src/lib/auth/isolation.server.ts", () => ({
    getRequest: () => request,
  }));
  let auth;
  compiled("../src/lib/auth/middleware.ts", (name) => {
    if (name === "@tanstack/react-start")
      return {
        createMiddleware: () => ({
          client() {
            return this;
          },
          server(fn) {
            auth = fn;
            return fn;
          },
        }),
      };
    if (name === "./isolation.server") return isolation;
    if (name === "./verify.server") return { requireUserId: async () => "fixture-owner" };
    throw Error(`Unexpected auth import ${name}`);
  });
  const sql = async (strings) => {
    counts.db++;
    return String(strings[0]).includes("select id, state")
      ? [
          {
            id: "r",
            state: "approved",
            account_name: "Fictional Works",
            evidence_url: "https://fictional.example/evidence",
          },
        ]
      : [];
  };
  const forbidden = () => {
    counts.provider++;
    throw Error("Provider seam must not be reached");
  };
  const fns = compiled(
    "../src/lib/server/fns.ts",
    (name) => {
      if (name === "node:crypto")
        return {
          createHash: () => ({
            update() {
              return this;
            },
            digest: () => "digest",
          }),
        };
      if (name === "@tanstack/react-start")
        return {
          createServerFn: () => {
            let validate = (v) => v,
              middleware = [];
            return {
              middleware(v) {
                middleware = v;
                return this;
              },
              validator(v) {
                validate = v;
                return this;
              },
              handler(fn) {
                return async (data) => {
                  assert.equal(middleware.length, 1);
                  let context;
                  await middleware[0]({
                    context: {},
                    next: ({ context: c }) => {
                      context = c;
                    },
                  });
                  return fn({ context, data: validate(data) });
                };
              },
            };
          },
        };
      if (name === "@/lib/auth/middleware") return { authMiddleware: auth };
      if (name === "@/lib/db") return { getSql: async () => sql };
      if (name === "@/lib/server/seed")
        return { ensureWorkspace: async () => {}, idFor: () => "fixture-id" };
      if (name === "@/lib/server/reveal")
        return {
          revealFromPages: async () => {
            counts.public++;
            return [];
          },
        };
      if (name === "@/lib/server/manual-workflow")
        return {
          handoffManualMessage: async () => {
            counts.handoff++;
            return null;
          },
          approveManualMessage: async () => {
            counts.approve++;
          },
        };
      if (name === "@/lib/domain/catalog") return { INTERVIEW: [] };
      return new Proxy({}, { get: () => forbidden });
    },
    "\nloadWorkspace = async () => ({fixture:true}); startHunt = async () => { exports.__counts.hunt++; return {fixture:true}; };",
  );
  fns.__counts = counts;
  return { fns, counts };
}
test("loading server module is inert even with throwing provider adapters", () => {
  const { counts } = harness();
  assert.deepEqual(counts, { provider: 0, db: 0, hunt: 0, public: 0, approve: 0, handoff: 0 });
});
test("legacy, absent, or false morning action is denied; explicit action invokes once", async () => {
  const { fns, counts } = harness();
  for (const v of [undefined, {}, { manual: false }]) await assert.rejects(fns.tickSchedule(v));
  assert.equal(counts.hunt, 0);
  await fns.tickSchedule({ manual: true });
  assert.equal(counts.hunt, 1);
  assert.equal(counts.provider, 0);
});
test("handoff wrapper returns only its one-time helper result without SMTP or AI", async () => {
  const { fns, counts } = harness();
  const result = await fns.openInGmail({ messageId: "m", expectedDigest: "digest" });
  assert.equal(result.url, null);
  assert.equal(counts.handoff, 1);
  assert.equal(counts.provider, 0);
});
test("approval requires literal acknowledgement and the displayed digest", async () => {
  const { fns, counts } = harness();
  await assert.rejects(
    fns.approveMessage({ messageId: "m", expectedDigest: "digest", acknowledged: "true" }),
  );
  assert.equal(counts.approve, 0);
  await fns.approveMessage({ messageId: "m", expectedDigest: "digest", acknowledged: true });
  assert.equal(counts.approve, 1);
});
test("public reveal never selects a paid provider or reads a paid credential", async () => {
  const { fns, counts } = harness();
  await fns.requestEnrichmentGrant({ prospectId: "r", reason: "Fictional explicit public lookup" });
  assert.equal(counts.public, 1);
  assert.equal(counts.provider, 0);
});
for (const site of ["cross-site", "same-site"])
  test(`${site} foreign-origin mutations are denied before database/provider access`, async () => {
    const request = new Request("http://127.0.0.1:8080/", {
      method: "POST",
      headers: { origin: "https://foreign.example", "sec-fetch-site": site },
    });
    const { fns, counts } = harness(request);
    for (const name of ["openInGmail", "approveMessage", "tickSchedule", "requestEnrichmentGrant"])
      await assert.rejects(fns[name]({}), (e) => e.status === 403);
    assert.equal(counts.db, 0);
    assert.equal(counts.hunt, 0);
    assert.equal(counts.provider, 0);
  });
