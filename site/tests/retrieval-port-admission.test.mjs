import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const PORT_PATH = join(root, "domain", "ports", "retrieval.ts");
const START = 1_900_000_000_000;

const vite = await createServer({ configFile: false, logLevel: "silent" });
const port = await vite.ssrLoadModule(PORT_PATH);
test.after(() => vite.close());

function request(patch = {}) {
  return {
    url: "https://sources.example.com/report",
    expectedMimeTypes: ["text/plain"],
    maximumBytes: 4_096,
    maximumDecompressedBytes: 16_384,
    maximumRedirects: 2,
    timeoutMs: 5_000,
    ...patch,
  };
}

function outcome(patch = {}) {
  const base = {
    document: {
      finalUrl: "https://cdn.example.org/report.txt",
      mimeType: "text/plain",
      contentDigest: "a".repeat(64),
      extractedText: "Bounded &amp; escaped synthetic excerpt",
    },
    evidence: {
      hops: [
        { url: "https://sources.example.com/report", resolvedAddresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"], pinnedAddress: "93.184.216.34", status: 301, observedAt: START + 1 },
        { url: "https://cdn.example.org/report.txt", resolvedAddresses: ["23.192.228.80"], pinnedAddress: "23.192.228.80", status: 200, observedAt: START + 4 },
      ],
      redirectCount: 1,
      transferredBytes: 1_024,
      decompressedBytes: 4_096,
      startedAt: START,
      completedAt: START + 10,
      elapsedMs: 10,
    },
  };
  return applyPatch(base, patch);
}

/** Deep-merge plain objects only, so a case can replace one leaf without
 * restating the valid scenario around it while arrays, primitives, and
 * deliberately wrong shapes replace their target outright. */
function applyPatch(base, patch) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key];
    merged[key] = isPlain(value) && isPlain(existing) ? applyPatch(existing, value) : value;
  }
  return merged;
}
function isPlain(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }

function hops(...replacements) {
  const base = outcome().evidence.hops;
  return replacements.map((replacement, index) => (replacement === null ? base[index] : applyPatch(base[index] ?? base[base.length - 1], replacement)));
}

function assertRejected(call, reason, message) {
  assert.throws(call, (error) => {
    assert.equal(error.code, "retrieval_admission_rejected", `${message}: expected an admission rejection, got ${error?.message}`);
    assert.equal(error.reason, reason, message);
    return true;
  }, message);
}

function admitOutcome(requestPatch, outcomePatch) {
  const admitted = port.admitRetrievalRequest(request(requestPatch));
  return port.admitRetrievalOutcome(admitted, outcome(outcomePatch));
}

test("only unambiguous public unicast literals are admissible connect targets", () => {
  const publicAddresses = [
    "8.8.8.8", "1.1.1.1", "93.184.216.34", "203.0.114.1", "100.63.255.255", "100.128.0.0",
    "198.17.255.255", "198.20.0.0", "192.0.1.255", "223.255.255.255", "172.15.255.255", "172.32.0.0",
    "2606:4700:4700::1111", "2000::1", "2001:200::1", "2001:db9::1", "3fff:1000::1", "3ffe::1",
  ];
  for (const address of publicAddresses) {
    assert.equal(port.isPublicRetrievalAddress(address), true, `${address} is public unicast`);
  }

  const blockedAddresses = [
    // Documentation and reserved IPv6 must never read as public.
    "2001:db8::1", "2001:DB8:0:0:0:0:0:1", "2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    "3fff::1", "3fff:0fff:ffff:ffff:ffff:ffff:ffff:ffff", "2001::1", "2001:0:53aa:64c:1:2:3:4", "2001:1ff:ffff::1",
    "2002::1", "2002:7f00:1::1", "2002:a9fe:a9fe::1",
    // Non-global IPv6.
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:8.8.8.8", "64:ff9b::7f00:1", "100::1",
    "fc00::1", "fd00::1", "fe80::1", "fec0::1", "ff02::1", "1fff::1", "4000::1", "5f00::1",
    // IPv4 special-purpose space, including cloud metadata and test networks.
    "0.0.0.0", "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "127.1.1.1", "169.254.169.254",
    "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1",
    "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    // Ambiguous or malformed literals are never classified as public.
    "127.0.0.01", "010.0.0.1", "0x7f.0.0.1", "2130706433", "1.2.3", "1.2.3.4.5", "999.1.1.1", "1.2.3.-4",
    "::1%eth0", "fe80::1%25eth0", " 8.8.8.8", "8.8.8.8 ", "8.8.8.8.", "", ":::", "1:2:3:4:5:6:7:8:9",
    "2001:db8::1::2", "2001:db8:", "gggg::1", "8.8.8.8:443", "[2606:4700::1111]",
  ];
  for (const address of blockedAddresses) {
    assert.equal(port.isPublicRetrievalAddress(address), false, `${address} must not be treated as public`);
  }

  for (const value of [null, undefined, 3232235777, {}, [], ["8.8.8.8"]]) {
    assert.equal(port.isPublicRetrievalAddress(value), false, "a non-string address is never public");
  }
});

