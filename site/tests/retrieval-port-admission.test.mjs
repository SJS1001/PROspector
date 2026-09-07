import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

/**
 * Phase 4 retrieval-seam admission control.
 *
 * Every case here is pure and synthetic: no D1 fixture, no provider, no
 * credential, no scheduler, and no network. The suite proves that the
 * fail-closed retrieval port refuses an unsafe request before any adapter is
 * reachable and refuses an unsafe adapter answer before it could become
 * evidence. It activates no retrieval capability and grants no hosted,
 * provider, runner, or outbound authority.
 */

const moduleUrl = new URL("../domain/ports/retrieval.ts", import.meta.url);

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    return { vite, retrieval: await vite.ssrLoadModule(moduleUrl.pathname) };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

const DIGEST = "0123456789abcdef".repeat(4);

function baseRequest(overrides = {}) {
  return {
    url: "https://sources.example.invalid/report",
    expectedMimeTypes: ["text/html"],
    maximumBytes: 250_000,
    maximumRedirects: 2,
    timeoutMs: 5_000,
    ...overrides,
  };
}

function baseDocument(overrides = {}) {
  return {
    finalUrl: "https://sources.example.invalid/report",
    mimeType: "text/html",
    contentDigest: DIGEST,
    extractedText: "Northstar Bulk Terminal announced a new intake operation.",
    ...overrides,
  };
}

function rejects(retrieval, call, rule, label) {
  assert.throws(call, (error) => {
    assert.ok(error instanceof retrieval.RetrievalAdmissionError, `${label} must fail closed, got ${error}`);
    assert.equal(error.code, "retrieval_admission_rejected", label);
    assert.equal(error.rule, rule, `${label} must name rule ${rule}, got ${error.rule}`);
    return true;
  }, label);
}

test("retrieval admission binds every safe-adapter requirement to an enforced rule", async () => {
  const { vite, retrieval } = await load();
  try {
    const requirements = [...retrieval.SAFE_RETRIEVAL_REQUIREMENTS];
    assert.deepEqual(Object.keys(retrieval.RETRIEVAL_ADMISSION_RULES).sort(), [...requirements].sort());
    for (const requirement of requirements) {
      const rules = retrieval.RETRIEVAL_ADMISSION_RULES[requirement];
      assert.ok(Array.isArray(rules) && rules.length > 0, `${requirement} must name an enforcing rule`);
      assert.ok(Object.isFrozen(rules), `${requirement} rule list must be immutable`);
    }
    assert.ok(Object.isFrozen(retrieval.RETRIEVAL_ADMISSION_RULES));
  } finally {
    await vite.close();
  }
});

test("a bounded synthetic request is admitted deterministically with explicit resolved caps", async () => {
  const { vite, retrieval } = await load();
  try {
    const admitted = retrieval.admitRetrievalRequest(baseRequest({ url: "https://sources.example.invalid/report#section" }));
    assert.deepEqual({ ...admitted }, {
      url: "https://sources.example.invalid/report",
      expectedMimeTypes: ["text/html"],
      maximumBytes: 250_000,
      maximumRedirects: 2,
      timeoutMs: 5_000,
      maximumDecompressedBytes: 250_000,
    });
    assert.ok(Object.isFrozen(admitted));
    // Replay is byte-stable and independent of the caller's property order.
    const replay = retrieval.admitRetrievalRequest({
      timeoutMs: 5_000, maximumRedirects: 2, maximumBytes: 250_000,
      expectedMimeTypes: ["text/html"], url: "https://sources.example.invalid/report",
    });
    assert.deepEqual({ ...replay }, { ...admitted });
    const multiple = retrieval.admitRetrievalRequest(baseRequest({ expectedMimeTypes: ["text/plain", "application/json"] }));
    assert.deepEqual(multiple.expectedMimeTypes, ["application/json", "text/plain"]);
  } finally {
    await vite.close();
  }
});

test("only https source URLs without embedded credentials are admitted", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const url of [
      "http://sources.example.invalid/report",
      "ftp://sources.example.invalid/report",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
      "javascript:alert(1)",
      "blob:https://sources.example.invalid/1",
    ]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ url })), "request.url.scheme", url);
    }
    for (const url of [
      "https://operator:secret@sources.example.invalid/report",
      "https://operator@sources.example.invalid/report",
    ]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ url })), "request.url.credentials", url);
    }
    for (const url of ["", "   ", " https://sources.example.invalid/report", `https://sources.example.invalid/${"a".repeat(2100)}`, "not-a-url", "https://sources.example.7/report"]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ url })), "request.url", JSON.stringify(url));
    }
    rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ url: 42 })), "request.url", "non-string url");
  } finally {
    await vite.close();
  }
});

