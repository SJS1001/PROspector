import { toJSONAsync } from "seroval";
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, realpathSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = "http://127.0.0.1:8080";
const password = "fictional-durable-owner-password";
const fns = readFileSync(
  join(
    root,
    ".output/server/_ssr",
    readdirSync(join(root, ".output/server/_ssr")).find((x) => /^fns-.*\.mjs$/.test(x)),
  ),
  "utf8",
);
const id = (name) => {
  const match = fns.match(new RegExp(`id: "([a-f0-9]+)",\\s*name: "${name}"`));
  assert.ok(match, `Missing built function ${name}`);
  return match[1];
};
test(
  "real HTTP mutations survive full durable process restart without automatic provider work",
  { timeout: 180000 },
  async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "prospector-durable-")));
    const log = join(dir, "effects");
    // Allowlist environment: do not inherit provider credentials or remote DB settings.
    const env = {
      PATH: process.env.PATH,
      HOME: dir,
      OPERATOR_DATA_DIR: dir,
      DATABASE_URL: "",
      HOST: "127.0.0.1",
      PORT: "8080",
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: "8080",
      DURABLE_EFFECT_LOG: log,
    };
    let child,
      cookie,
      diagnostics = "";
    const effects = () =>
      existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
    const request = (path, { method = "GET", body, auth = true } = {}) =>
      fetch(origin + path, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          origin,
          ...(auth && cookie ? { cookie } : {}),
          "x-tsr-serverFn": "true",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function call(name, data) {
      const r = await request("/_serverFn/" + id(name), {
        method: data === undefined ? "GET" : "POST",
        body: data === undefined ? undefined : await toJSONAsync({ data }),
      });
      const text = await r.text();
      assert.equal(r.status, 200, `${name}: ${text.slice(0, 300)}`);
      return text;
    }
    async function login() {
      const r = await request("/api/auth/sign-in/email", {
        method: "POST",
        body: { email: "owner@localhost.invalid", password },
      });
      assert.equal(r.status, 200);
      cookie = r.headers
        .getSetCookie()
        .find((x) => x.startsWith("prospector-owner.session_token="))
        .split(";")[0];
    }
    async function start() {
      const priorEffects = effects();
      child = spawn(
        process.execPath,
        [
          "--import",
          resolve(root, "acceptance/durable-restart/runtime.mjs"),
          ".output/server/index.mjs",
        ],
        { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
      );
      diagnostics = "";
      child.stdout.resume();
      child.stderr.on("data", (x) => (diagnostics += x));
      for (let n = 0; n < 150; n++) {
        assert.equal(child.exitCode, null, diagnostics.slice(0, 500));
        let ready = false;
        try {
          ready = (await request("/api/auth/get-session", { auth: false })).status === 200;
        } catch {
          // Bounded readiness only; assertions below must never be swallowed.
        }
        if (ready) {
          assert.deepEqual(effects(), priorEffects, "each startup has no provider work");
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("Readiness timeout " + diagnostics.slice(0, 500));
    }
    async function stop() {
      if (!child) return;
      const p = child;
      const exited =
        p.exitCode === null && p.signalCode === null ? once(p, "exit") : Promise.resolve();
      p.kill("SIGTERM");
      let timer;
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("Stop timeout: " + diagnostics.slice(-1200))),
              20000,
            );
          }),
        ]);
      } catch (error) {
        p.kill("SIGKILL");
        await exited;
        throw error;
      } finally {
        clearTimeout(timer);
        child = undefined;
      }
      assert.equal(
        existsSync(join(dir, ".database.lock")),
        false,
        "clean shutdown releases DB lock",
      );
    }

    function snapshot(name) {
      const path = join(dir, name);
      const r = spawnSync(process.execPath, ["acceptance/durable-restart/snapshot.mjs", path], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 30000,
      });
      assert.equal(r.status, 0, r.stderr.slice(0, 500));
      return JSON.parse(readFileSync(path, "utf8"));
    }
    try {
      const setup = spawnSync(process.execPath, ["scripts/owner-setup.mjs"], {
        cwd: root,
        env,
        input: password + "\n",
        encoding: "utf8",
        timeout: 30000,
      });
      assert.equal(setup.status, 0, setup.stderr);
      await start();
      assert.deepEqual(effects(), []);
      assert.equal(await (await request("/api/auth/get-session", { auth: false })).json(), null);
      await login();
      const owner = (await (await request("/api/auth/get-session")).json()).user.id;
      await call("getWorkspace");
      await call("saveConnections", {
        llmKey: "FICTIONAL-DURABLE-KEY",
        llmProvider: "openai",
        scheduleEnabled: true,
      });
      // DTO decoding is unnecessary: question IDs are checked source metadata, while
      // semantic rows and returned digests are read from the stopped physical DB.
      const source = readFileSync(join(root, "src/lib/domain/catalog.ts"), "utf8");
      const questions = [
        ...new Set([...source.matchAll(/questionId: "([^"]+)"/g)].map((x) => x[1])),
      ];
      assert.ok(questions.length >= 16, "all checked interview questions located");
      for (const questionId of questions) {
        await call("proposeAnswer", {
          questionId,
          answer: "Fictional Quarry evidence for " + questionId,
        });
        await call("confirmAnswer", { questionId });
      }
      await call("activateProduct", {});
      await call("decideProposal", {
        proposalId: "fictional-proposal",
        decision: "explore",
        reason: "Fictional review",
      });
      await stop();
      let rows = snapshot("setup.json");
      const play = JSON.parse(rows.draft_plays[0]);
      await start();
      await call("confirmDraftPlay", {
        playId: play.id,
        audience: "Fictional Quarry",
        likelyBuyer: "Fictional Person",
        offer: "Fictional diagnostic",
      });
      await call("activateProfile", {});
      await call("reviewProspect", {
        prospectId: "fictional-prospect",
        assessmentId: "fictional-assessment",
        expectedRevision: 1,
        decision: "approve",
        reason: "Fictional review",
      });
      await call("requestEnrichmentGrant", {
        prospectId: "fictional-prospect",
        reason: "Fictional public evidence",
      });
      await call("preparePackage", { prospectId: "fictional-prospect" });
      await stop();
      rows = snapshot("package.json");
      const pack = JSON.parse(rows.outreach_packages[0]);
      const contact = rows.contacts
        .map(JSON.parse)
        .find((x) => x.email_display === "person@quarry.example");
      assert.ok(contact);
      await start();
      await call("approvePackage", { packageId: pack.id, expectedDigest: pack.digest });
      await call("prepareMessage", { packageId: pack.id, contactId: contact.id });
      await stop();
      rows = snapshot("message.json");
      const message = JSON.parse(rows.outreach_messages[0]);
      await start();
      await call("approveMessage", {
        messageId: message.id,
        expectedDigest: message.digest,
        acknowledged: true,
      });
      await call("addSuppression", {
        kind: "domain",
        value: "blocked.example",
        reason: "Fictional suppression",
      });
      const window = effects();
      assert.deepEqual(window, ["discovery", "hunt", "reveal"]);
      await call("getWorkspace");
      await call("getWorkspace");
      assert.deepEqual(effects(), window, "repeated HTTP reads have no provider work");
      await stop();
      const before = snapshot("before.json");
      for (const table of [
        "knowledge_items",
        "prospects",
        "contacts",
        "outreach_packages",
        "outreach_messages",
        "review_commands",
        "suppressions",
      ])
        assert.ok(before[table].length, table + " populated");
      assert.equal(JSON.parse(before.outreach_messages[0]).status, "approved");
      await start();
      assert.deepEqual(effects(), window, "startup has no provider work");
      assert.equal(
        (await (await request("/api/auth/get-session")).json()).user.id,
        owner,
        "persisted session remains valid",
      );
      assert.equal((await request("/api/auth/sign-out", { method: "POST", body: {} })).status, 200);
      assert.equal(await (await request("/api/auth/get-session")).json(), null);
      await login();
      assert.equal(
        (await (await request("/api/auth/get-session")).json()).user.id,
        owner,
        "fresh reauthentication retains owner",
      );
      await call("getWorkspace");
      await call("getWorkspace");
      assert.deepEqual(effects(), window);
      await stop();
      const after = snapshot("after.json");
      for (const table of Object.keys(before))
        assert.ok(
          JSON.stringify(after[table]) === JSON.stringify(before[table]),
          "Semantic continuity: " + table,
        );
      console.log(
        "Durable evidence: HTTP owner + admitted mutations; separate process restart; inventoried workflow tables and secret ciphertext digest equal; discovery=1 hunt=1 reveal=1; automatic=0 outbound=0",
      );
    } finally {
      await stop();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
