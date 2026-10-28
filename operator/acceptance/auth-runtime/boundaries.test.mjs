import { defaultSerovalPlugins } from "@tanstack/router-core";
import { toJSON, fromCrossJSON } from "seroval";
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";
import { request as httpRequest } from "node:http";
import { enrollOwner, OWNER_EMAIL, LOCAL_ORIGIN } from "../../scripts/local-owner.mjs";
import { assertLoopbackListener } from "./listener-proof.mjs";
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "production",
  DATABASE_URL: "",
};
const password = "fictional-auth-runtime-owner-password",
  secrets = [password, "fictional-auth-runtime-provider-sentinel"];
let child,
  logs = "";
const safe = (text) =>
  assert.ok(!secrets.some((s) => text.includes(s)), "secret absent (values withheld)");
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, "exit");
  // The launcher forwards this signal to its server child. Sending it to the
  // entire group would deliver it twice to the server; retain group kill below
  // only as the bounded failure cleanup.
  child.kill("SIGTERM");
  let timer;
  try {
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          process.kill(-child.pid, "SIGKILL");
          reject(new Error("shutdown timeout"));
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function request(path, { method = "GET", headers = {}, body } = {}) {
  if (path.startsWith("/_serverFn/")) headers = { "x-tsr-serverFn": "true", ...headers };
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      LOCAL_ORIGIN + path,
      { method, headers, timeout: 10000, agent: false },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          try {
            if (res.statusCode >= 400) safe(text);
            resolve({ status: res.statusCode, headers: res.headers, text });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
const post = (path, data, headers = {}) =>
  request(path, {
    method: "POST",
    headers: { origin: LOCAL_ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(path.startsWith("/_serverFn/") ? toJSON(data) : data),
  });
function snapshot(mode) {
  const r = spawnSync(process.execPath, ["acceptance/auth-runtime/fixture.mjs", mode], {
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  safe(r.stdout + r.stderr);
  assert.equal(r.status, 0, "offline fixture succeeds (diagnostics withheld)");
  const match = r.stdout.match(/WORKSPACE_DIGEST=([a-f0-9]{64})/);
  assert.ok(match);
  return match[1];
}
async function start() {
  child = spawn(process.execPath, ["scripts/local-start.mjs"], {
    env: {
      ...env,
      NODE_OPTIONS: `--import=${resolve("acceptance/auth-runtime/deny-outbound.mjs")}`,
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (c) => (logs += c));
  for (let i = 0; i < 200; i++) {
    assert.equal(child.exitCode, null, "runtime alive");
    try {
      if ((await request("/api/auth/get-session")).status === 200) return;
    } catch {
      /* bounded readiness */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("readiness timeout; diagnostics withheld");
}
await test("built HTTP owner and mutation boundaries", { timeout: 180000 }, async (t) => {
  assert.ok(["linux", "darwin"].includes(process.platform), "unsupported listener-proof platform");
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(8080, "127.0.0.1", () => probe.close(resolve));
  });
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "prospector-auth-runtime-"))),
    prior = process.env.OPERATOR_DATA_DIR;
  env.OPERATOR_DATA_DIR = dir;
  env.AUTH_RUNTIME_ATTEMPTS = join(dir, "outbound-attempts");
  process.env.OPERATOR_DATA_DIR = dir;
  try {
    const owner = await enrollOwner(password);
    secrets.push(
      owner.authSecret,
      owner.passwordHash,
      readFileSync(join(dir, "operator.vault"), "utf8").trim(),
    );
    await t.test("outbound socket fence self-check", () => {
      const probe = spawnSync(
        process.execPath,
        [
          "--import",
          resolve("acceptance/auth-runtime/deny-outbound.mjs"),
          "--input-type=module",
          "-e",
          "import net from 'node:net';try{net.connect(443,'example.invalid');process.exit(1)}catch(e){process.exit(e.message==='AUTH_RUNTIME_OUTBOUND_DENIED'?0:2)}",
        ],
        { env, timeout: 5000 },
      );
      assert.equal(probe.status, 0);
      assert.equal(readFileSync(env.AUTH_RUNTIME_ATTEMPTS, "utf8"), "denied\n");
      rmSync(env.AUTH_RUNTIME_ATTEMPTS);
    });
    snapshot("seed");
    const secondCookie = readFileSync(join(dir, "second-cookie"), "utf8");
    secrets.push(secondCookie, secondCookie.slice(secondCookie.indexOf("=") + 1));
    await start();
    const file = readdirSync(".output/server/_ssr").find((n) => /^fns-.*\.mjs$/.test(n));
    const source = readFileSync(join(".output/server/_ssr", file), "utf8");
    const route = (name) => {
      const m = source.match(new RegExp(`id: "([a-f0-9]+)",\\s*name: "${name}"`));
      assert.ok(m, "built function " + name);
      return "/_serverFn/" + m[1];
    };
    const read = route("getWorkspace"),
      mutate = route("proposeAnswer"),
      archive = route("exportArchive"),
      data = { data: { questionId: "company.legal_name", answer: "Fictional overwrite" } };
    let cookie;
    await t.test("real IPv4 loopback listener", () => {
      assertLoopbackListener(child.pid);
    });
    await t.test("owner admitted; anonymous and second-owner refused", async () => {
      assert.equal(
        (await request(read, { headers: { origin: LOCAL_ORIGIN, "x-tsr-serverFn": "true" } }))
          .status,
        401,
      );
      assert.equal((await post(mutate, data)).status, 401);
      assert.equal(
        (await post("/api/auth/sign-up/email", { email: "second-owner@example.invalid", password }))
          .status,
        404,
      );
      assert.equal(
        (await post("/api/auth/sign-in/email", { email: "second-owner@example.invalid", password }))
          .status,
        401,
      );
      const login = await post("/api/auth/sign-in/email", { email: OWNER_EMAIL, password });
      assert.equal(login.status, 200);
      const raw = login.headers["set-cookie"]?.find((c) =>
        c.startsWith("prospector-owner.session_token="),
      );
      assert.ok(raw, "session cookie issued");
      assert.ok(/HttpOnly/i.test(raw) && /SameSite=Strict/i.test(raw) && /Path=\//i.test(raw));
      cookie = raw.split(";")[0];
      secrets.push(
        cookie,
        cookie.slice(cookie.indexOf("=") + 1),
        decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).split(".")[0],
      );
      assert.ok(!/;\s*Domain=/i.test(raw));
      assert.equal(
        JSON.parse((await request("/api/auth/get-session", { headers: { cookie } })).text).user.id,
        owner.id,
      );
      assert.equal(
        (
          await request(read, {
            headers: { cookie, origin: LOCAL_ORIGIN, "x-tsr-serverFn": "true" },
          })
        ).status,
        200,
      );
    });
    await t.test("genuine owner mutation control", async () => {
      const result = await post(
        mutate,
        { data: { questionId: "company.legal_name", answer: "Fictional Quarry verified" } },
        { cookie },
      );
      assert.equal(result.status, 200);
      assert.ok(result.text.includes("Fictional Quarry verified"));
    });
    await stop();
    const before = snapshot("snapshot");
    await start();
    await t.test("valid signed non-owner session fails owner admission", async () => {
      assert.equal((await post(mutate, data)).status, 401);
      assert.equal(
        JSON.parse(
          (await request("/api/auth/get-session", { headers: { cookie: secondCookie } })).text,
        ).user.id,
        readFileSync(join(dir, "second-id"), "utf8"),
      );
      assert.equal(
        (await request(read, { headers: { cookie: secondCookie, origin: LOCAL_ORIGIN } })).status,
        401,
      );
      assert.equal((await post(mutate, data, { cookie: secondCookie })).status, 401);
    });
    await t.test("expired signed session fails closed", async () => {
      const expired = readFileSync(join(dir, "expired-cookie"), "utf8");
      secrets.push(
        expired,
        decodeURIComponent(expired.slice(expired.indexOf("=") + 1)).split(".")[0],
      );
      assert.equal(
        (await request("/api/auth/get-session", { headers: { cookie: expired } })).text,
        "null",
      );
      assert.equal((await post(mutate, data, { cookie: expired })).status, 401);
    });
    await t.test("Host/Origin/proxy/fetch-metadata/referrer matrix denies mutations", async () => {
      const cases = [
        { host: "evil.example" },
        { host: "localhost:8080" },
        { host: "127.0.0.1:8081" },
        { origin: "https://evil.example" },
        { origin: "null" },
        { origin: undefined },
        { "sec-fetch-site": "cross-site" },
        { "sec-fetch-site": "same-site" },
        { forwarded: 'for=127.0.0.1;host="127.0.0.1:8080";proto=http' },
        { "x-forwarded-host": "127.0.0.1:8080" },
        { "x-forwarded-proto": "http" },
        { origin: undefined, referer: LOCAL_ORIGIN + "/knowledge" },
        { origin: undefined, referer: "https://evil.example/" },
      ];
      for (const extra of cases) {
        const headers = {
          cookie,
          origin: LOCAL_ORIGIN,
          "content-type": "application/json",
          ...extra,
        };
        for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
        for (const path of [mutate, archive, "/api/auth/sign-out"])
          assert.equal(
            (await request(path, { method: "POST", headers, body: JSON.stringify(toJSON(data)) }))
              .status,
            403,
            "boundary case " + JSON.stringify(extra),
          );
      }
      // Production uses exact Origin as CSRF admission; no synchronizer token exists.
      assert.equal(
        (
          await post(mutate, data, {
            cookie,
            origin: "https://evil.example",
            "x-csrf-token": "fictional",
          })
        ).status,
        403,
      );
      assert.equal(
        JSON.parse((await request("/api/auth/get-session", { headers: { cookie } })).text).user.id,
        owner.id,
      );
    });
    await t.test("malformed bodies, disabled auth routes, tampered sessions", async () => {
      for (const [body, status] of [
        ["{", 400],
        ["x".repeat(4097), 413],
        ["null", 401],
      ])
        assert.equal(
          (
            await request("/api/auth/sign-in/email", {
              method: "POST",
              headers: { origin: LOCAL_ORIGIN, "content-type": "application/json" },
              body,
            })
          ).status,
          status,
        );
      assert.equal(
        (
          await request("/api/auth/sign-out", {
            method: "POST",
            headers: { cookie, origin: LOCAL_ORIGIN, "content-type": "text/plain" },
            body: "{}",
          })
        ).status,
        415,
      );
      for (const path of [
        "sign-up/email",
        "change-password",
        "request-password-reset",
        "sign-in/oauth2",
      ])
        assert.equal((await post("/api/auth/" + path, {}, { cookie })).status, 404);
      for (const value of [
        null,
        {},
        { questionId: "company.legal_name", answer: 4 },
        { questionId: "company.legal_name", answer: "" },
      ]) {
        const result = await post(mutate, { data: value }, { cookie });
        safe(result.text);
        const decoded = fromCrossJSON(JSON.parse(result.text), {
          plugins: defaultSerovalPlugins,
        });
        assert.ok(
          decoded instanceof Error || decoded?.error instanceof Error,
          "RPC malformed input produces error, never success",
        );
      }
      assert.equal((await post(mutate, data, { cookie: cookie + "tampered" })).status, 401);
    });
    await t.test("export/errors/logs contain no credentials", async () => {
      const r = await post(archive, {}, { cookie, "sec-fetch-site": "same-origin" });
      assert.equal(r.status, 200);
      assert.ok(r.text.includes("Fictional Quarry"));
      assert.ok(!r.text.includes("operator_secrets") && !r.text.includes("passwordHash"));
      safe(r.text);
      safe(logs);
    });
    await stop();
    assert.equal(snapshot("snapshot"), before, "all non-auth public rows unchanged");
    await start();
    await t.test("persisted session and logout revocation", async () => {
      assert.equal(
        JSON.parse((await request("/api/auth/get-session", { headers: { cookie } })).text).user.id,
        owner.id,
      );
      assert.equal((await post("/api/auth/sign-out", {}, { cookie })).status, 200);
      assert.equal((await request("/api/auth/get-session", { headers: { cookie } })).text, "null");
      assert.equal((await post(mutate, data, { cookie })).status, 401);
    });
    await t.test("production password lockout includes correct password", async () => {
      const statuses = [];
      for (let i = 0; i < 12; i++) {
        const r = await post("/api/auth/sign-in/email", {
          email: OWNER_EMAIL,
          password: "fictional-incorrect-password",
        });
        statuses.push(r.status);
        if (r.status === 429) break;
      }
      assert.ok(statuses.includes(401) && statuses.includes(429));
      assert.equal(
        (await post("/api/auth/sign-in/email", { email: OWNER_EMAIL, password })).status,
        429,
      );
      const spoof = await post(
        "/api/auth/sign-in/email",
        { email: OWNER_EMAIL, password: "fictional-incorrect-password" },
        { "x-forwarded-for": "192.0.2.123" },
      );
      assert.equal(spoof.status, 429, "untrusted X-Forwarded-For must not bypass lockout");
      const spoofedIdentities = [
        { "X-Forwarded-For": "192.0.2.124" },
        { "x-forwarded-for": "2001:db8::123" },
        { "x-forwarded-for": "192.0.2.125, 127.0.0.1" },
        { "x-forwarded-for": "127.0.0.1, 192.0.2.126" },
        { "x-forwarded-for": "not-an-ip" },
        { "x-forwarded-for": "" },
        { "x-real-ip": "192.0.2.127" },
        { "cf-connecting-ip": "192.0.2.128" },
        { "x-client-ip": "192.0.2.129" },
        { "x-prospector-client-ip": "192.0.2.130" },
      ];
      for (const headers of spoofedIdentities) {
        for (const candidate of ["fictional-incorrect-password", password]) {
          const result = await post(
            "/api/auth/sign-in/email",
            { email: OWNER_EMAIL, password: candidate },
            headers,
          );
          assert.equal(result.status, 429, "client IP headers cannot change the lockout bucket");
          assert.equal(result.headers["set-cookie"], undefined, "lockout issues no session");
          assert.ok(Number(result.headers["x-retry-after"]) > 0, "bounded retry advertised");
        }
      }
    });
    await stop();
    await start();
    await t.test(
      "rotating forwarded IPs share the local login budget from the first attempt",
      async () => {
        const statuses = [];
        for (let i = 0; i < 4; i++) {
          const result = await post(
            "/api/auth/sign-in/email",
            { email: OWNER_EMAIL, password: "fictional-incorrect-password" },
            { "x-forwarded-for": `192.0.2.${150 + i}` },
          );
          statuses.push(result.status);
        }
        assert.deepEqual(statuses, [401, 401, 401, 429]);
        assert.equal(
          (await post("/api/auth/sign-in/email", { email: OWNER_EMAIL, password })).status,
          429,
          "header-free correct password shares the same lockout",
        );
      },
    );
    await stop();
    assert.equal(snapshot("snapshot"), before, "logout/lockout leave workspace unchanged");
    safe(logs);
    assert.equal(existsSync(env.AUTH_RUNTIME_ATTEMPTS), false, "zero outbound socket attempts");
  } finally {
    await stop();
    if (prior === undefined) delete process.env.OPERATOR_DATA_DIR;
    else process.env.OPERATOR_DATA_DIR = prior;
    rmSync(dir, { recursive: true, force: true });
  }
});
