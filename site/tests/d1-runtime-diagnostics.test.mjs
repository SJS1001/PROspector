import assert from "node:assert/strict";
import test from "node:test";
import {
  disposeFixtureRuntime,
  formatSettledRejections,
  instrumentD1Database,
  sanitizeRuntimeError,
} from "./helpers/d1.mjs";

const SYNTHETIC_SECRET = "synthetic-secret";
const SYNTHETIC_TOKEN = "synthetic-token";
const SYNTHETIC_PASSWORD = "synthetic-password";
const SYNTHETIC_SECRET_NAME = "syntheticSecret";
const SENSITIVE = [
  SYNTHETIC_SECRET,
  SYNTHETIC_TOKEN,
  SYNTHETIC_PASSWORD,
  SYNTHETIC_SECRET_NAME,
  "example.invalid",
  "token=",
  "access_key=",
  "Bearer ",
  "https://",
  "http://",
];

function assertNoSensitive(text) {
  const blob = String(text);
  for (const needle of SENSITIVE) {
    assert.equal(blob.includes(needle), false, `diagnostic output leaked ${needle}`);
  }
}

function secretError() {
  const error = new Error(
    `fetch failed: request https://example.invalid/path?token=${SYNTHETIC_SECRET}; Authorization: Bearer ${SYNTHETIC_TOKEN}`,
  );
  error.code = {
    token: SYNTHETIC_SECRET,
    authorization: `Bearer ${SYNTHETIC_TOKEN}`,
    nested: { password: SYNTHETIC_PASSWORD },
    toJSON() {
      return { token: SYNTHETIC_SECRET };
    },
  };
  error.cause = new Error(`upstream https://example.invalid/query?access_key=${SYNTHETIC_SECRET}`);
  error.cause.code = "UND_ERR_SOCKET";
  return error;
}

function throwingGetterError() {
  const reads = { name: 0, message: 0, cause: 0, code: 0 };
  const error = new Error("fetch failed");
  for (const key of Object.keys(reads)) {
    Object.defineProperty(error, key, {
      configurable: true,
      enumerable: false,
      get() {
        reads[key] += 1;
        throw new Error(`hostile ${key}`);
      },
    });
  }
  return { error, reads };
}

function captureStderr(run) {
  const writes = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      process.stderr.write = original;
    })
    .then((result) => ({ result, writes }));
}

function withDiagEnv(value, run) {
  const previous = process.env.PROSPECTOR_D1_DIAG;
  if (value === undefined) delete process.env.PROSPECTOR_D1_DIAG;
  else process.env.PROSPECTOR_D1_DIAG = value;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previous === undefined) delete process.env.PROSPECTOR_D1_DIAG;
      else process.env.PROSPECTOR_D1_DIAG = previous;
    });
}

function failingDatabase(error) {
  return instrumentD1Database({
    prepare() {
      return {
        async run() {
          throw error;
        },
      };
    },
    async batch() {
      throw error;
    },
  }, "diagnostic-fixture");
}

test("classifies allowlisted loopback failures without emitting secret-bearing messages, URLs, queries, or code objects", () => {
  const error = secretError();
  const sanitized = sanitizeRuntimeError(error);
  const formatted = formatSettledRejections([
    { status: "fulfilled", value: true },
    { status: "rejected", reason: error },
  ]);
  assert.equal(sanitized.name, "Error");
  assert.deepEqual(sanitized.classes, ["fetch_failed"]);
  assert.equal(Object.hasOwn(sanitized, "message"), false);
  assert.equal(Object.hasOwn(sanitized, "code"), false);
  assert.equal(sanitized.cause.name, "Error");
  assert.equal(sanitized.cause.code, "UND_ERR_SOCKET");
  assert.deepEqual(sanitized.cause.classes, []);
  assert.equal(formatted.length, 1);
  assert.match(formatted[0], /\[fetch_failed\]/);
  assert.match(formatted[0], /code=UND_ERR_SOCKET/);
  assertNoSensitive(JSON.stringify(sanitized));
  assertNoSensitive(formatted.join(" | "));
});

test("omits payload-bearing code objects and hostile names from diagnostic output", () => {
  const error = new Error("other side closed");
  error.name = `https://example.invalid/path?token=${SYNTHETIC_SECRET}`;
  error.code = { query: `token=${SYNTHETIC_TOKEN}`, payload: { secret: SYNTHETIC_PASSWORD } };
  const sanitized = sanitizeRuntimeError(error);
  assert.equal(sanitized.name, "opaque");
  assert.equal(Object.hasOwn(sanitized, "code"), false);
  assert.deepEqual(sanitized.classes, ["other_side_closed"]);
  assertNoSensitive(JSON.stringify(sanitized));
});

