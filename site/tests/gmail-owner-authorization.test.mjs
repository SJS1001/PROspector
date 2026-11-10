import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";

// Plan 06-05 Task 2: the owner Gmail authorization validator. Everything here
// is synthetic and local: no provider endpoint, no client configuration, no
// authorization code, no network, and no route. A success result is metadata
// only and never enables sending; the MailPort adapter stays reject-only.

const root = resolve(import.meta.dirname, "..");
const MODULE_PATH = new URL("../adapters/gmail-owner-authorization.ts", import.meta.url).pathname;

// RFC 7636 Appendix B known-answer vector.
const RFC7636_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC7636_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const ISSUED_AT = 1_900_000_000_000;
const TTL_MS = 5 * 60 * 1000;
const REDIRECT_URI = "https://prospector.invalid/owner/mail-connection/callback";
const STATE = `synthetic_state_${"S".repeat(40)}`;
const NONCE = `synthetic_nonce_${"N".repeat(40)}`;

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, auth: await vite.ssrLoadModule(MODULE_PATH) };
  } catch (error) {
    // Close the dev server on a load failure so a RED run exits instead of hanging.
    await vite.close();
    throw error;
  }
}

async function withModule(run) {
  const { vite, auth } = await load();
  try {
    await run(auth);
  } finally {
    await vite.close();
  }
}

function beginInput(overrides = {}) {
  return {
    workspaceId: "synthetic-workspace",
    principalId: "synthetic-owner",
    attemptId: "synthetic-attempt-1",
    redirectUri: REDIRECT_URI,
    state: STATE,
    nonce: NONCE,
    codeVerifier: RFC7636_VERIFIER,
    issuedAt: ISSUED_AT,
    ttlMs: TTL_MS,
    pinnedSubject: null,
    ...overrides,
  };
}

function completionInput(overrides = {}) {
  return {
    workspaceId: "synthetic-workspace",
    principalId: "synthetic-owner",
    state: STATE,
    nonce: NONCE,
    redirectUri: REDIRECT_URI,
    codeVerifier: RFC7636_VERIFIER,
    grantedScopes: ["gmail.send", "gmail.readonly"],
    subject: "100000000000000000001",
    receivedAt: ISSUED_AT + 1_000,
    ...overrides,
  };
}

async function begun(auth, overrides = {}) {
  const ledger = auth.createOwnerMailAuthorizationLedger();
  const challenge = await ledger.begin(beginInput(overrides));
  assert.equal(challenge.status, "pending");
  return ledger;
}

function assertRefused(result, reason) {
  assert.deepEqual(result, { status: "refused", reason, providerCalls: 0, sendingEnabled: false });
  assert.equal(Object.isFrozen(result), true);
}

test("S256 challenge derivation matches the RFC 7636 vector and refuses malformed verifiers", async () => {
  await withModule(async (auth) => {
    assert.equal(await auth.deriveS256CodeChallenge(RFC7636_VERIFIER), RFC7636_CHALLENGE);
    assert.equal(await auth.verifyS256CodeChallenge(RFC7636_VERIFIER, RFC7636_CHALLENGE), true);
    assert.equal(await auth.verifyS256CodeChallenge(`${RFC7636_VERIFIER.slice(0, -1)}Y`, RFC7636_CHALLENGE), false);
    assert.equal(await auth.verifyS256CodeChallenge(RFC7636_VERIFIER, `${RFC7636_CHALLENGE.slice(0, -1)}N`), false);
    // A "plain" challenge (verifier presented as its own challenge) is never accepted.
    assert.equal(await auth.verifyS256CodeChallenge(RFC7636_VERIFIER, RFC7636_VERIFIER), false);
    for (const verifier of [
      "a".repeat(42),
      "a".repeat(129),
      `${"a".repeat(42)}+`,
      `${"a".repeat(42)}=`,
      `${"a".repeat(42)} `,
      42,
      null,
      undefined,
    ]) {
      await assert.rejects(auth.deriveS256CodeChallenge(verifier), /pkce_verifier_invalid/u);
      assert.equal(await auth.verifyS256CodeChallenge(verifier, RFC7636_CHALLENGE), false);
    }
    // RFC 7636 unreserved characters are accepted at both length bounds.
    await auth.deriveS256CodeChallenge(`${"A".repeat(39)}-._~`);
    await auth.deriveS256CodeChallenge("z".repeat(128));
  });
});

