import { isDatabaseLocked } from "../../scripts/local-data.mjs";
// Defence against direct invocation. Only the SERVER installs JS patches;
// the orchestrator needs build/process/HTTP APIs inside the inherited OS fence.
import { requireNativeContainment } from "./native-boundary.mjs";
import {
  cpSync,
  realpathSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { STUB_NAMES, stubSource } from "./stubs.mjs";
import { fenceContext, ORIGIN } from "./browser-fence.mjs";
import { auditGraph } from "./graph.mjs";
import { failureEvidence } from "./diagnostics.mjs";

requireNativeContainment();
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "prospector-browser-")));
const runtime = join(scratch, "operator");
const data = join(scratch, "data");
const eventsPath = join(scratch, "events.jsonl");
writeFileSync(eventsPath, "");
const password = randomBytes(24).toString("base64url");
const observedPackage = JSON.parse(
  readFileSync(join(here, "node_modules/playwright/package.json"), "utf8"),
);
assert.equal(observedPackage.version, "1.63.0");
assert.ok(
  import.meta.resolve("playwright").startsWith(new URL("./node_modules/", import.meta.url).href),
  "install the isolated package; parent dependency fallback refused",
);
const observedBrowsers = JSON.parse(
  readFileSync(join(here, "node_modules/playwright-core/browsers.json"), "utf8"),
);
assert.equal(observedBrowsers.browsers.find((x) => x.name === "chromium").revision, "1243");
const base = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const evidence = {
  base,
  node: process.version,
  platform: process.platform,
  playwright: "1.63.0",
  browserRevision: "1243",
  status: "RUNNING",
  nativeContainment: "macos-seatbelt-localhost-tcp-8080-8082",
  cases: [],
  snapshots: [],
};
const env = {
  PATH: process.env.PATH,
  HOME: scratch,
  LANG: "C.UTF-8",
  NODE_ENV: "production",
  OPERATOR_DATA_DIR: data,
  ACCEPTANCE_EVENTS: eventsPath,
  HOST: "127.0.0.1",
  PORT: "8080",
  NITRO_HOST: "127.0.0.1",
  NITRO_PORT: "8080",
  VITE_AUTH_ENABLED: "true",
};
let server, browser, browserServer;
let interrupted = false;
let finalization;
let stage = "source-review";
const browserEvents = [];
function eventRows() {
  return readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((x) => JSON.parse(x));
}
function checked(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: runtime, env, encoding: "utf8", ...options });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
async function stop() {
  if (!server) return;
  if (server.exitCode !== null) {
    server = undefined;
    assert.ok(!isDatabaseLocked(data), "exited server must release DB lock");
    return;
  }
  const current = server;
  server = undefined;
  const exited = once(current, "exit");
  current.kill("SIGTERM");
  let timer;
  let forced = false;
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          forced = true;
          current.kill("SIGKILL");
          exited.then(() => reject(new Error("Server failed graceful shutdown")));
        }, 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (forced) throw new Error("Server required forced termination");
  assert.ok(!isDatabaseLocked(data), "server must release DB lock");
}
async function start() {
  if (interrupted) throw new Error("Acceptance interrupted");
  assert.ok(!server);
  server = spawn(
    process.execPath,
    ["--import", join(here, "guard.mjs"), join(runtime, ".output/server/index.mjs")],
    { cwd: runtime, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  let spawnError;
  server.on("error", (error) => {
    spawnError = error;
  });
  server.stdout.on("data", (x) => {
    logs += x;
  });
  server.stderr.on("data", (x) => {
    logs += x;
  });
  for (let i = 0; i < 200; i++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Server exited (${server.exitCode}): ${logs}`);
    // A child-specific binding event must precede every request. Never probe another installation.
    if (eventRows().some((x) => x.kind === "listening" && x.pid === server.pid)) {
      try {
        const r = await fetch(ORIGIN + "/api/auth/get-session", {
          signal: AbortSignal.timeout(2000),
        });
        if (r.status === 200) return;
      } catch {
        // Readiness may lag the owned listener; bounded retry stays local.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server readiness timed out: ${logs}`);
}
async function snapshot(label) {
  await stop();
  const { PGlite } = await import("../../node_modules/@electric-sql/pglite/dist/index.js");
  const pg = new PGlite(join(data, "database"));
  try {
    await pg.waitReady;
    const tables = {};
    // Workspace state only. Auth and encrypted configuration never leave this directory.
    for (const table of [
      "workspaces",
      "knowledge_items",
      "product_configurations",
      "draft_plays",
      "profile_configurations",
      "discovery_runs",
      "prospecting_runs",
      "prospects",
      "contacts",
      "outreach_packages",
      "outreach_messages",
      "suppressions",
      "delivery_events",
    ]) {
      const rows = (await pg.query(`select * from ${table}`)).rows;
      tables[table] = rows
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              typeof value === "bigint" ? String(value) : value,
            ]),
          ),
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    const result = {
      counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      digest: createHash("sha256").update(JSON.stringify(tables)).digest("hex"),
      tables,
    };
    evidence.snapshots.push({ label, counts: result.counts, digest: result.digest });
    return result;
  } finally {
    await pg.close();
    await start();
  }
}
async function restart() {
  await stop();
  await start();
}
async function authSmoke() {
  const post = (headers, body) =>
    fetch(ORIGIN + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal(await (await fetch(ORIGIN + "/api/auth/get-session")).text(), "null");
  const before = await snapshot("before-negative-http");
  for (const headers of [
    {},
    { origin: "https://foreign.example" },
    { origin: ORIGIN, "sec-fetch-site": "cross-site" },
  ]) {
    assert.equal((await post(headers, { email: "owner@localhost.invalid", password })).status, 403);
  }
  assert.equal(
    (
      await fetch(ORIGIN + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await post(
        { origin: ORIGIN },
        { email: "owner@localhost.invalid", password: "fictional incorrect password" },
      )
    ).status,
    401,
  );
  const after = await snapshot("after-negative-http");
  assert.deepEqual(after, before, "denied requests change no workspace state");
  const response = await post({ origin: ORIGIN }, { email: "owner@localhost.invalid", password });
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((x) => x.startsWith("prospector-owner.session_token="));
  assert.ok(cookie && /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie));
  const authenticated = await fetch(ORIGIN + "/api/auth/get-session", {
    headers: { cookie: cookie.split(";", 1)[0] },
  });
  assert.ok((await authenticated.json()).user.id);
  evidence.cases.push(
    "anonymous denied; owner login; no signup; missing/foreign Origin and cross-site POST refused; zero workspace delta",
  );
}
async function mutateFixture(action) {
  await stop();
  const { PGlite } = await import("../../node_modules/@electric-sql/pglite/dist/index.js");
  const pg = new PGlite(join(data, "database"));
  try {
    await pg.waitReady;
    if (action === "invalidate-message") {
      const result = await pg.query(
        "update outreach_messages set body='Fictional changed after approval', status='draft', approved_at=null, acknowledged=false where to_email='person2@fictionalquarry.example' and status='approved' returning id",
      );
      assert.equal(result.rows.length, 1);
    } else if (action === "add-probe-suppression") {
      await pg.query(
        "insert into suppressions(id,user_id,kind,value,reason) select 'browser-probe-only',user_id,'email','person2@fictionalquarry.example','Fictional harness fault injection' from outreach_messages where to_email='person2@fictionalquarry.example'",
      );
    } else if (action === "remove-probe-suppression") {
      const result = await pg.query(
        "delete from suppressions where id='browser-probe-only' and reason='Fictional harness fault injection' returning id",
      );
      assert.equal(result.rows.length, 1);
    } else if (action === "csv-edge-contacts") {
      const [prospect] = (
        await pg.query(
          "select p.id,p.user_id from prospects p join contacts c on c.prospect_id=p.id where c.email_display='person1@fictionalquarry.example'",
        )
      ).rows;
      assert.ok(prospect);
      const names = [
        "=1+1",
        " \t+1",
        "\u0001-1",
        "\ufeff@SUM(1,1)",
        'Fictional "Person", Quarry\né',
        "\nFictional Person",
      ];
      await pg.transaction(async (tx) => {
        for (const [index, name] of names.entries())
          await tx.query(
            "insert into contacts(id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence,published_url) values($1,$2,$3,$4,'champion','verified',$5,$6,'high','https://fictionalquarry.example/evidence/1')",
            [
              "csv-edge-" + index,
              prospect.user_id,
              prospect.id,
              name,
              "edge" + index + "@fictionalquarry.example",
              'Published on https://fictionalquarry.example/evidence/1, "fictional"\nUnicode é',
            ],
          );
        for (const [id, kind, email] of [
          ["csv-suggestion", "suggestion", "suggestion@fictionalquarry.example"],
          ["csv-suppressed", "verified", "person@blocked.example"],
        ])
          await tx.query(
            "insert into contacts(id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence,published_url) values($1,$2,$3,'Fictional Person','champion',$4,$5,'Published on https://fictionalquarry.example/evidence/1','high','https://fictionalquarry.example/evidence/1')",
            [id, prospect.user_id, prospect.id, kind, email],
          );
        await tx.query(
          "insert into suppressions(id,user_id,kind,value,reason) values('csv-blocked-domain',$1,'domain','blocked.example','Fictional CSV exclusion')",
          [prospect.user_id],
        );
      });
      return { names };
    } else throw new Error("Unknown fixture action");
  } finally {
    await pg.close();
    await start();
  }
}
async function assertIdle(page) {
  const before = eventRows().filter((x) => x.kind === "stub");
  const canonical = await snapshot("before-idle-reload");
  await page.reload();
  await page.locator("#operator-task").waitFor();
  await page.waitForTimeout(1200);
  assert.deepEqual(
    eventRows().filter((x) => x.kind === "stub"),
    before,
    "reload/startup must not invoke provider work",
  );
  const after = await snapshot("after-idle-reload");
  assert.deepEqual(after, canonical, "reload/startup must not mutate workflow authority");
  evidence.cases.push(
    "startup/reload observation window: zero automatic provider work and canonical state delta",
  );
}
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
])
  process.once(signal, () => {
    interrupted = true;
    evidence.status = "INTERRUPTED";
    process.exitCode = code;
    finalize().finally(() => process.exit(code));
  });