test("omits unknown scalar name and code values, including secret-shaped identifiers, on name, code, and cause", () => {
  const error = new Error("fetch failed");
  error.name = SYNTHETIC_SECRET_NAME;
  error.code = SYNTHETIC_TOKEN;
  error.cause = new Error("other side closed");
  error.cause.name = SYNTHETIC_SECRET_NAME;
  error.cause.code = SYNTHETIC_TOKEN;
  const sanitized = sanitizeRuntimeError(error);
  const formatted = formatSettledRejections([{ status: "rejected", reason: error }]);
  assert.equal(sanitized.name, "opaque");
  assert.equal(Object.hasOwn(sanitized, "code"), false);
  assert.equal(sanitized.cause.name, "opaque");
  assert.equal(Object.hasOwn(sanitized.cause, "code"), false);
  assert.deepEqual(sanitized.classes, ["fetch_failed"]);
  assert.deepEqual(sanitized.cause.classes, ["other_side_closed"]);
  assertNoSensitive(JSON.stringify(sanitized));
  assertNoSensitive(formatted.join(" | "));

  const numbered = new Error("fetch failed");
  numbered.name = "NotAKnownError";
  numbered.code = 42;
  numbered.cause = new Error("other side closed");
  numbered.cause.name = "AlsoUnknown";
  numbered.cause.code = true;
  const unknown = sanitizeRuntimeError(numbered);
  assert.equal(unknown.name, "opaque");
  assert.equal(Object.hasOwn(unknown, "code"), false);
  assert.equal(unknown.cause.name, "opaque");
  assert.equal(Object.hasOwn(unknown.cause, "code"), false);
  assert.equal(JSON.stringify(unknown).includes("NotAKnownError"), false);
  assert.equal(JSON.stringify(unknown).includes("AlsoUnknown"), false);
  assert.equal(JSON.stringify(unknown).includes("42"), false);
});

test("does not invoke hostile getters, toString, or proxy traps while classifying", () => {
  const { error, reads } = throwingGetterError();
  const sanitized = sanitizeRuntimeError(error);
  assert.deepEqual(reads, { name: 0, message: 0, cause: 0, code: 0 });
  assert.equal(sanitized.type, "Error");

  const hostileValue = {
    toString() {
      throw new Error("toString");
    },
    valueOf() {
      throw new Error("valueOf");
    },
  };
  assert.deepEqual(sanitizeRuntimeError(hostileValue), { type: "object", name: "opaque", classes: [] });

  const proxyReads = { get: 0, descriptor: 0, toString: 0 };
  const proxy = new Proxy({}, {
    get(_target, prop) {
      if (prop === "toString") {
        proxyReads.toString += 1;
        throw new Error("proxy toString");
      }
      proxyReads.get += 1;
      throw new Error(`proxy get ${String(prop)}`);
    },
    getOwnPropertyDescriptor() {
      proxyReads.descriptor += 1;
      throw new Error("proxy descriptor");
    },
  });
  assert.doesNotThrow(() => sanitizeRuntimeError(proxy));
  assert.equal(proxyReads.get, 0);
  assert.equal(proxyReads.toString, 0);
  assert.ok(proxyReads.descriptor > 0);
});

test("instrumented operations rethrow the original failure when diagnostics are enabled", async () => {
  const original = secretError();
  const database = failingDatabase(original);
  await withDiagEnv(undefined, async () => {
    const { writes } = await captureStderr(async () => {
      await assert.rejects(database.prepare("SELECT 1").run(), (error) => error === original);
      await assert.rejects(database.batch([]), (error) => error === original);
    });
    const output = writes.join("");
    assert.match(output, /"event":"operation_error"/);
    assert.match(output, /fetch_failed/);
    assertNoSensitive(output);
  });
});

test("opt-out performs zero diagnostic evaluation and still rethrows the original failure", async () => {
  const { error, reads } = throwingGetterError();
  const database = failingDatabase(error);
  await withDiagEnv("0", async () => {
    const { writes } = await captureStderr(async () => {
      await assert.rejects(database.prepare("SELECT 1").run(), (caught) => caught === error);
      await assert.rejects(database.batch([]), (caught) => caught === error);
    });
    assert.deepEqual(writes, []);
    assert.deepEqual(reads, { name: 0, message: 0, cause: 0, code: 0 });
  });
});

test("vite close failure still disposes miniflare and preserves the vite error", async () => {
  const viteError = new Error("vite close failed");
  let disposed = false;
  await assert.rejects(
    disposeFixtureRuntime(
      { close: async () => { throw viteError; } },
      { dispose: async () => { disposed = true; } },
    ),
    (error) => error === viteError,
  );
  assert.equal(disposed, true);
});

test("cleanup errors: miniflare dispose failure is thrown after both cleanups run", async () => {
  const viteError = new Error("vite close failed");
  const miniflareError = new Error("miniflare dispose failed");
  const seen = { vite: false, miniflare: false };
  await assert.rejects(
    disposeFixtureRuntime(
      { close: async () => { seen.vite = true; throw viteError; } },
      { dispose: async () => { seen.miniflare = true; throw miniflareError; } },
    ),
    (error) => error === miniflareError,
  );
  assert.deepEqual(seen, { vite: true, miniflare: true });
});

test("cleanup errors: a successful vite close still surfaces a miniflare dispose failure", async () => {
  const miniflareError = new Error("miniflare dispose failed");
  let closed = false;
  await assert.rejects(
    disposeFixtureRuntime(
      { close: async () => { closed = true; } },
      { dispose: async () => { throw miniflareError; } },
    ),
    (error) => error === miniflareError,
  );
  assert.equal(closed, true);
});