test("begin returns only a public S256 challenge projection and never the raw state, nonce, or verifier", async () => {
  await withModule(async (auth) => {
    const ledger = auth.createOwnerMailAuthorizationLedger();
    const challenge = await ledger.begin(beginInput());
    assert.deepEqual(challenge, {
      status: "pending",
      attemptId: "synthetic-attempt-1",
      redirectUri: REDIRECT_URI,
      codeChallenge: RFC7636_CHALLENGE,
      codeChallengeMethod: "S256",
      scopes: ["gmail.readonly", "gmail.send"],
      expiresAt: ISSUED_AT + TTL_MS,
      providerCalls: 0,
    });
    assert.equal(Object.isFrozen(challenge), true);
    assert.equal(Object.isFrozen(challenge.scopes), true);
    const serialized = JSON.stringify(challenge);
    assert.equal(serialized.includes(STATE), false);
    assert.equal(serialized.includes(NONCE), false);
    assert.equal(serialized.includes(RFC7636_VERIFIER), false);
    assert.deepEqual([...auth.OWNER_MAIL_AUTHORIZATION_SCOPES], ["gmail.readonly", "gmail.send"]);
    assert.equal(Object.isFrozen(auth.OWNER_MAIL_AUTHORIZATION_SCOPES), true);
  });
});

test("begin refuses malformed, low-entropy, over-long-lived, or duplicate attempts", async () => {
  await withModule(async (auth) => {
    const ledger = auth.createOwnerMailAuthorizationLedger();
    for (const overrides of [
      { state: "short-state" },
      { state: `${"s".repeat(42)}.` },
      { nonce: "short-nonce" },
      { codeVerifier: "short-verifier" },
      { workspaceId: "" },
      { principalId: "has spaces in it" },
      { attemptId: 7 },
      { issuedAt: -1 },
      { issuedAt: 1.5 },
      { ttlMs: 0 },
      { ttlMs: auth.OWNER_MAIL_AUTHORIZATION_MAX_TTL_MS + 1 },
      // NaN passes both range comparisons; without the integer guard the
      // expiry would become NaN and the attempt would never expire.
      { ttlMs: Number.NaN },
      { ttlMs: 1.5 },
      { ttlMs: Number.POSITIVE_INFINITY },
      { ttlMs: "300000" },
      { pinnedSubject: "" },
      { redirectUri: "not a url" },
      { redirectUri: "http://prospector.invalid/owner/mail-connection/callback" },
      { redirectUri: `${REDIRECT_URI}#fragment` },
      // An empty fragment parses to hash "" and href === value, so only the
      // raw "#" check refuses it.
      { redirectUri: `${REDIRECT_URI}#` },
      // Over the 2048-character registration cap, otherwise canonical.
      { redirectUri: `https://prospector.invalid/${"a".repeat(2048)}` },
      { redirectUri: "https://user:pass@prospector.invalid/callback" },
      { redirectUri: "HTTPS://Prospector.Invalid/owner/mail-connection/callback" },
      { redirectUri: "javascript:alert(1)" },
    ]) {
      assertRefused(await ledger.begin(beginInput(overrides)), "input_invalid");
    }
    const extra = { ...beginInput(), extra: true };
    assertRefused(await ledger.begin(extra), "input_invalid");
    const missing = beginInput();
    delete missing.nonce;
    assertRefused(await ledger.begin(missing), "input_invalid");

    // Loopback http redirect is accepted for local development only.
    const loopback = await ledger.begin(beginInput({
      attemptId: "synthetic-attempt-loopback",
      state: `loopback_state_${"L".repeat(40)}`,
      redirectUri: "http://127.0.0.1:8787/owner/mail-connection/callback",
    }));
    assert.equal(loopback.status, "pending");

    // A canonical redirect URI of exactly 2048 characters is still registrable.
    const atCapUri = `https://prospector.invalid/${"c".repeat(2048 - "https://prospector.invalid/".length)}`;
    assert.equal(atCapUri.length, 2048);
    const atCap = await ledger.begin(beginInput({
      attemptId: "synthetic-attempt-at-cap",
      state: `atcap_state_${"C".repeat(40)}`,
      redirectUri: atCapUri,
    }));
    assert.equal(atCap.status, "pending");

    assert.equal((await ledger.begin(beginInput())).status, "pending");
    assertRefused(await ledger.begin(beginInput()), "attempt_duplicate");
    assertRefused(await ledger.begin(beginInput({ attemptId: "synthetic-attempt-2" })), "attempt_duplicate");
    assertRefused(
      await ledger.begin(beginInput({ state: `other_state_${"O".repeat(40)}` })),
      "attempt_duplicate",
    );
  });
});

