import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { toJSON } from "seroval";
import { chromium } from "playwright";
const origin = "http://127.0.0.1:8080";
function request(path, headers = {}, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      origin + path,
      { headers, method, agent: false, timeout: 10000 },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end(body);
  });
}
await test(
  "default local access: no password, persistent identity and same-site boundaries",
  { timeout: 120000 },
  async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "prospector-local-access-")));
    let child, browser;
    async function stop() {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const done = once(child, "exit");
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
    async function start() {
      child = spawn(process.execPath, ["scripts/local-start.mjs"], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          DATABASE_URL: "",
          NODE_ENV: "production",
          OPERATOR_DATA_DIR: dir,
          AUTH_RUNTIME_ATTEMPTS: join(dir, "outbound"),
          NODE_OPTIONS: `--import=${resolve("acceptance/auth-runtime/deny-outbound.mjs")}`,
        },
      });
      // Drain bounded diagnostic streams without exposing private owner material.
      child.stdout.resume();
      child.stderr.resume();
      for (let i = 0; i < 300; i++) {
        assert.equal(child.exitCode, null, "launcher remains alive");
        try {
          if ((await request("/api/auth/get-session")).status === 200) return;
        } catch {
          /* bounded readiness */
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("readiness timeout");
    }
    try {
      await start();
      const owner = readFileSync(join(dir, "owner.json"), "utf8");
      const vault = readFileSync(join(dir, "operator.vault"), "utf8");
      assert.equal(statSync(join(dir, "owner.json")).mode & 0o777, 0o600);
      const session = await request("/api/auth/get-session");
      assert.equal(JSON.parse(session.text).user.id, JSON.parse(owner).id);
      assert.equal(JSON.parse(session.text).user.localAccess, true);
      assert.equal(session.headers["set-cookie"], undefined);
      assert.equal(session.headers["cache-control"], "no-store");
      const source = readFileSync(
        join(
          ".output/server/_ssr",
          readdirSync(".output/server/_ssr").find((n) => /^fns-.*\.mjs$/.test(n)),
        ),
        "utf8",
      );
      const route = (name) => {
        const match = source.match(new RegExp(`id: "([a-f0-9]+)",\\s*name: "${name}"`));
        assert.ok(match, name);
        return "/_serverFn/" + match[1];
      };
      assert.equal(
        (await request(route("getWorkspace"), { "x-tsr-serverFn": "true", origin })).status,
        200,
      );
      for (const headers of [
        { host: "evil.example" },
        { origin: "https://evil.example" },
        { "sec-fetch-site": "cross-site" },
        { "x-forwarded-host": "127.0.0.1:8080" },
      ]) {
        assert.equal((await request("/api/auth/get-session", headers)).status, 403);
        assert.equal(
          (await request(route("getWorkspace"), { "x-tsr-serverFn": "true", ...headers })).status,
          403,
        );
      }
      for (const headers of [{}, { origin: "https://evil.example" }])
        assert.equal(
          (await request(route("proposeAnswer"), { "x-tsr-serverFn": "true", ...headers }, "POST"))
            .status,
          403,
        );
      for (const path of ["sign-in/email", "sign-up/email", "sign-out"])
        assert.equal((await request("/api/auth/" + path, { origin }, "POST")).status, 404);
      const changed = await request(
        route("proposeAnswer"),
        {
          origin,
          "content-type": "application/json",
          "x-tsr-serverFn": "true",
        },
        "POST",
        JSON.stringify(
          toJSON({
            data: { questionId: "company.legal_name", answer: "Fictional passwordless company" },
          }),
        ),
      );
      assert.equal(changed.status, 200);
      assert.ok(
        changed.text.includes("Fictional passwordless company"),
        "cookie-free workspace write succeeds",
      );
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin);
      await page.waitForLoadState("networkidle");
      assert.equal(await page.getByRole("button", { name: /unlock|sign out/i }).count(), 0);
      assert.ok((await page.locator("body").innerText()).includes("Home"));
      await page.reload();
      await page.waitForLoadState("networkidle");
      assert.equal(await page.getByRole("button", { name: /unlock/i }).count(), 0);
      assert.deepEqual(errors, []);
      await browser.close();
      browser = undefined;
      await stop();
      await start();
      assert.equal(readFileSync(join(dir, "owner.json"), "utf8"), owner);
      assert.equal(readFileSync(join(dir, "operator.vault"), "utf8"), vault);
      assert.equal(
        JSON.parse((await request("/api/auth/get-session")).text).user.id,
        JSON.parse(owner).id,
      );
      assert.equal(
        (await request(route("getWorkspace"), { "x-tsr-serverFn": "true", origin })).status,
        200,
      );
      assert.ok(
        (await request(route("getWorkspace"), { "x-tsr-serverFn": "true", origin })).text.includes(
          "Fictional passwordless company",
        ),
        "workspace write persists after restart",
      );
      assert.equal(existsSync(join(dir, "outbound")), false, "no provider/socket attempts");
    } finally {
      await browser?.close();
      await stop();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