test("request admission is https-only, capped, and rejects unknown or missing fields", () => {
  const admitted = port.admitRetrievalRequest(request());
  assert.equal(admitted.admissionRule, "prospector-retrieval-admission/v1");
  assert.equal(admitted.url, "https://sources.example.com/report");
  assert.equal(Object.isFrozen(admitted), true, "an admitted request cannot be widened after admission");

  for (const url of [
    "http://sources.example.com/report", "ftp://sources.example.com/report", "https://user:secret@sources.example.com/a",
    "https://sources.example.com:8443/a", "https://127.0.0.1/a", "https://[::1]/a", "https://2606:4700::1111/a",
    "https://localhost/a", "https://intranet/a", "https://sources.example.com./a", "https://sources.example.com/a#fragment",
    "https://sources.example.999/a", "//sources.example.com/a", "https:///a", "", `https://a.example.com/${"x".repeat(2_100)}`,
  ]) {
    assertRejected(() => port.admitRetrievalRequest(request({ url })), "request_url", `URL ${url} must be rejected`);
  }
  for (const url of [null, 42, {}, ["https://sources.example.com/report"]]) {
    assertRejected(() => port.admitRetrievalRequest(request({ url })), "request_url", "a non-string URL is rejected");
  }

  for (const expectedMimeTypes of [[], ["*/*"], ["text/*"], ["text/plain; charset=utf-8"], ["Text/Plain"], ["text/plain", "text/plain"], ["text/plain", ""], "text/plain", [null], new Array(9).fill(0).map((_, index) => `text/x-${index}`)]) {
    assertRejected(() => port.admitRetrievalRequest(request({ expectedMimeTypes })), "request_mime_types", `MIME set ${JSON.stringify(expectedMimeTypes)} must be rejected`);
  }

  const capCases = [
    ["maximumBytes", 0], ["maximumBytes", -1], ["maximumBytes", 1.5], ["maximumBytes", Number.NaN],
    ["maximumBytes", 8_388_609], ["maximumBytes", "4096"], ["maximumBytes", undefined],
    ["maximumDecompressedBytes", undefined], ["maximumDecompressedBytes", 0], ["maximumDecompressedBytes", 4_095],
    ["maximumDecompressedBytes", 33_554_433], ["maximumRedirects", -1], ["maximumRedirects", 6],
    ["timeoutMs", 0], ["timeoutMs", 120_001], ["timeoutMs", Number.POSITIVE_INFINITY],
  ];
  for (const [field, value] of capCases) {
    assertRejected(() => port.admitRetrievalRequest(request({ [field]: value })), "request_caps", `${field}=${String(value)} must be rejected`);
  }

  // A missing decompression cap is a missing control, not a defaulted one.
  const withoutDecompressionCap = request();
  delete withoutDecompressionCap.maximumDecompressedBytes;
  assertRejected(() => port.admitRetrievalRequest(withoutDecompressionCap), "request_shape", "an absent decompression cap fails closed");

  assertRejected(() => port.admitRetrievalRequest(request({ followRedirects: true })), "request_shape", "an unknown request field is rejected");
  assertRejected(() => port.admitRetrievalRequest(JSON.parse('{"url":"https://a.example.com/x","expectedMimeTypes":["text/plain"],"maximumBytes":1,"maximumDecompressedBytes":1,"maximumRedirects":0,"timeoutMs":1,"__proto__":{"maximumBytes":99}}')), "request_shape", "a polluted key is an unknown field");
  for (const value of [null, undefined, "request", 7, [request()]]) {
    assertRejected(() => port.admitRetrievalRequest(value), "request_shape", "a non-object request is rejected");
  }
});