try {
  assert.deepEqual(
    auditGraph(),
    JSON.parse(readFileSync(join(here, "reviewed-graph.json"), "utf8")),
    "source graph changed: review before rerunning",
  );
  evidence.reviewedSourceFiles = auditGraph().length;
  stage = "isolated-build";
  mkdirSync(runtime);
  writeFileSync(eventsPath, "");
  for (const file of [
    "src",
    "server",
    "scripts",
    "migrations",
    "public",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
  ])
    cpSync(join(root, file), join(runtime, file), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(runtime, "node_modules"), "dir");
  const config = join(runtime, "vite.config.ts");
  const providerPaths = STUB_NAMES.map((n) => [
    join(runtime, "src/lib/server", n + ".ts"),
    stubSource(n),
  ]);
  writeFileSync(
    join(runtime, "acceptance-stubs.json"),
    JSON.stringify(Object.fromEntries(providerPaths)),
  );
  let source = readFileSync(config, "utf8");
  source =
    `import { readFileSync as acceptanceRead } from 'node:fs';\nconst acceptanceStubs = JSON.parse(acceptanceRead(new URL('./acceptance-stubs.json', import.meta.url),'utf8'));\n` +
    source;
  assert.equal(source.split("plugins: [").length, 2, "expected exactly one plugin insertion");
  source = source.replace(
    "plugins: [",
    `plugins: [{name:'acceptance-provider-leaves',enforce:'pre',load(id){const key=id.split('?')[0];if(acceptanceStubs[key]){acceptanceAppend(new URL('./loaded-stubs.jsonl',import.meta.url),JSON.stringify(key)+'\\n');return acceptanceStubs[key];}return null;}},`,
  );
  source = "import { appendFileSync as acceptanceAppend } from 'node:fs';\n" + source;
  writeFileSync(config, source);
  checked(process.execPath, [join(runtime, "scripts/owner-setup.mjs")], { input: password + "\n" });
  console.log("Building isolated runtime with provider leaves replaced…");
  checked(join(root, "node_modules/.bin/vite"), ["build"]);
  checked(process.execPath, [join(runtime, "scripts/local-build-assets.mjs")]);
  const intercepted = readFileSync(join(runtime, "loaded-stubs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  for (const name of ["llm", "retrieve", "jev-tasks"])
    assert.ok(
      intercepted.includes(join(runtime, "src/lib/server", name + ".ts")),
      "provider seam missed: " + name,
    );
  evidence.interceptedProviders = [...new Set(intercepted)].map((x) => x.split("/").pop()).sort();
  stage = "server-auth-smoke";
  await start();
  evidence.cases.push("real built server starts with outbound guard");
  await authSmoke();
  stage = "pinned-browser-launch";
  if (interrupted) throw new Error("Acceptance interrupted");
  browserServer = await chromium.launchServer({
    headless: true,
    host: "127.0.0.1",
    port: 8082,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--no-first-run",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    ],
  });
  browser = await chromium.connect(browserServer.wsEndpoint());
  evidence.browser = browser.version();
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(30_000);
  await fenceContext(context, browserEvents);
  // Active negative proof: browser routing must refuse both external and alternate loopback origins.
  for (const target of [
    "https://example.invalid/fence-probe",
    "http://127.0.0.1:8081/fence-probe",
  ]) {
    const probePage = await context.newPage();
    console.log("Browser checkpoint: negative origin probe");
    await assert.rejects(
      probePage.goto(target, { timeout: 5000, waitUntil: "commit" }),
      /net::ERR_BLOCKED_BY_CLIENT/,
    );
    await Promise.race([
      probePage.close(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Probe page close timed out")), 5000),
      ),
    ]);
  }
  assert.equal(browserEvents.filter((x) => x.kind === "denied").length, 2);
  browserEvents.length = 0;
  const page = await context.newPage();
  const { runWorkflow } = await import("./workflow.mjs");
  stage = "browser-workflow";
  await runWorkflow({
    context,
    page,
    origin: ORIGIN,
    password,
    restart,
    snapshot,
    mutateFixture,
    evidence,
    assertIdle,
  });
  stage = "browser-recovery";
  const { runRecovery } = await import("./recovery.mjs");
  await runRecovery({ page, origin: ORIGIN, snapshot, evidence });
  const actual = eventRows();
  assert.equal(
    actual.filter((x) => x.kind === "denied").length,
    0,
    "caught outbound attempt fails acceptance",
  );
  assert.ok(
    actual.every(
      (x) =>
        x.kind === "listening" ||
        (x.kind === "stub" && ["hunt", "discovery", "retrieve", "explain"].includes(x.name)),
    ),
    "unexpected provider adapter fails acceptance",
  );
  assert.equal(
    browserEvents.filter(
      (x) => x.kind === "denied" || x.kind === "websocket-denied" || x.kind === "redirect-denied",
    ).length,
    0,
  );
  assert.equal(browserEvents.filter((x) => x.kind === "compose").length, 2);
  evidence.stubCounts = Object.fromEntries(
    ["hunt", "discovery", "retrieve", "explain"].map((name) => [
      name,
      actual.filter((x) => x.name === name).length,
    ]),
  );
  evidence.browserCounts = {
    local: browserEvents.filter((x) => x.kind === "local").length,
    composeAborted: 2,
    unexpected: 0,
  };
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "BLOCKED_OR_FAILED";
  evidence.error = failureEvidence(error, stage);
  evidence.browserFenceCounts = Object.fromEntries(
    ["local", "denied", "redirect-denied", "websocket-denied", "compose"].map((kind) => [
      kind,
      browserEvents.filter((x) => x.kind === kind).length,
    ]),
  );
  console.error("Acceptance blocked or failed at " + stage + " (" + error.name + ")");
  process.exitCode = 1;
} finally {
  await finalize();
}
function finalize() {
  return (finalization ??= (async () => {
    try {
      if (browser || browserServer) {
        let timer;
        try {
          await Promise.race([
            (async () => {
              if (browser) await browser.close();
              if (browserServer) await browserServer.close();
            })(),
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                browserServer?.process().kill("SIGKILL");
                reject(new Error("Browser failed graceful shutdown"));
              }, 10000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
    } catch (error) {
      evidence.status = "FAILED_TEARDOWN";
      evidence.teardownError = error.message;
      process.exitCode = 1;
    }
    try {
      await stop();
    } catch (error) {
      evidence.status = "FAILED_TEARDOWN";
      evidence.teardownError = error.message;
      process.exitCode = 1;
    }
    const finalEvents = eventRows();
    if (
      browserEvents.some((x) =>
        ["denied", "websocket-denied", "redirect-denied"].includes(x.kind),
      ) &&
      evidence.status === "PASS"
    ) {
      evidence.status = "FAILED_BROWSER_FENCE";
      process.exitCode = 1;
    }
    evidence.stubCounts = Object.fromEntries(
      ["hunt", "discovery", "retrieve", "explain"].map((name) => [
        name,
        finalEvents.filter((x) => x.kind === "stub" && x.name === name).length,
      ]),
    );
    evidence.forbiddenAttempts = finalEvents.filter(
      (x) =>
        x.kind === "denied" ||
        (x.kind === "stub" && !["hunt", "discovery", "retrieve", "explain"].includes(x.name)),
    ).length;
    if (evidence.forbiddenAttempts) {
      evidence.status = "FAILED_FENCE";
      process.exitCode = 1;
    }
    // Only sanitized structured evidence is retained. Cookies/password/logs remain disposable.
    delete evidence.beforeRestart;
    delete evidence.afterRestart;
    writeFileSync(join(here, "last-run.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify(evidence, null, 2));
    rmSync(scratch, { recursive: true, force: true });
  })());
}