test("address literals, private name spaces, and explicit ports are refused as source hosts", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const url of [
      "https://127.0.0.1/report",
      "https://10.0.0.5/report",
      "https://169.254.169.254/latest/meta-data",
      "https://203.0.113.7/report",
      "https://[::1]/report",
      "https://[fd00::1]/report",
      "https://localhost/report",
      "https://runner.local/report",
      "https://metadata.internal/report",
      "https://vault.corp/report",
      "https://service.lan/report",
      "https://hidden.onion/report",
      "https://sources/report",
      "https://sources.example.invalid./report",
      "https://sources..invalid/report",
      "https://-sources.example.invalid/report",
    ]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ url })), "request.url.host", url);
    }
    for (const url of ["https://sources.example.invalid:8443/report", "https://sources.example.invalid:80/report"]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ url })), "request.url.host", url);
    }
    // The default https port is normalized away rather than carried through.
    assert.equal(retrieval.admitRetrievalRequest(baseRequest({ url: "https://sources.example.invalid:443/report" })).url,
      "https://sources.example.invalid/report");
  } finally {
    await vite.close();
  }
});

test("the request shape is closed against cookies, credentials, and browser authority", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const extra of [
      { cookies: "session=1" },
      { headers: { authorization: "Bearer x" } },
      { credentials: "include" },
      { proxy: "https://proxy.example.invalid" },
      { browserProfile: "default" },
      { allowPrivateNetwork: true },
      { followRedirects: true },
    ]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest(extra)), "request.shape", Object.keys(extra)[0]);
    }
    for (const value of [null, undefined, "request", 7, [], [baseRequest()]]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(value), "request.shape", JSON.stringify(value) ?? "undefined");
    }
  } finally {
    await vite.close();
  }
});

test("expected media types come from a closed allowlist without wildcards or parameters", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const expectedMimeTypes of [
      [], ["*/*"], ["text/*"], ["TEXT/HTML"], ["text/html; charset=utf-8"], [" text/html"],
      ["application/pdf"], ["application/octet-stream"], ["image/png"], ["text/javascript"],
      ["text/html", "text/html"], ["text/html", null], "text/html", null,
      ["text/plain", "text/html", "application/json", "application/xhtml+xml", "text/plain"],
    ]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ expectedMimeTypes })), "request.expectedMimeTypes", JSON.stringify(expectedMimeTypes) ?? "null");
    }
  } finally {
    await vite.close();
  }
});

test("byte, redirect, timeout, and decompression bounds fail closed outside their caps", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const maximumBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 5_000_001, "250000", null]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ maximumBytes })), "request.maximumBytes", String(maximumBytes));
    }
    for (const maximumRedirects of [-1, 4, 1.5, "2", null]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ maximumRedirects })), "request.maximumRedirects", String(maximumRedirects));
    }
    for (const timeoutMs of [0, -1, 15_001, 1.5, "5000", null]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ timeoutMs })), "request.timeoutMs", String(timeoutMs));
    }
    // A decompression bound may never be smaller than the transfer bound, exceed
    // the absolute cap, or imply an unbounded expansion ratio.
    for (const maximumDecompressedBytes of [249_999, 0, -1, 1.5, 20_000_001, 250_000 * 21, "500000", null]) {
      rejects(retrieval, () => retrieval.admitRetrievalRequest(baseRequest({ maximumDecompressedBytes })), "request.maximumDecompressedBytes", String(maximumDecompressedBytes));
    }
    assert.equal(retrieval.admitRetrievalRequest(baseRequest({ maximumDecompressedBytes: 250_000 * 20 })).maximumDecompressedBytes, 5_000_000);
    assert.equal(retrieval.admitRetrievalRequest(baseRequest({ maximumRedirects: 0 })).maximumRedirects, 0);
  } finally {
    await vite.close();
  }
});

test("public routability is classified fail-closed for every reserved range", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const address of ["93.184.216.34", "8.8.8.8", "1.1.1.1", "172.32.0.1", "192.0.1.1", "2606:2800:220:1:248:1893:25c8:1946", "2001:db8::1"]) {
      assert.equal(retrieval.isPubliclyRoutableAddress(address), true, `${address} is publicly routable`);
    }
    for (const address of [
      "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
      "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
      "224.0.0.1", "240.0.0.1", "255.255.255.255", "256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5",
      "::", "::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
      "1200::AB00:1234::2552:7777:1313", "gggg::1", "", "   ", "example.invalid", null, undefined, 42, {},
    ]) {
      assert.equal(retrieval.isPubliclyRoutableAddress(address), false, `${String(address)} must not be treated as publicly routable`);
    }
  } finally {
    await vite.close();
  }
});