test("outcome admission requires a genuinely admitted request", () => {
  assert.doesNotThrow(() => admitOutcome());
  for (const value of [request(), { ...request(), admissionRule: "other/v1" }, null, undefined, "admitted"]) {
    assertRejected(() => port.admitRetrievalOutcome(value, outcome()), "request_shape", "an unadmitted request cannot reach evidence checks");
  }
  // The marker alone is not authority: the request is revalidated in full.
  const forged = { ...request({ maximumBytes: 9_000_000 }), admissionRule: "prospector-retrieval-admission/v1" };
  assertRejected(() => port.admitRetrievalOutcome(forged, outcome()), "request_caps", "a forged marker cannot raise a cap");
});

test("every hop must carry a public resolution set and a pinned member of it", () => {
  const admitted = admitOutcome();
  assert.equal(admitted.evidence.hops.length, 2);
  assert.equal(Object.isFrozen(admitted.evidence.hops), true);

  const addressCases = [
    ["a private address anywhere in the set", { hops: hops({ resolvedAddresses: ["93.184.216.34", "10.0.0.5"] }, null) }, "evidence_address"],
    ["a documentation address in the set", { hops: hops({ resolvedAddresses: ["2001:db8::1"] }, null) }, "evidence_address"],
    ["a metadata address after the redirect", { hops: hops(null, { resolvedAddresses: ["169.254.169.254"], pinnedAddress: "169.254.169.254" }) }, "evidence_address"],
    ["an empty resolution set", { hops: hops({ resolvedAddresses: [] }, null) }, "evidence_address"],
    ["a duplicated resolution", { hops: hops({ resolvedAddresses: ["93.184.216.34", "93.184.216.34"] }, null) }, "evidence_address"],
    ["an oversized resolution set", { hops: hops({ resolvedAddresses: Array.from({ length: 17 }, (_, index) => `93.184.216.${index + 1}`) }, null) }, "evidence_address"],
    ["a hostname instead of a resolved address", { hops: hops({ resolvedAddresses: ["sources.example.com"] }, null) }, "evidence_address"],
    ["a missing resolution field", { hops: [{ url: "https://sources.example.com/report", pinnedAddress: "93.184.216.34", status: 200, observedAt: START + 1 }], redirectCount: 0 }, "evidence_shape"],
    ["a pin outside the resolution set", { hops: hops({ pinnedAddress: "23.192.228.80" }, null) }, "evidence_pinning"],
    ["a private pin", { hops: hops({ resolvedAddresses: ["93.184.216.34"], pinnedAddress: "127.0.0.1" }, null) }, "evidence_pinning"],
    ["a documentation pin", { hops: hops({ resolvedAddresses: ["93.184.216.34"], pinnedAddress: "2001:db8::1" }, null) }, "evidence_pinning"],
    ["a missing pin", { hops: hops({ pinnedAddress: undefined }, null) }, "evidence_pinning"],
  ];
  for (const [name, patch, reason] of addressCases) {
    assertRejected(() => admitOutcome({}, { evidence: patch }), reason, name);
  }
});

