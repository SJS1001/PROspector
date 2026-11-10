import assert from "node:assert/strict";
import { test, after } from "node:test";
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
    headers: {
      host: "127.0.0.1:8080",
      origin: "http://127.0.0.1:8080",
      "sec-fetch-site": "same-origin",
    },
  }),
) {
  const counts = { provider: 0, db: 0, hunt: 0, public: 0, approve: 0, handoff: 0 };
  const localRequest = compiled("../src/lib/auth/local-request.ts", () => {
    throw Error("Unexpected local-request import");
  });
  const isolation = compiled("../src/lib/auth/isolation.server.ts", (name) => {
    if (name === "./local-request.ts") return localRequest;
    if (name === "@tanstack/react-start/server") return { getRequest: () => request };
    throw Error(`Unexpected isolation import ${name}`);
  });
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
    if (name === "@tanstack/react-start/server") return { setResponseStatus: () => {} };
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
      headers: {
        host: "127.0.0.1:8080",
        origin: "https://foreign.example",
        "sec-fetch-site": site,
      },
    });
    const { fns, counts } = harness(request);
    for (const name of ["openInGmail", "approveMessage", "tickSchedule", "requestEnrichmentGrant"])
      await assert.rejects(fns[name]({}), (e) => e.status === 403);
    assert.equal(counts.db, 0);
    assert.equal(counts.hunt, 0);
    assert.equal(counts.provider, 0);
  });

// ---------------------------------------------------------------------------
// Database-backed server-function cases (synthetic PGlite; no provider seam).
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";
import * as nodeCrypto from "node:crypto";
import { readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as manualWorkflow from "../src/lib/server/manual-workflow.ts";
import * as domainLlm from "../src/lib/domain/llm.ts";

let pg;
async function database() {
  if (pg) return pg;
  pg = new PGlite();
  for (const n of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8"));
  return pg;
}
after(async () => pg?.close());
function pgSql(runner) {
  const query = async (text, params = []) => (await runner.query(text, params)).rows;
  const sql = async (parts, ...values) => {
    let text = parts[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
    return query(text, values);
  };
  sql.query = query;
  sql.transaction = (fn) =>
    runner.transaction ? runner.transaction((tx) => fn(pgSql(tx))) : fn(sql);
  return sql;
}
const idFor = (user, slug) =>
  createHash("sha256").update(`prospector:${user}:${slug}`).digest("hex").slice(0, 24);
function pgFns(sql) {
  const counts = { provider: 0 };
  const { fns } = (() => {
    let auth;
    const request = new Request("http://127.0.0.1:8080/", {
      method: "POST",
      headers: {
        host: "127.0.0.1:8080",
        origin: "http://127.0.0.1:8080",
        "sec-fetch-site": "same-origin",
      },
    });
    const localRequest = compiled("../src/lib/auth/local-request.ts", () => {
      throw Error("Unexpected local-request import");
    });
    const isolation = compiled("../src/lib/auth/isolation.server.ts", (name) => {
      if (name === "./local-request.ts") return localRequest;
      if (name === "@tanstack/react-start/server") return { getRequest: () => request };
      throw Error(`Unexpected isolation import ${name}`);
    });
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
      if (name === "@tanstack/react-start/server") return { setResponseStatus: () => {} };
      if (name === "./isolation.server") return isolation;
      if (name === "./verify.server") return { requireUserId: async () => "owner" };
      throw Error(`Unexpected auth import ${name}`);
    });
    const forbidden = () => {
      counts.provider++;
      throw Error("Provider seam must not be reached");
    };
    const fns = compiled(
      "../src/lib/server/fns.ts",
      (name) => {
        if (name === "node:crypto") return nodeCrypto;
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
        if (name === "@/lib/server/seed") return { ensureWorkspace: async () => {}, idFor };
        if (name === "@/lib/server/manual-workflow") return manualWorkflow;
        if (name === "@/lib/domain/catalog") return { INTERVIEW: [] };
        if (name === "@/lib/domain/llm") return domainLlm;
        return new Proxy({}, { get: () => forbidden });
      },
      "\nloadWorkspace = async () => ({fixture:true});",
    );
    return { fns };
  })();
  return { fns, counts };
}
async function outreachFixture(sql) {
  await (await database()).exec(
    "truncate outreach_messages,outreach_packages,contacts,prospects,suppressions,delivery_events,identity_merges,prospecting_runs,discovery_runs",
  );
  await sql.query(
    `insert into prospects(id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('r','owner','Fictional Works','account','Target','target','offer',8,'Passed','approved','config','assessment','{}','Fictional evidence','https://fictional.example/evidence',1,'2026-10-28')`,
  );
  await sql.query(
    `insert into outreach_packages(id,user_id,prospect_id,status,subject,body,digest,approved_at) values ('p','owner','r','approved','Subject','Body',$1,now())`,
    [manualWorkflow.packageDigest("Subject", "Body", "r")],
  );
  for (const [id, email] of [
    ["a", "jane@acme.com"],
    ["b", "jane@acme.com"],
  ])
    await sql.query(
      `insert into contacts(id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence,published_url) values ($1,'owner','r','Jane Fictional','champion','public_source',$2,'Published source','medium','https://fictional.example/team')`,
      [id, email],
    );
}
const csvHas = async (sql, email) =>
  (await manualWorkflow.manualCrmCsv(sql, "owner")).includes(email);

test("domain suppressions are normalised so they actually block the domain", async () => {
  const sql = pgSql(await database());
  const { fns, counts } = pgFns(sql);
  for (const value of ["@Acme.com", "https://www.acme.com/x", "www.acme.com", "ACME.COM.", "acme.com:443"]) {
    await outreachFixture(sql);
    assert.equal(await csvHas(sql, "jane@acme.com"), true);
    await fns.addSuppression({ kind: "domain", value, reason: "Fictional opt-out" });
    const rows = await sql.query("select kind, value from suppressions where user_id='owner'");
    assert.deepEqual(rows, [{ kind: "domain", value: "acme.com" }], value);
    assert.equal(await csvHas(sql, "jane@acme.com"), false, value);
    await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"));
  }
  assert.equal(counts.provider, 0);
});

test("a domain entry also blocks its subdomains, but not a lookalike domain", async () => {
  const sql = pgSql(await database());
  const { fns, counts } = pgFns(sql);
  const blocked = ["x@mail.acme.com", "x@a.b.acme.com", "x@ACME.com", "x@Mail.Acme.Com"];
  const allowed = ["x@notacme.com", "x@acme.com.evil.example", "x@acme.co", "x@mailacme.com"];
  for (const email of [...blocked, ...allowed]) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    assert.equal(await csvHas(sql, email), true, `${email} is eligible before the entry`);
    await fns.addSuppression({ kind: "domain", value: "acme.com", reason: "Fictional opt-out" });
    const isBlocked = blocked.includes(email);
    assert.equal(await csvHas(sql, email), !isBlocked, email);
    if (isBlocked) await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"), email);
    else await manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m");
  }
  // A subdomain entry does not widen to its parent.
  await outreachFixture(sql);
  await sql.query("update contacts set email_display = 'x@acme.com'");
  await fns.addSuppression({ kind: "domain", value: "mail.acme.com", reason: "Fictional opt-out" });
  assert.equal(await csvHas(sql, "x@acme.com"), true);
  assert.equal(counts.provider, 0);
});

