import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { classify, fenceContext } from "./browser-fence.mjs";
const probes = [
  "new (require('node:dns').Resolver)().resolve4('example.invalid',()=>{})",
  "new (require('node:dns/promises').Resolver)().resolve4('example.invalid')",
  "new (require('node:dgram').Socket)('udp4').send('fictional',53,'127.0.0.1')",
  "new (require('node:child_process').ChildProcess)().spawn({file:'true',args:['true']})",
  "require('node:http2').connect('https://example.invalid')",
  "new (require('node:worker_threads').Worker)('process.exit(0)',{eval:true})",
  "require('node:net').connect(443,'example.invalid')",
  "new (require('node:net').Socket)().connect({path:'/tmp/fictional.sock'})",
  "require('node:tls').connect(443,'example.invalid')",
  "require('node:dgram').createSocket('udp4')",
  "require('node:dns').lookup('example.invalid',()=>{})",
  "require('node:dns/promises').resolve('example.invalid')",
  "require('node:http').get('http://127.0.0.1:8080')",
  "require('node:https').request('https://example.invalid')",
  "fetch('https://example.invalid')",
  "new WebSocket('wss://example.invalid')",
  "require('node:child_process').spawn('true')",
  "require('node:net').createServer().listen(8080,'0.0.0.0')",
];
for (const [i, probe] of probes.entries())
  test(`server fence blocks primitive ${i + 1}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("./guard.mjs", import.meta.url).href,
        "-e",
        `try { ${probe}; process.exit(7) } catch(e) { if(!e.message.startsWith('Acceptance fence denied:')) throw e; }`,
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );
    assert.equal(result.status, 0, result.stderr);
  });
test("exact origin and compose classification fail closed", () => {
  assert.equal(classify("http://127.0.0.1:8080/a"), "local");
  for (const url of [
    "http://localhost:8080",
    "http://127.0.0.1:8081",
    "https://127.0.0.1:8080",
    "http://127.0.0.1:8080.evil.invalid",
    "http://user@127.0.0.1:8080",
    "https://mail.google.com/",
    "https://mail.google.com.evil.invalid/mail/?view=cm",
  ])
    assert.equal(classify(url), "denied");
  assert.equal(
    classify("https://mail.google.com/mail/?view=cm&to=person@quarry.example"),
    "compose",
  );
  assert.equal(classify("malformed"), "denied");
});

test("browser fence never follows or fulfills a redirect", async () => {
  let handler, websocket;
  const events = [];
  await fenceContext(
    {
      route: async (_pattern, fn) => {
        handler = fn;
      },
      routeWebSocket: async (_pattern, fn) => {
        websocket = fn;
      },
    },
    events,
  );
  const actions = [];
  await handler({
    request: () => ({ url: () => "http://127.0.0.1:8080/redirect-probe", method: () => "GET" }),
    fetch: async (options) => {
      assert.deepEqual(options, { maxRedirects: 0 });
      return { status: () => 302, headers: () => ({ location: "http://192.0.2.1/forbidden" }) };
    },
    fulfill: async () => actions.push("fulfilled"),
    abort: async () => actions.push("aborted"),
  });
  assert.deepEqual(actions, ["aborted"]);
  assert.ok(events.some((x) => x.kind === "redirect-denied"));
  websocket({ close: () => actions.push("websocket-closed") });
  assert.ok(events.some((x) => x.kind === "websocket-denied"));
});

test("failure evidence retains code locations without secret-bearing diagnostics", async () => {
  const { failureEvidence } = await import("./diagnostics.mjs");
  const error = {
    name: "TimeoutError",
    stack:
      "password=fictional-secret cookie=private\nlocator('private-value')\n    at runWorkflow (/tmp/private-root/workflow.mjs:140:12)\n    at /tmp/private-root/run.mjs:456:9",
  };
  assert.deepEqual(failureEvidence(error, "browser-workflow"), {
    stage: "browser-workflow",
    name: "TimeoutError",
    locations: ["workflow.mjs:140:12", "run.mjs:456:9"],
    category: "browser-timeout",
  });
  assert.doesNotMatch(
    JSON.stringify(failureEvidence(error, "browser-workflow")),
    /private|secret|cookie|locator/,
  );
});