test("the redirect chain is complete, counted, bounded, and loop-free", () => {
  const chainCases = [
    ["a redirect that is not in the chain", { redirectCount: 0 }, "evidence_redirects"],
    ["a chain longer than its declared count", { redirectCount: 2 }, "evidence_redirects"],
    ["a negative redirect count", { redirectCount: -1 }, "evidence_redirects"],
    ["a missing redirect count", { redirectCount: undefined }, "evidence_redirects"],
    ["a chain with no hops at all", { hops: [], redirectCount: 0 }, "evidence_hops"],
    ["a missing hop list", { hops: undefined }, "evidence_hops"],
    ["a hop list that is not an array", { hops: { 0: outcome().evidence.hops[1] } }, "evidence_hops"],
    ["a chain that exceeds the redirect cap", {
      hops: hops(null, { url: "https://cdn.example.org/a", status: 302 }, { url: "https://cdn.example.org/b", status: 302 }, { url: "https://cdn.example.org/c", status: 200 }),
      redirectCount: 3,
    }, "evidence_hops"],
    ["a first hop that is not the requested URL", { hops: hops({ url: "https://other.example.com/report" }, null) }, "evidence_hop_url"],
    ["a redirect loop", { hops: hops(null, { url: "https://sources.example.com/report", status: 200 }) }, "evidence_hop_url"],
    ["a plaintext redirect target", { hops: hops(null, { url: "http://cdn.example.org/report.txt" }) }, "evidence_hop_url"],
    ["a redirect to a literal address", { hops: hops(null, { url: "https://169.254.169.254/latest/meta-data" }) }, "evidence_hop_url"],
    ["a redirect carrying credentials", { hops: hops(null, { url: "https://user:secret@cdn.example.org/report.txt" }) }, "evidence_hop_url"],
    ["a non-redirect status before the final hop", { hops: hops({ status: 200 }, null) }, "evidence_status"],
    ["a non-success final status", { hops: hops(null, { status: 302 }) }, "evidence_status"],
    ["an out-of-range status", { hops: hops(null, { status: 0 }) }, "evidence_status"],
    ["a missing status", { hops: hops(null, { status: undefined }) }, "evidence_status"],
    ["an unknown hop field", { hops: hops(null, { proxied: false }) }, "evidence_shape"],
  ];
  for (const [name, patch, reason] of chainCases) {
    assertRejected(() => admitOutcome({}, { evidence: patch }), reason, name);
  }

  // A redirect-free retrieval is admissible only when the single hop succeeded.
  const single = admitOutcome({ maximumRedirects: 0 }, {
    document: { finalUrl: "https://sources.example.com/report" },
    evidence: { hops: hops({ status: 200 }), redirectCount: 0 },
  });
  assert.equal(single.evidence.redirectCount, 0);
  assert.equal(single.document.finalUrl, "https://sources.example.com/report");
  assertRejected(() => admitOutcome({ maximumRedirects: 0 }, {}), "evidence_hops", "a redirect cannot exceed a zero-redirect budget");
});

test("transfer, decompression, and wall-clock accounting are mandatory and bounded", () => {
  const accountingCases = [
    ["a transfer beyond the byte cap", { transferredBytes: 4_097 }, "evidence_transfer"],
    ["an unaccounted transfer", { transferredBytes: undefined }, "evidence_transfer"],
    ["a zero-byte transfer claim", { transferredBytes: 0 }, "evidence_transfer"],
    ["a fractional transfer", { transferredBytes: 10.5 }, "evidence_transfer"],
    ["a decompression bomb", { decompressedBytes: 16_385 }, "evidence_decompression"],
    ["an unaccounted decompression", { decompressedBytes: undefined }, "evidence_decompression"],
    ["a negative decompression", { decompressedBytes: -1 }, "evidence_decompression"],
    ["a missing start time", { startedAt: undefined }, "evidence_clock"],
    ["a missing completion time", { completedAt: undefined }, "evidence_clock"],
    ["a missing elapsed measurement", { elapsedMs: undefined }, "evidence_clock"],
    ["completion before start", { completedAt: START - 1 }, "evidence_clock"],
    ["an elapsed value that contradicts the clock", { elapsedMs: 9 }, "evidence_clock"],
    ["an elapsed value beyond the timeout", { startedAt: START, completedAt: START + 5_001, elapsedMs: 5_001 }, "evidence_clock"],
    ["a non-integer clock", { startedAt: START + 0.5, elapsedMs: 9.5 }, "evidence_clock"],
    ["a hop observed before the retrieval started", { hops: hops({ observedAt: START - 1 }, null) }, "evidence_clock"],
    ["a hop observed after completion", { hops: hops(null, { observedAt: START + 11 }) }, "evidence_clock"],
    ["hops observed out of order", { hops: hops({ observedAt: START + 5 }, { observedAt: START + 4 }) }, "evidence_clock"],
    ["a missing hop observation", { hops: hops(null, { observedAt: undefined }) }, "evidence_clock"],
    ["an unknown evidence field", { proxyUsed: false }, "evidence_shape"],
    ["absent evidence", undefined, "evidence_shape"],
  ];
  for (const [name, patch, reason] of accountingCases) {
    const evidence = patch === undefined ? undefined : { evidence: patch };
    assertRejected(() => admitOutcome({}, evidence ?? { evidence: undefined }), reason, name);
  }

  const admitted = admitOutcome();
  assert.equal(admitted.evidence.transferredBytes, 1_024);
  assert.equal(admitted.evidence.decompressedBytes, 4_096);
  assert.equal(admitted.evidence.elapsedMs, 10);
  assert.equal(Object.isFrozen(admitted.evidence), true);
});