test("a mailbox or entry with a trailing dot cannot escape a do-not-contact block", async () => {
  const sql = pgSql(await database());
  const { fns, counts } = pgFns(sql);
  // "x@acme.com." is the same mailbox as "x@acme.com" (the root label), so it
  // must be blocked by an acme.com domain entry and by its subdomain rule.
  const viaDomain = ["x@acme.com.", "x@mail.acme.com.", "x@ACME.COM..", "x@Mail.Acme.Com."];
  for (const email of viaDomain) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    assert.equal(await csvHas(sql, email), true, `${email} is eligible before the entry`);
    await fns.addSuppression({ kind: "domain", value: "acme.com", reason: "Fictional opt-out" });
    assert.equal(await csvHas(sql, email), false, email);
    await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"), email);
  }
  // An exact email entry also blocks the trailing-dot spelling of that mailbox.
  await outreachFixture(sql);
  await sql.query("update contacts set email_display = 'x@acme.com.'");
  await fns.addSuppression({ kind: "email", value: "x@acme.com", reason: "Fictional opt-out" });
  assert.equal(await csvHas(sql, "x@acme.com."), false);
  // An entry stored with a trailing dot (for example by a crafted archive
  // restore, which keeps suppression values as archived) still blocks.
  for (const [kind, value, email] of [
    ["domain", "acme.com.", "x@acme.com"],
    ["domain", "acme.com.", "x@mail.acme.com"],
    ["domain", " ACME.com. ", "x@acme.com."],
    ["email", "x@acme.com.", "x@acme.com"],
  ]) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    await sql.query(
      "insert into suppressions (id, user_id, kind, value, reason) values ('crafted', 'owner', $1, $2, 'Fictional opt-out')",
      [kind, value],
    );
    assert.equal(await csvHas(sql, email), false, `${kind}:${value} blocks ${email}`);
    await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"));
  }
  // The trailing dot does not widen a block to a lookalike domain.
  for (const email of ["x@notacme.com.", "x@acme.co.", "x@acme.com.evil.example."]) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    await fns.addSuppression({ kind: "domain", value: "acme.com", reason: "Fictional opt-out" });
    assert.equal(await csvHas(sql, email), true, email);
  }
  assert.equal(counts.provider, 0);
});