test("an exactly bound completion authorizes metadata only, with zero provider calls and sending disabled", async () => {
  await withModule(async (auth) => {
    const previousFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("network_tripwire");
    };
    try {
      const ledger = await begun(auth);
      const result = await ledger.complete(completionInput());
      assert.deepEqual(result, {
        status: "authorized",
        workspaceId: "synthetic-workspace",
        principalId: "synthetic-owner",
        attemptId: "synthetic-attempt-1",
        subject: "100000000000000000001",
        scopes: ["gmail.readonly", "gmail.send"],
        authorizedAt: ISSUED_AT + 1_000,
        providerCalls: 0,
        sendingEnabled: false,
      });
      assert.equal(Object.isFrozen(result), true);
      assert.equal(Object.isFrozen(result.scopes), true);
      const serialized = JSON.stringify(result);
      for (const raw of [STATE, NONCE, RFC7636_VERIFIER]) assert.equal(serialized.includes(raw), false);
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

test("state is single-use: a replayed or unknown state is refused, even after a refused first use", async () => {
  await withModule(async (auth) => {
    const ledger = await begun(auth);
    assert.equal((await ledger.complete(completionInput())).status, "authorized");
    assertRefused(await ledger.complete(completionInput()), "state_replayed");
    assertRefused(
      await ledger.complete(completionInput({ state: `unknown_state_${"U".repeat(40)}` })),
      "state_unknown",
    );

    // A failed first completion still burns the state, so a corrected retry cannot reuse it.
    const burned = await begun(auth);
    assertRefused(await burned.complete(completionInput({ redirectUri: `${REDIRECT_URI}/` })), "redirect_mismatch");
    assertRefused(await burned.complete(completionInput()), "state_replayed");

    // A state cannot be re-registered after it was consumed.
    assertRefused(await burned.begin(beginInput({ attemptId: "synthetic-attempt-again" })), "attempt_duplicate");

    // Concurrent completions with one state yield exactly one authorization.
    const raced = await begun(auth);
    const results = await Promise.all([
      raced.complete(completionInput()),
      raced.complete(completionInput()),
      raced.complete(completionInput()),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["authorized", "refused", "refused"]);
    assert.deepEqual(results.filter((r) => r.status === "refused").map((r) => r.reason), ["state_replayed", "state_replayed"]);
  });
});

test("the attempt expires at issuedAt + ttl and refuses completions from before it was issued", async () => {
  await withModule(async (auth) => {
    const atEdge = await begun(auth);
    assert.equal((await atEdge.complete(completionInput({ receivedAt: ISSUED_AT + TTL_MS - 1 }))).status, "authorized");
    const expired = await begun(auth);
    assertRefused(await expired.complete(completionInput({ receivedAt: ISSUED_AT + TTL_MS })), "attempt_expired");
    assertRefused(await expired.complete(completionInput()), "state_replayed");
    const early = await begun(auth);
    assertRefused(await early.complete(completionInput({ receivedAt: ISSUED_AT - 1 })), "attempt_expired");
  });
});

test("the completion must come from the same workspace and principal that began it", async () => {
  await withModule(async (auth) => {
    for (const overrides of [{ workspaceId: "synthetic-workspace-other" }, { principalId: "synthetic-owner-other" }]) {
      const ledger = await begun(auth);
      assertRefused(await ledger.complete(completionInput(overrides)), "principal_mismatch");
    }
  });
});

test("the redirect URI must match the registered value byte for byte", async () => {
  await withModule(async (auth) => {
    for (const redirectUri of [
      `${REDIRECT_URI}/`,
      `${REDIRECT_URI}?x=1`,
      REDIRECT_URI.toUpperCase(),
      "https://prospector.invalid/owner/mail-connection/Callback",
      "https://prospector.invalid:443/owner/mail-connection/callback",
      "https://attacker.invalid/owner/mail-connection/callback",
      "http://prospector.invalid/owner/mail-connection/callback",
      `${REDIRECT_URI}#`,
    ]) {
      const ledger = await begun(auth);
      assertRefused(await ledger.complete(completionInput({ redirectUri })), "redirect_mismatch");
    }
  });
});

test("the PKCE verifier must hash to the stored S256 challenge", async () => {
  await withModule(async (auth) => {
    const ledger = await begun(auth);
    assertRefused(
      await ledger.complete(completionInput({ codeVerifier: `${"x".repeat(43)}` })),
      "pkce_mismatch",
    );
    // A malformed verifier is refused as input before the state is looked up, so it
    // cannot succeed and does not consume the attempt.
    const malformed = await begun(auth);
    assertRefused(await malformed.complete(completionInput({ codeVerifier: "short" })), "input_invalid");
    assert.equal((await malformed.complete(completionInput())).status, "authorized");
  });
});

test("the nonce must match the one bound at begin", async () => {
  await withModule(async (auth) => {
    const ledger = await begun(auth);
    assertRefused(await ledger.complete(completionInput({ nonce: `other_nonce_${"Q".repeat(40)}` })), "nonce_mismatch");
  });
});

test("the granted scope set must be exactly gmail.send and gmail.readonly", async () => {
  await withModule(async (auth) => {
    const orderSwapped = await begun(auth);
    assert.equal(
      (await orderSwapped.complete(completionInput({ grantedScopes: ["gmail.readonly", "gmail.send"] }))).status,
      "authorized",
    );
    for (const grantedScopes of [
      [],
      ["gmail.send"],
      ["gmail.readonly"],
      ["gmail.send", "gmail.readonly", "gmail.modify"],
      ["gmail.send", "gmail.readonly", "openid"],
      ["gmail.send", "gmail.send"],
      ["gmail.send", "gmail.readonly", "gmail.readonly"],
      ["Gmail.Send", "gmail.readonly"],
      ["gmail.send ", "gmail.readonly"],
      ["mail.google.com", "gmail.readonly"],
    ]) {
      const ledger = await begun(auth);
      assertRefused(await ledger.complete(completionInput({ grantedScopes })), "scope_mismatch");
    }
    const notArray = await begun(auth);
    assertRefused(await notArray.complete(completionInput({ grantedScopes: "gmail.send gmail.readonly" })), "input_invalid");
  });
});

test("a pinned subject refuses an account swap, while an unpinned first connection records the subject", async () => {
  await withModule(async (auth) => {
    const pinned = await begun(auth, { pinnedSubject: "100000000000000000001" });
    assertRefused(await pinned.complete(completionInput({ subject: "100000000000000000002" })), "subject_mismatch");
    const pinnedOk = await begun(auth, { pinnedSubject: "100000000000000000001" });
    assert.equal((await pinnedOk.complete(completionInput())).subject, "100000000000000000001");
  });
});

test("hostile or malformed completion inputs are refused without throwing or running getters", async () => {
  await withModule(async (auth) => {
    const ledger = await begun(auth);
    let inspected = 0;
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        inspected += 1;
        throw new Error("hostile_proxy");
      },
      ownKeys() {
        inspected += 1;
        throw new Error("hostile_proxy");
      },
    });
    const getterBacked = completionInput();
    Object.defineProperty(getterBacked, "subject", {
      enumerable: true,
      get() {
        inspected += 1;
        throw new Error("getter_must_not_run");
      },
    });
    const getterScopes = completionInput();
    const scopes = ["gmail.send"];
    Object.defineProperty(scopes, "1", {
      enumerable: true,
      get() {
        inspected += 1;
        return "gmail.readonly";
      },
    });
    getterScopes.grantedScopes = scopes;
    const symbol = Symbol("unknown");
    for (const input of [
      undefined,
      null,
      "string",
      [],
      {},
      Object.create({ inherited: true }),
      { ...completionInput(), extra: true },
      { ...completionInput(), [symbol]: true },
      { ...completionInput(), receivedAt: Number.NaN },
      { ...completionInput(), subject: "" },
    ]) {
      assertRefused(await ledger.complete(input), "input_invalid");
    }
    assertRefused(await ledger.complete(hostile), "input_invalid");
    assertRefused(await ledger.complete(getterBacked), "input_invalid");
    assertRefused(await ledger.complete(getterScopes), "input_invalid");
    // Malformed input is refused before the state is looked up, so it cannot
    // succeed and leaves the pending attempt for the well-formed completion.
    assert.equal((await ledger.complete(completionInput())).status, "authorized");
    assertRefused(await ledger.complete(completionInput()), "state_replayed");
    assert.equal(inspected <= 1, true, "a proxy trap may run once; data getters must never run");
  });
});

test("the validator source is pure, local, unrouted, and the MailPort adapter stays reject-only", async () => {
  const source = await readFile(MODULE_PATH, "utf8");
  for (const forbidden of [
    /\bfetch\b/u,
    /https?:\/\//u,
    /googleapis/u,
    /accounts\.google/u,
    /\bGMAIL_[A-Z]/u,
    /process\.env/u,
    /client_?secret/iu,
    /refresh_?token/iu,
    /access_?token/iu,
    /^\s*import\s/mu,
    /\bimport\s*\(/u,
    /\brequire\s*\(/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

  const adapter = await readFile(new URL("../adapters/gmail.ts", import.meta.url), "utf8");
  assert.doesNotMatch(adapter, /gmail-owner-authorization/u);

  // No production module composes the validator yet: no route, worker, or domain service.
  const productionFiles = [
    ...(await sourceFiles(join(root, "app"))),
    ...(await sourceFiles(join(root, "domain"))),
    ...(await sourceFiles(join(root, "adapters"))),
    ...(await sourceFiles(join(root, "worker"), { optional: true })),
  ].filter((file) => file !== MODULE_PATH);
  for (const file of productionFiles) {
    assert.doesNotMatch(await readFile(file, "utf8"), /gmail-owner-authorization/u, `${file} must not wire the validator`);
  }

  const { vite } = await load();
  try {
    const gmail = await vite.ssrLoadModule(new URL("../adapters/gmail.ts", import.meta.url).pathname);
    assert.equal(gmail.UNCONFIGURED_GMAIL_ADAPTER.state, "UNCONFIGURED");
    assert.equal(gmail.UNCONFIGURED_GMAIL_ADAPTER.providerInvocationCount, 0);
  } finally {
    await vite.close();
  }
});

async function sourceFiles(directory, { optional = false } = {}) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (optional && error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}