test("only a pinned, deduplicated, publicly routable address set is admitted", async () => {
  const { vite, retrieval } = await load();
  try {
    const pinned = retrieval.admitResolvedAddresses(["93.184.216.34", "8.8.8.8"]);
    assert.deepEqual([...pinned], ["8.8.8.8", "93.184.216.34"]);
    assert.ok(Object.isFrozen(pinned));
    for (const value of [[], null, "93.184.216.34", {}, Array.from({ length: 9 }, (_unused, index) => `93.184.216.${index + 1}`)]) {
      rejects(retrieval, () => retrieval.admitResolvedAddresses(value), "address.pinned", JSON.stringify(value) ?? "null");
    }
    rejects(retrieval, () => retrieval.admitResolvedAddresses(["93.184.216.34", "93.184.216.34"]), "address.pinned", "duplicate address");
    for (const value of [["127.0.0.1"], ["93.184.216.34", "169.254.169.254"], ["fd00::1"], [null], ["example.invalid"]]) {
      rejects(retrieval, () => retrieval.admitResolvedAddresses(value), "address.public", JSON.stringify(value));
    }
  } finally {
    await vite.close();
  }
});

test("a retrieved document is admitted only against its exact admitted request", async () => {
  const { vite, retrieval } = await load();
  try {
    const request = retrieval.admitRetrievalRequest(baseRequest());
    const document = retrieval.admitRetrievedDocument(request, baseDocument());
    assert.deepEqual({ ...document }, baseDocument());
    assert.ok(Object.isFrozen(document));

    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ mimeType: "text/plain" })), "document.mimeType", "unexpected media type");
    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ mimeType: "text/html; charset=utf-8" })), "document.mimeType", "parameterised media type");
    for (const contentDigest of ["", "abc", DIGEST.toUpperCase(), `${DIGEST}0`, 42, null]) {
      rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ contentDigest })), "document.contentDigest", String(contentDigest));
    }
    for (const finalUrl of ["http://sources.example.invalid/report", "data:text/plain,x"]) {
      rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ finalUrl })), "document.finalUrl.scheme", finalUrl);
    }
    for (const finalUrl of ["https://169.254.169.254/latest", "https://metadata.internal/report"]) {
      rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ finalUrl })), "document.finalUrl.host", finalUrl);
    }
    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ redirectChain: [] })), "document.shape", "unknown document property");
    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, null), "document.shape", "null document");

    // A request that forbids redirects also forbids a moved final URL.
    const noRedirect = retrieval.admitRetrievalRequest(baseRequest({ maximumRedirects: 0 }));
    assert.equal(retrieval.admitRetrievedDocument(noRedirect, baseDocument()).finalUrl, "https://sources.example.invalid/report");
    rejects(retrieval, () => retrieval.admitRetrievedDocument(noRedirect, baseDocument({ finalUrl: "https://mirror.example.invalid/report" })), "document.finalUrl.redirect", "unauthorized redirect");
    // A request is re-admitted, so a forged bound cannot widen the document check.
    rejects(retrieval, () => retrieval.admitRetrievedDocument({ ...baseRequest(), maximumBytes: 9_000_000, maximumDecompressedBytes: 9_000_000 }, baseDocument()), "request.maximumBytes", "forged request bound");
  } finally {
    await vite.close();
  }
});

test("extracted text must be bounded, inert, and already escaped", async () => {
  const { vite, retrieval } = await load();
  try {
    const request = retrieval.admitRetrievalRequest(baseRequest({ maximumBytes: 64 }));
    assert.equal(retrieval.admitRetrievedDocument(request, baseDocument({ extractedText: "Intake up 12&#39;000 t &amp; rising &lt;planned&gt;" })).extractedText,
      "Intake up 12&#39;000 t &amp; rising &lt;planned&gt;");
    assert.equal(retrieval.admitRetrievedDocument(request, baseDocument({ extractedText: "" })).extractedText, "");

    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ extractedText: "x".repeat(65) })), "document.extractedText.bytes", "oversize text");
    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ extractedText: "é".repeat(33) })), "document.extractedText.bytes", "oversize multibyte text");
    for (const extractedText of ["a\u0000b", "a\u0007b", "a\u001Fb", "a\u007Fb", "a\rb"]) {
      rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ extractedText })), "document.extractedText.control", JSON.stringify(extractedText));
    }
    for (const extractedText of ["<script>alert(1)</script>", "a > b", 'say "yes"', "it's here", "Bulk & ore", "&nbsp;", "&#x27;"]) {
      rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ extractedText })), "document.extractedText.escaped", extractedText);
    }
    rejects(retrieval, () => retrieval.admitRetrievedDocument(request, baseDocument({ extractedText: 42 })), "document.extractedText", "non-string text");
    // Tab and newline remain legitimate extracted whitespace.
    assert.equal(retrieval.admitRetrievedDocument(request, baseDocument({ extractedText: "line\tone\nline two" })).extractedText, "line\tone\nline two");
  } finally {
    await vite.close();
  }
});

