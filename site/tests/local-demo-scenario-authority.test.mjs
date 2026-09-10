import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const admissionUrl = new URL("../app/local-demo/_admission.ts", import.meta.url);
const handlerUrl = new URL("../app/api/local-demo/composition/_handler.ts", import.meta.url);
const origin = "http://127.0.0.1:8788";

test("scenario authority requires fresh CSRF and exact current cryptographic workspace revision", async () => {
  globalThis.__localDemoBindings = { OWNER_SUBJECT_PEPPER: "local-demo-owner-pepper-for-test-only", PILOT_OWNER_EMAIL: "local-owner@prospector.invalid", TRUSTED_IDENTITY_PROVIDER: "local-demo", LOCAL_DEMO: "1" };
  const vite = await createServer({ configFile: false, logLevel: "silent", plugins: [{ name: "workers", resolveId(id) { if (id === "cloudflare:workers") return "\0workers"; if (id === "next/headers") return "\0headers"; }, load(id) { if (id === "\0workers") return "export const env=new Proxy({}, {get:(_,key)=>globalThis.__localDemoBindings[key]})"; if (id === "\0headers") return "export async function headers(){return new Headers({host:'127.0.0.1:8788'})}"; } }] });
  const originalNow = Date.now;
  try {
    const { admitLocalDemoScenarioRequest } = await vite.ssrLoadModule(admissionUrl.pathname);
    const { handleLocalDemoScenario } = await vite.ssrLoadModule(handlerUrl.pathname);
    const dispatch = async (request) => { const admission = await admitLocalDemoScenarioRequest(request); return admission instanceof Response || !admission ? admission : handleLocalDemoScenario(admission); };
    const initial = await dispatch(new Request(`${origin}/api/local-demo/composition`));
    assert.equal(initial.status, 200);
    const first = await initial.json();
    const firstCookie = cookies(initial);
    assert.equal(first.revision, 0);
    assert.match(first.authority, /^[^.]+\.[A-Za-z0-9_-]+$/u);

    const command = (body, cookie = firstCookie) => new Request(`${origin}/api/local-demo/composition`, { method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const valid = { action: "advance", workspaceId: first.workspaceId, expectedRevision: first.revision, authority: first.authority };
    assert.equal((await dispatch(command(valid, ""))).status, 403, "missing CSRF");
    const foreignCsrf = firstCookie.replace(/prospector-local-scenario-csrf=[^;]+/u, "prospector-local-scenario-csrf=foreign-token");
    assert.equal((await dispatch(command(valid, foreignCsrf))).status, 403, "foreign CSRF");
    assert.equal((await dispatch(command({ ...valid, workspaceId: "other-workspace" }))).status, 409, "cross-workspace");
    const advanced = await dispatch(command(valid));
    assert.equal(advanced.status, 200);
    const second = await advanced.json();
    assert.equal(second.revision, 1);
    assert.equal((await dispatch(command(valid))).status, 403, "consumed CSRF is stale");

    const refreshed = await dispatch(new Request(`${origin}/api/local-demo/composition`, { headers: { cookie: cookies(advanced) } }));
    const refreshedBody = await refreshed.json();
    assert.equal(refreshedBody.revision, 1);
    const staleAuthority = { ...valid, expectedRevision: 0 };
    assert.equal((await dispatch(command(staleAuthority, cookies(refreshed)))).status, 409, "stale authority revision");

    const invalidHmacSeed = await dispatch(new Request(`${origin}/api/local-demo/composition`, { headers: { cookie: cookies(advanced) } }));
    const invalidHmacBody = await invalidHmacSeed.json();
    const invalidHmac = { action: "advance", workspaceId: invalidHmacBody.workspaceId, expectedRevision: invalidHmacBody.revision, authority: `${invalidHmacBody.authority.slice(0, -1)}${invalidHmacBody.authority.endsWith("a") ? "b" : "a"}` };
    assert.equal((await dispatch(command(invalidHmac, cookies(invalidHmacSeed)))).status, 409, "invalid HMAC");

    const sessionOne = await dispatch(new Request(`${origin}/api/local-demo/composition`));
    const sessionOneBody = await sessionOne.json();
    const sessionTwo = await dispatch(new Request(`${origin}/api/local-demo/composition`));
    const sessionTwoBody = await sessionTwo.json();
    assert.equal((await dispatch(command({ action: "advance", workspaceId: sessionTwoBody.workspaceId, expectedRevision: sessionTwoBody.revision, authority: sessionOneBody.authority }, cookies(sessionTwo)))).status, 409, "authority from another session");

    const raceSeed = await dispatch(new Request(`${origin}/api/local-demo/composition`));
    const raceBody = await raceSeed.json();
    const raceCommand = { action: "advance", workspaceId: raceBody.workspaceId, expectedRevision: raceBody.revision, authority: raceBody.authority };
    const raced = await Promise.all([dispatch(command(raceCommand, cookies(raceSeed))), dispatch(command(raceCommand, cookies(raceSeed)))]);
    assert.deepEqual(raced.map((response) => response.status).sort(), [200, 403], "one CSRF token advances exactly once under concurrency");

    let now = 1_800_000_000_000;
    Date.now = () => now;
    const expiring = await dispatch(new Request(`${origin}/api/local-demo/composition`));
    const expiringBody = await expiring.json();
    const expiringCookies = cookies(expiring);
    const authorityPayload = JSON.parse(Buffer.from(expiringBody.authority.split(".")[0], "base64url").toString("utf8"));
    assert.equal(authorityPayload.expiresAt - now, 15 * 60_000, "authority and session use an exact 15-minute lifetime");
    now += 15 * 60_000;
    const replacement = await dispatch(new Request(`${origin}/api/local-demo/composition`, { headers: { cookie: expiringCookies } }));
    await replacement.json();
    assert.notEqual(cookieValue(cookies(replacement), "prospector-local-scenario"), cookieValue(expiringCookies, "prospector-local-scenario"), "an expired session cookie cannot mint renewed authority");
    const expiredCommand = { action: "advance", workspaceId: expiringBody.workspaceId, expectedRevision: expiringBody.revision, authority: expiringBody.authority };
    assert.equal((await dispatch(command(expiredCommand, expiringCookies))).status, 403, "expired session authority and CSRF remain rejected after replacement");
  } finally { Date.now = originalNow; await vite.close(); delete globalThis.__localDemoBindings; }
});

function cookies(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values.flatMap((value) => value.split(/,(?=\s*prospector-local-)/u)).map((value) => value.trim().split(";", 1)[0]).join("; ");
}
function cookieValue(header, name) { return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1); }