test("the document is bound to the final hop, the declared MIME set, and escaped text", () => {
  const documentCases = [
    ["a final URL that no hop visited", { finalUrl: "https://cdn.example.org/other.txt" }, "document_binding"],
    ["a final URL taken from an earlier hop", { finalUrl: "https://sources.example.com/report" }, "document_binding"],
    ["a plaintext final URL", { finalUrl: "http://cdn.example.org/report.txt" }, "document_binding"],
    ["a missing final URL", { finalUrl: undefined }, "document_binding"],
    ["an undeclared MIME type", { mimeType: "text/html" }, "document_mime"],
    ["a parameterized MIME type", { mimeType: "text/plain; charset=utf-8" }, "document_mime"],
    ["a missing MIME type", { mimeType: undefined }, "document_mime"],
    ["a short digest", { contentDigest: "a".repeat(63) }, "document_digest"],
    ["an uppercase digest", { contentDigest: "A".repeat(64) }, "document_digest"],
    ["a missing digest", { contentDigest: undefined }, "document_digest"],
    ["active markup", { extractedText: "<script>alert(1)</script>" }, "document_text"],
    ["an unescaped ampersand", { extractedText: "Rio Tinto & BHP" }, "document_text"],
    ["a quote character", { extractedText: 'He said "buy"' }, "document_text"],
    ["a control character", { extractedText: `Bounded${String.fromCharCode(0)}text` }, "document_text"],
    ["a terminal escape sequence", { extractedText: `Bounded${String.fromCharCode(27)}[31mtext` }, "document_text"],
    ["denormalized text", { extractedText: `Cafe${String.fromCharCode(0x301)} report` }, "document_text"],
    ["empty text", { extractedText: "" }, "document_text"],
    ["whitespace-only text", { extractedText: "   " }, "document_text"],
    ["unbounded text", { extractedText: "x".repeat(65_537) }, "document_text"],
    ["an unknown document field", { rawHtml: "<p>x</p>" }, "document_shape"],
  ];
  for (const [name, patch, reason] of documentCases) {
    assertRejected(() => admitOutcome({}, { document: patch }), reason, name);
  }
  assertRejected(() => admitOutcome({}, { document: undefined }), "document_shape", "an absent document fails closed");

  const admitted = admitOutcome();
  assert.equal(admitted.document.extractedText, "Bounded &amp; escaped synthetic excerpt");
  assert.equal(Object.isFrozen(admitted.document), true);
});

