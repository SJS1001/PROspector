import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { request as rawRequest } from "node:http";
import { once } from "node:events";
import { createServer as createPortProbe } from "node:net";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { enrollOwner, readLocalOwner, LOCAL_ORIGIN, OWNER_EMAIL } from "./local-owner.mjs";
import { acquireDatabaseLock, ensurePrivateDataDir } from "./local-data.mjs";

const password = "fictional-local-owner-password";
const fixtureTables = [
  "workspaces",
  "prospects",
  "contacts",
  "outreach_packages",
  "review_commands",
  "suppressions",
  "operator_secrets",
];
if (process.argv[2] === "fixture") {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
  });
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  const vault = await server.ssrLoadModule("/src/lib/server/vault.ts");
  const owner = readLocalOwner();
  try {
    const sql = await db.getSql();
    if (process.argv[3] === "seed") {
      await sql.transaction(async (tx) => {
        await tx`insert into workspaces (user_id, company_name, company_legal) values (${owner.id}, 'Fictional Foundation Ltd', 'Fictional Foundation Ltd')`;
        await tx`insert into prospects (id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('fixture-prospect',${owner.id},'Fictional Account','fixture-account','Fictional Target','fixture-target','fixture-offer',7,'qualified','approved','fixture-digest','fixture-assessment','{}','Fictional evidence','https://example.invalid',1,'2026-10-28')`;
        await tx`insert into contacts (id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence) values ('fixture-contact',${owner.id},'fixture-prospect','Fictional Person','Fictional Role','fictional','fixture@example.invalid','fixture','fixture')`;
        await tx`insert into outreach_packages (id,user_id,prospect_id,status,subject,body,digest,approved_at) values ('fixture-package',${owner.id},'fixture-prospect','approved','Fictional subject','Fictional body','fixture-package-digest',now())`;
        await tx`insert into review_commands (id,user_id,command_key,operation_digest,prospect_id,decision,reason) values ('fixture-review',${owner.id},'fixture-command','fixture-digest','fixture-prospect','approve','Fictional reason')`;
        await tx`insert into suppressions (id,user_id,kind,value,reason) values ('fixture-suppression',${owner.id},'email','fixture@example.invalid','Fictional suppression')`;
        await tx`insert into operator_secrets (user_id,name,value) values (${owner.id},'llm_key',${vault.sealSecret("fictional-provider-secret")})`;
      });
    }
    const snapshots = [];
    for (const table of fixtureTables)
      snapshots.push(await sql.query(`select * from ${table} order by 1`));
    const digest = createHash("sha256").update(JSON.stringify(snapshots)).digest("hex");
    const snapshotPath = join(process.env.OPERATOR_DATA_DIR, "fixture.digest");
    if (process.argv[3] === "seed") writeFileSync(snapshotPath, digest, { mode: 0o600 });
    else
      assert.equal(
        digest,
        readFileSync(snapshotPath, "utf8"),
        "workspace and approval/history/suppression data unchanged",
      );
    const [stored] =
      await sql`select value from operator_secrets where user_id = ${owner.id} and name = 'llm_key'`;
    const stubProvider = (key) =>
      key === "fictional-provider-secret" ? { ok: true } : { ok: false };
    assert.deepEqual(stubProvider(vault.openSecret(stored.value)), { ok: true });
  } finally {
    await db.closeDatabase();
    await server.close();
  }
} else {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "prospector-foundation-")));
  const prior = process.env.OPERATOR_DATA_DIR;
  process.env.OPERATOR_DATA_DIR = dir;
  const env = {
    ...process.env,
    OPERATOR_DATA_DIR: dir,
    DATABASE_URL: "",
    OPERATOR_ACCESS_MODE: "password",
    VITE_AUTH_ENABLED: "false",
  };
  let child;
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("stop timeout")), 10000);
        timer.unref();
      }),
    ]);
    child = undefined;
  }
  async function start(dev = false) {
    // Never mistake an already-running owner app for this disposable test server.
    const probe = createPortProbe();
    await new Promise((resolve, reject) => {
      probe.once("error", () => reject(new Error("Port 8080 is occupied. Stop the local app before running foundation tests.")));
      probe.listen(8080, "127.0.0.1", resolve);
    });
    await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    child = spawn(process.execPath, ["scripts/local-start.mjs", ...(dev ? ["dev"] : [])], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let diagnostic = "";
    child.stderr.on("data", (data) => {
      diagnostic += data;
    });
    child.stdout.resume();
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error(`Local start exited ${child.exitCode}: ${diagnostic.slice(0, 500)}`);
      try {
        const r = await fetch(`${LOCAL_ORIGIN}/api/auth/get-session`, {
          signal: AbortSignal.timeout(2000),
        });
        if (r.status === 200) return;
      } catch {
        /* bounded readiness */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Local server readiness timeout: " + diagnostic.slice(0, 1600));
  }
  const request = (path, { method = "GET", cookie, origin, body, extra = {} } = {}) =>
    fetch(`${LOCAL_ORIGIN}${path}`, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(origin ? { origin } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
    });
  const post = (path, body, cookie, origin = LOCAL_ORIGIN) =>
    request(path, { method: "POST", origin, body, cookie });
  const fixture = (mode) => {
    const result = spawnSync(process.execPath, [import.meta.filename, "fixture", mode], {
      env: { ...env, NODE_TEST_CONTEXT: "" },
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 0, result.stderr.slice(0, 1000));
  };
  await test("foundation HTTP and recovery lifecycle", async () => {
    try {
      let owner;
      await test("CLI-only enrollment keeps private files and refuses reenrollment, running reset, and checkout storage", async () => {
        owner = await enrollOwner(password);
        assert.equal(statSync(join(dir, "owner.json")).mode & 0o777, 0o600);
        assert.equal(statSync(join(dir, "operator.vault")).mode & 0o777, 0o600);
        await assert.rejects(enrollOwner(password));
        const release = acquireDatabaseLock();
        try {
          await assert.rejects(enrollOwner(password, true), /locked/);
        } finally {
          release();
        }
        process.env.OPERATOR_DATA_DIR = join(process.cwd(), "public", "private-fixture");
        try {
          assert.throws(ensurePrivateDataDir, /outside the checkout/);
        } finally {
          process.env.OPERATOR_DATA_DIR = dir;
        }
      });
      fixture("seed");
      await start();
      let cookie;
      await test("real HTTP owner login succeeds; anonymous, wrong password, bearer and gate headers do not authenticate", async () => {
        assert.equal(await (await request("/api/auth/get-session")).json(), null);
        assert.equal(
          await (
            await request("/api/auth/get-session", {
              extra: { authorization: "Bearer fictional", "x-grok-identity-token": "fictional" },
            })
          ).json(),
          null,
        );
        assert.equal(
          (
            await post("/api/auth/sign-in/email", {
              email: OWNER_EMAIL,
              password: "wrong-fictional-password",
            })
          ).status,
          401,
        );
        const result = await post("/api/auth/sign-in/email", { email: OWNER_EMAIL, password });
        assert.equal(result.status, 200);
        const cookies = result.headers.getSetCookie();
        const session = cookies.find((value) =>
          value.startsWith("prospector-owner.session_token="),
        );
        assert.ok(session && /HttpOnly/i.test(session) && /SameSite=Strict/i.test(session));
        cookie = session.split(";", 1)[0];
        assert.equal(
          (await (await request("/api/auth/get-session", { cookie })).json()).user.id,
          owner.id,
        );
      });
      await test("foreign/missing Origin, spoofed Host and proxy headers, signup and OAuth requests reject", async () => {
        for (const origin of ["https://example.invalid", undefined]) {
          const r = await request("/api/auth/sign-out", {
            method: "POST",
            cookie,
            origin,
            body: {},
          });
          assert.equal(r.status, 403);
        }
        for (const extra of [
          { host: "example.invalid" },
          { "x-forwarded-host": "127.0.0.1:8080" },
          { "sec-fetch-site": "cross-site" },
        ]) {
          const status = await new Promise((resolve, reject) => {
            const req = rawRequest(
              `${LOCAL_ORIGIN}/api/auth/get-session`,
              { headers: { cookie, ...extra } },
              (res) => {
                res.resume();
                resolve(res.statusCode);
              },
            );
            req.on("error", reject);
            req.end();
          });
          assert.equal(status, 403, JSON.stringify(Object.keys(extra)));
        }
        for (const path of [
          "/api/auth/sign-up/email",
          "/api/auth/sign-in/oauth2",
          "/api/auth/change-password",
        ])
          assert.equal((await post(path, {}, cookie)).status, 404);
        assert.equal(
          (
            await request("/api/auth/sign-out", {
              method: "POST",
              origin: LOCAL_ORIGIN,
              cookie,
              extra: { "content-type": "application/x-www-form-urlencoded" },
            })
          ).status,
          415,
        );
      });
      await test("real protected workspace read denies anonymous access and foreign-origin mutation cannot alter state", async () => {
        const files = readdirSync(".output/server/_ssr");
        const source = readFileSync(
          join(
            ".output/server/_ssr",
            files.find((name) => /^fns-.*\.mjs$/.test(name)),
          ),
          "utf8",
        );
        const id = (name) => source.match(new RegExp(`id: "([a-f0-9]+)",\\s*name: "${name}"`))[1];
        const denied = await request(`/_serverFn/${id("getWorkspace")}`, {
          origin: LOCAL_ORIGIN,
          extra: { "x-tsr-serverFn": "true" },
        });
        assert.equal(denied.status, 401);
        const allowed = await request(`/_serverFn/${id("getWorkspace")}`, {
          origin: LOCAL_ORIGIN,
          cookie,
          extra: { "x-tsr-serverFn": "true" },
        });
        assert.equal(allowed.status, 200);
        assert.ok((await allowed.text()).includes("Fictional Foundation Ltd"));
        const deniedMutation = await request(`/_serverFn/${id("proposeAnswer")}`, {
          method: "POST",
          origin: "https://example.invalid",
          cookie,
          body: { data: { questionId: "fixture", answer: "fictional" } },
        });
        assert.equal(deniedMutation.status, 403);
      });
      await stop();
      fixture("read");
      await start();
      await test("separate server restart retains owner session and complete fictional workspace; logout revokes persisted session", async () => {
        assert.equal(
          (await (await request("/api/auth/get-session", { cookie })).json()).user.id,
          owner.id,
        );
        assert.equal((await post("/api/auth/sign-out", {}, cookie)).status, 200);
        assert.equal(await (await request("/api/auth/get-session", { cookie })).json(), null);
        const fresh = await post("/api/auth/sign-in/email", { email: OWNER_EMAIL, password });
        assert.equal(fresh.status, 200);
        cookie = fresh.headers
          .getSetCookie()
          .find((value) => value.startsWith("prospector-owner.session_token="))
          .split(";", 1)[0];
      });
      await stop();
      fixture("read");
      await test("password recovery retains owner ID and vault lineage while replacing signing configuration", async () => {
        const vaultBefore = createHash("sha256")
          .update(readFileSync(join(dir, "operator.vault")))
          .digest("hex");
        const updated = await enrollOwner("fictional-replacement-password", true);
        assert.equal(updated.id, owner.id);
        assert.notEqual(updated.authSecret, owner.authSecret);
        assert.equal(
          createHash("sha256")
            .update(readFileSync(join(dir, "operator.vault")))
            .digest("hex"),
          vaultBefore,
        );
      });
      await start();
      await test("old session fails after password reset and replacement password works", async () => {
        assert.equal(await (await request("/api/auth/get-session", { cookie })).json(), null);
        assert.equal(
          (await post("/api/auth/sign-in/email", { email: OWNER_EMAIL, password })).status,
          401,
        );
        assert.equal(
          (
            await post("/api/auth/sign-in/email", {
              email: OWNER_EMAIL,
              password: "fictional-replacement-password",
            })
          ).status,
          200,
        );
      });
      await stop();
      fixture("read");
      assert.equal(existsSync(join(dir, ".database.lock")), false);
      await start(true);
      await test("documented dev startup serves tracked login and public manifest with private files denied", async () => {
        const page = await request("/login");
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.ok(html.includes("PROspector"));
        const manifest = await request("/manifest.webmanifest");
        assert.equal(manifest.status, 200);
        assert.equal((await manifest.json()).name, "PROspector local operator");
        for (const file of ["owner.json", "operator.vault"]) {
          const response = await request(`/@fs${dir}/${file}`);
          assert.equal(response.status, 403);
        }
      });
      await test("development password endpoint enforces rate limiting", async () => {
        const statuses = [];
        for (let i = 0; i < 4; i++)
          statuses.push(
            (
              await post("/api/auth/sign-in/email", {
                email: OWNER_EMAIL,
                password: "fictional-wrong-password",
              })
            ).status,
          );
        assert.deepEqual(statuses, [401, 401, 401, 429]);
      });
      await stop();
    } finally {
      await stop();
      if (prior === undefined) delete process.env.OPERATOR_DATA_DIR;
      else process.env.OPERATOR_DATA_DIR = prior;
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