test("an IDNA full stop cannot escape a do-not-contact block", async () => {
  const sql = pgSql(await database());
  const { fns, counts } = pgFns(sql);
  // U+3002, U+FF0E and U+FF61 are label separators (RFC 3490 §3.1, WHATWG URL),
  // so each spelling below is the same mailbox as x@acme.com or x@mail.acme.com.
  const viaDomain = [
    "x@acme.com\u3002",
    "x@acme.com\uFF0E",
    "x@acme.com\uFF61",
    "x@mail\u3002acme.com",
    "x@mail\uFF0Eacme.com",
    "x@mail\uFF61acme.com",
    "x@mail.acme.com\u3002",
  ];
  for (const email of viaDomain) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    assert.equal(await csvHas(sql, email), true, `${email} is eligible before the entry`);
    await fns.addSuppression({ kind: "domain", value: "acme.com", reason: "Fictional opt-out" });
    assert.equal(await csvHas(sql, email), false, email);
    await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"), email);
  }
  // An exact email entry blocks those spellings too, and an entry stored with
  // an IDNA full stop (only a crafted archive can do that) still blocks.
  for (const [kind, value, email] of [
    ["email", "x@acme.com", "x@acme.com\u3002"],
    ["email", "x@acme\uFF0Ecom", "x@acme.com"],
    ["domain", "acme\uFF61com", "x@mail.acme.com"],
    ["domain", "acme.com\u3002", "x@acme.com"],
  ]) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    await sql.query(
      "insert into suppressions (id, user_id, kind, value, reason) values ('crafted', 'owner', $1, $2, 'Fictional opt-out')",
      [kind, value],
    );
    assert.equal(await csvHas(sql, email), false, `${kind}:${value} blocks ${email}`);
    await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"));
  }
  // The mapping does not widen a block to a lookalike domain.
  for (const email of ["x@notacme.com\u3002", "x@acme\uFF0Eco.uk", "x@acme.com\uFF0Eevil.example"]) {
    await outreachFixture(sql);
    await sql.query("update contacts set email_display = $1", [email]);
    await fns.addSuppression({ kind: "domain", value: "acme.com", reason: "Fictional opt-out" });
    assert.equal(await csvHas(sql, email), true, email);
  }
  assert.equal(counts.provider, 0);
});

test("Settings rejects an invalid spend cap or batch size instead of saving it", async () => {
  const sql = pgSql(await database());
  const { fns, counts } = pgFns(sql);
  await sql.query("truncate operator_secrets, operating_state");
  for (const monthlyBudgetCents of [Number.NaN, null, -1, 12.5, "5000", Infinity, 10_000_001])
    await assert.rejects(fns.saveConnections({ monthlyBudgetCents }), /monthly AI spend cap/, String(monthlyBudgetCents));
  for (const huntBatch of [Number.NaN, null, 3, 21, 7.5, "8"])
    await assert.rejects(fns.saveConnections({ huntBatch }), /whole number from 4 to 20/, String(huntBatch));
  assert.deepEqual(await sql.query("select * from operator_secrets"), []);
  assert.deepEqual(await sql.query("select * from operating_state"), []);
  assert.equal(counts.provider, 0);
});

test("suppressions that can never match are rejected, not stored", async () => {
  const sql = pgSql(await database());
  const { fns } = pgFns(sql);
  await outreachFixture(sql);
  const cases = [
    ["domain", "not a domain"],
    ["domain", "acme"],
    ["domain", "jane@acme.com"],
    ["domain", "https://"],
    ["email", "jane at acme.com"],
    ["email", "jane@"],
    ["email", "@acme.com"],
    ["contact", "no-such-contact"],
  ];
  for (const [kind, value] of cases)
    await assert.rejects(
      fns.addSuppression({ kind, value, reason: "Fictional opt-out" }),
      /domain|email|contact/i,
      `${kind}:${value}`,
    );
  await assert.rejects(
    fns.addSuppression({ kind: "bogus", value: "jane@acme.com", reason: "Fictional opt-out" }),
  );
  assert.deepEqual(await sql.query("select * from suppressions"), []);
});