test("the guarded port admits before an adapter is reachable and after it answers", async () => {
  const { vite, retrieval } = await load();
  try {
    const calls = [];
    const adapter = { async retrieve(request) { calls.push(request); return baseDocument(); } };
    const port = retrieval.createGuardedRetrievalPort(adapter);

    await assert.rejects(() => port.retrieve(baseRequest({ url: "http://sources.example.invalid/report" })), /retrieval_admission_rejected/);
    await assert.rejects(() => port.retrieve(baseRequest({ url: "https://169.254.169.254/latest" })), /retrieval_admission_rejected/);
    await assert.rejects(() => port.retrieve(baseRequest({ cookies: "session=1" })), /retrieval_admission_rejected/);
    assert.equal(calls.length, 0, "an inadmissible request must never reach an adapter");

    const document = await port.retrieve(baseRequest());
    assert.deepEqual({ ...document }, baseDocument());
    assert.equal(calls.length, 1);
    // The adapter receives the admitted request, never the caller's raw object.
    assert.equal(calls[0].maximumDecompressedBytes, 250_000);
    assert.ok(Object.isFrozen(calls[0]));

    const hostile = retrieval.createGuardedRetrievalPort({
      async retrieve() { return { ...baseDocument({ extractedText: "<script>alert(1)</script>" }), cookies: "session=1" }; },
    });
    await assert.rejects(() => hostile.retrieve(baseRequest()), (error) => {
      assert.equal(error.code, "retrieval_admission_rejected");
      assert.equal(error.rule, "document.shape");
      return true;
    });

    for (const invalid of [null, undefined, {}, { retrieve: 1 }, "adapter"]) {
      rejects(retrieval, () => retrieval.createGuardedRetrievalPort(invalid), "adapter.shape", String(invalid));
    }
  } finally {
    await vite.close();
  }
});

test("guarding the reject-only port still refuses and no admission path performs I/O", async () => {
  const { vite, retrieval } = await load();
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts += 1; throw new Error("network_forbidden_in_admission_tests"); };
  try {
    const guarded = retrieval.createGuardedRetrievalPort(retrieval.createRejectOnlyRetrievalPort());
    await assert.rejects(() => guarded.retrieve(baseRequest()), /retrieval_capability_unavailable/);

    const request = retrieval.admitRetrievalRequest(baseRequest());
    retrieval.admitRetrievedDocument(request, baseDocument());
    retrieval.admitResolvedAddresses(["93.184.216.34"]);
    retrieval.isPubliclyRoutableAddress("93.184.216.34");
    assert.equal(networkAttempts, 0, "admission must never open a connection");
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test("production runtime composes no retrieval adapter", async () => {
  const sources = await runtimeSourceUrls();
  const composing = [];
  for (const url of sources) {
    if (url.pathname === moduleUrl.pathname) continue;
    const source = await readFile(url, "utf8");
    if (/createGuardedRetrievalPort\s*\(/u.test(source)) composing.push(url.pathname);
  }
  assert.deepEqual(composing, [], "no runtime module may compose a retrieval adapter before its capability gate");

  const port = await readFile(moduleUrl, "utf8");
  for (const forbidden of [/\bfetch\s*\(/u, /node:https?/u, /\bXMLHttpRequest\b/u, /\bconnect\s*\(/u]) {
    assert.doesNotMatch(port, forbidden, `the retrieval seam must contain no transport (${forbidden})`);
  }
});

async function runtimeSourceUrls(directory = new URL("../", import.meta.url)) {
  const ignored = new Set([".next", ".wrangler", "dist", "node_modules", "tests"]);
  const urls = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) urls.push(...await runtimeSourceUrls(url));
    else if (/\.(?:c|m)?(?:j|t)sx?$/u.test(entry.name)) urls.push(url);
  }
  return urls;
}