test("the guarded port admits before the adapter runs and revalidates everything after it", async () => {
  const calls = [];
  const adapterFor = (result) => ({ perform: async (admitted) => { calls.push(admitted); return typeof result === "function" ? result(admitted) : result; } });

  const guarded = port.createGuardedRetrievalPort(adapterFor(() => outcome()));
  const document = await guarded.retrieve(request());
  assert.equal(calls.length, 1, "the adapter runs only for an admitted request");
  assert.equal(calls[0].admissionRule, "prospector-retrieval-admission/v1");
  assert.equal(calls[0].url, "https://sources.example.com/report");
  assert.equal(document.finalUrl, "https://cdn.example.org/report.txt");
  assert.equal(Object.isFrozen(document), true);
  assert.equal(document.evidence, undefined, "the port returns a document, never a transport handle");

  calls.length = 0;
  for (const rejectedRequest of [request({ url: "http://sources.example.com/report" }), request({ maximumRedirects: 9 }), request({ cookies: {} })]) {
    await assert.rejects(() => guarded.retrieve(rejectedRequest), /retrieval_admission_rejected/);
  }
  assert.equal(calls.length, 0, "a rejected request must never reach the adapter");

  const returnedOutcomes = [
    ["a document without evidence", { document: outcome().document }],
    ["evidence without a document", { evidence: outcome().evidence }],
    ["evidence for a different URL", outcome({ evidence: { hops: hops({ url: "https://elsewhere.example.com/report" }, null) } })],
    ["evidence pinning a private address", outcome({ evidence: { hops: hops({ pinnedAddress: "127.0.0.1", resolvedAddresses: ["127.0.0.1"] }, null) } })],
    ["evidence pinning a documentation address", outcome({ evidence: { hops: hops({ pinnedAddress: "2001:db8::1", resolvedAddresses: ["2001:db8::1"] }, null) } })],
    ["a chain that ends on a redirect status", outcome({ evidence: { hops: hops(null), redirectCount: 0 }, document: { finalUrl: "https://sources.example.com/report" } })],
    ["a decompression bomb", outcome({ evidence: { decompressedBytes: 1_000_000 } })],
    ["no outcome at all", undefined],
    ["a bare document", outcome().document],
  ];
  for (const [name, result] of returnedOutcomes) {
    const hostile = port.createGuardedRetrievalPort(adapterFor(() => result));
    await assert.rejects(() => hostile.retrieve(request()), (error) => {
      assert.equal(error.code, "retrieval_admission_rejected", name);
      return true;
    }, name);
  }

  const failing = port.createGuardedRetrievalPort({ perform: async () => { throw new Error("connect ECONNREFUSED 169.254.169.254:80"); } });
  await assert.rejects(() => failing.retrieve(request()), (error) => {
    assert.equal(error.reason, "adapter_failure");
    assert.doesNotMatch(error.message, /169\.254|ECONNREFUSED/, "an adapter error must not leak transport detail");
    return true;
  });

  for (const adapter of [null, undefined, {}, { perform: "no" }, () => {}]) {
    assert.throws(() => port.createGuardedRetrievalPort(adapter), /retrieval_admission_rejected:request_shape/);
  }
});

test("the default port stays unavailable and no runtime module composes a retrieval capability", async () => {
  await assert.rejects(
    () => port.createRejectOnlyRetrievalPort().retrieve(request()),
    /retrieval_capability_unavailable/,
    "the default port remains reject-only",
  );
  assert.deepEqual(
    [...port.SAFE_RETRIEVAL_REQUIREMENTS].sort(),
    [
      "bounded_redirects_and_wall_clock_timeout", "dns_connection_pinning",
      "documentation_and_reserved_address_rejection", "escaped_text_only", "https_only",
      "mandatory_pinning_redirect_transfer_and_clock_evidence", "mime_byte_decompression_and_timeout_caps",
      "no_cookies_credentials_or_privileged_browser_authority", "public_address_and_redirect_validation",
      "sandboxed_text_extraction",
    ],
  );

  const source = await readFile(PORT_PATH, "utf8");
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /node:(?:net|tls|http|https|dns|dgram)/, /\bnew Request\s*\(/, /\bconnect\s*\(/, /process\.env/, /^\s*import\s/m]) {
    assert.doesNotMatch(source, pattern, `the boundary must contain no transport or ambient authority (${pattern})`);
  }

  const runtimeFiles = (await Promise.all(["app", "domain", "adapters", "worker"].map((directory) => sourceFiles(join(root, directory))))).flat();
  assert.ok(runtimeFiles.length > 0, "runtime source must be scannable");
  for (const file of runtimeFiles) {
    if (file === PORT_PATH) continue;
    const contents = await readFile(file, "utf8");
    assert.equal(contents.includes("createGuardedRetrievalPort"), false, `${file} must not compose the guarded retrieval port`);
    assert.equal(contents.includes("admitRetrievalOutcome"), false, `${file} must not consume retrieval evidence before the capability gate`);
  }
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|mts|mjs|js|jsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