test("valid email, contact and org suppressions are stored and block outreach", async () => {
  const sql = pgSql(await database());
  const { fns } = pgFns(sql);
  await outreachFixture(sql);
  await fns.addSuppression({ kind: "email", value: " Jane@ACME.com ", reason: "Fictional" });
  await fns.addSuppression({ kind: "contact", value: "a", reason: "Fictional" });
  const result = await fns.addSuppression({ kind: "org", value: "Fictional Works", reason: "Fictional" });
  assert.equal(result.suppressionWarning, undefined);
  const unmatched = await fns.addSuppression({ kind: "org", value: "Nobody Inc", reason: "Fictional" });
  assert.match(unmatched.suppressionWarning, /no prospect/i);
  const rows = await sql.query("select kind, value from suppressions order by kind, value");
  assert.deepEqual(rows, [
    { kind: "contact", value: "a" },
    { kind: "email", value: "jane@acme.com" },
    { kind: "org", value: "fictional works" },
    { kind: "org", value: "nobody inc" },
  ]);
  assert.equal(await csvHas(sql, "jane@acme.com"), false);
});

test("merging a suppressed contact keeps the surviving duplicate suppressed", async () => {
  const sql = pgSql(await database());
  const { fns } = pgFns(sql);
  await outreachFixture(sql);
  await sql.query("update contacts set email_display = 'jane.other@fictional.example' where id = 'a'");
  await sql.query("update contacts set email_display = 'jane@acme.com' where id = 'b'");
  await fns.addSuppression({ kind: "contact", value: "b", reason: "Fictional opt-out" });
  assert.equal(await csvHas(sql, "jane.other@fictional.example"), true);
  await fns.mergeContacts({ keepId: "a", dropId: "b", reason: "Same person" });
  assert.deepEqual(
    (await sql.query("select id from contacts order by id")).map((r) => r.id),
    ["a"],
  );
  assert.equal(await csvHas(sql, "jane.other@fictional.example"), false);
  await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"));
  const rows = await sql.query("select kind, value from suppressions order by kind, value");
  assert.deepEqual(rows, [
    { kind: "contact", value: "a" },
    { kind: "contact", value: "b" },
    { kind: "email", value: "jane.other@fictional.example" },
    { kind: "email", value: "jane@acme.com" },
  ]);
});

test("merging the same mailbox keeps it suppressed by contact and by email", async () => {
  const sql = pgSql(await database());
  const { fns } = pgFns(sql);
  await outreachFixture(sql);
  await fns.addSuppression({ kind: "contact", value: "b", reason: "Fictional opt-out" });
  await fns.mergeContacts({ keepId: "a", dropId: "b", reason: "Same person" });
  assert.equal(await csvHas(sql, "jane@acme.com"), false);
  await assert.rejects(manualWorkflow.prepareManualMessage(sql, "owner", "p", "a", "m"));
});

test("concurrent run starts claim exactly one run; the other is refused as already active", async () => {
  const sql = pgSql(await database());
  const { fns } = pgFns(sql);
  await outreachFixture(sql);
  const claim = (runId) =>
    fns.claimProspectingRun(sql, { userId: "owner", runId, digest: "d", trigger: "manual" });
  const results = await Promise.allSettled([claim("run-1"), claim("run-2")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(refused.length, 1);
  assert.match(refused[0].reason.message, /already active/);
  const runs = await sql.query("select id, status from prospecting_runs where user_id='owner'");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "running");

  const disc = (runId) =>
    fns.claimDiscoveryRun(sql, { userId: "owner", runId, digest: "d", trigger: "manual" });
  const discResults = await Promise.allSettled([disc("disc-1"), disc("disc-2")]);
  assert.equal(discResults.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(discResults.find((r) => r.status === "rejected").reason.message, /already active/);
  assert.equal((await sql.query("select id from discovery_runs")).length, 1);
});

test("after startup recovery a new run can be claimed again", async () => {
  const sql = pgSql(await database());
  const { fns } = pgFns(sql);
  await outreachFixture(sql);
  const { recoverInterruptedRuns } = await import("../src/lib/server/archive.ts");
  await fns.claimProspectingRun(sql, { userId: "owner", runId: "orphan", digest: "d", trigger: "manual" });
  await fns.claimDiscoveryRun(sql, { userId: "owner", runId: "orphan-d", digest: "d", trigger: "manual" });
  await assert.rejects(
    fns.claimProspectingRun(sql, { userId: "owner", runId: "next", digest: "d", trigger: "manual" }),
    /already active/,
  );
  await recoverInterruptedRuns(sql);
  await fns.claimProspectingRun(sql, { userId: "owner", runId: "next", digest: "d", trigger: "manual" });
  await fns.claimDiscoveryRun(sql, { userId: "owner", runId: "next-d", digest: "d", trigger: "manual" });
  assert.deepEqual(
    (await sql.query("select id, status from prospecting_runs order by id")).map((r) => [r.id, r.status]),
    [
      ["next", "running"],
      ["orphan", "failed"],
    ],
  );
});
