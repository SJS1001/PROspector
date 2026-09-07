/**
 * Deliberately inert seam for a future retrieval capability.  It is not a
 * browser, credential container, proxy, or network client: this module imports
 * nothing, opens no socket, and reads no configuration.  Composition must
 * remain reject-only until a separately accepted capability gate exists.
 *
 * The admission functions below are the checked contract that any future
 * adapter must satisfy.  They are pure predicates over a request and over the
 * evidence an adapter claims about what it actually did.  They fail closed:
 * absent, partial, or malformed evidence is a rejection, never a warning and
 * never an optional extra.
 */

export const ADMISSION_RULE = "prospector-retrieval-admission/v1" as const;

/** Enumerable at runtime so the requirement-to-enforcement map below can be
 * proven total: a reason added without a governing requirement fails its test. */
export const RETRIEVAL_REJECTION_REASONS = Object.freeze([
  "request_shape", "request_url", "request_mime_types", "request_caps",
  "evidence_shape", "evidence_clock", "evidence_hops", "evidence_hop_url",
  "evidence_address", "evidence_pinning", "evidence_status", "evidence_redirects",
  "evidence_transfer", "evidence_decompression",
  "document_shape", "document_binding", "document_mime", "document_digest", "document_text",
  "adapter_failure",
] as const);

export type RetrievalRejectionReason = typeof RETRIEVAL_REJECTION_REASONS[number];

export class RetrievalAdmissionError extends Error {
  readonly code = "retrieval_admission_rejected";
  readonly reason: RetrievalRejectionReason;
  constructor(reason: RetrievalRejectionReason) { super(`retrieval_admission_rejected:${reason}`); this.reason = reason; }
}

export type RetrievalRequest = Readonly<{
  url: string;
  expectedMimeTypes: readonly string[];
  maximumBytes: number;
  /** Required: a compressed response without a decompression cap is unbounded. */
  maximumDecompressedBytes: number;
  maximumRedirects: number;
  timeoutMs: number;
}>;

/** Only `admitRetrievalRequest` mints this shape, so an adapter can never be
 * handed a request that skipped admission. */
export type AdmittedRetrievalRequest = RetrievalRequest & Readonly<{ admissionRule: typeof ADMISSION_RULE }>;

/** One connection attempt: the initial request or one redirect target.  Every
 * hop must carry its own resolution, pinning, status, and wall-clock evidence;
 * a chain is only as safe as its least-validated hop. */
export type RetrievalHopEvidence = Readonly<{
  url: string;
  resolvedAddresses: readonly string[];
  pinnedAddress: string;
  status: number;
  observedAt: number;
}>;

export type RetrievalEvidence = Readonly<{
  hops: readonly RetrievalHopEvidence[];
  redirectCount: number;
  transferredBytes: number;
  decompressedBytes: number;
  startedAt: number;
  completedAt: number;
  elapsedMs: number;
}>;

export type RetrievedDocument = Readonly<{
  finalUrl: string;
  mimeType: string;
  contentDigest: string;
  extractedText: string;
}>;

export type RetrievalOutcome = Readonly<{ document: RetrievedDocument; evidence: RetrievalEvidence }>;

export type RetrievalPort = Readonly<{ retrieve(request: RetrievalRequest): Promise<RetrievedDocument> }>;

/** A future adapter performs the transport.  It receives only an admitted
 * request and must return the document together with complete evidence. */
export type GuardedRetrievalAdapter = Readonly<{ perform(request: AdmittedRetrievalRequest): Promise<RetrievalOutcome> }>;

export const RETRIEVAL_ADMISSION_LIMITS = Object.freeze({
  maximumUrlLength: 2_048,
  maximumMimeTypes: 8,
  maximumTransferBytes: 8_388_608,
  maximumDecompressedBytes: 33_554_432,
  maximumRedirects: 5,
  maximumTimeoutMs: 120_000,
  maximumResolvedAddresses: 16,
  maximumExtractedTextLength: 65_536,
  /**
   * An absolute decompression cap alone does not bound expansion: a one-byte
   * transfer budget paired with the absolute cap declares a 33,554,432:1 ratio
   * and silently retires this contract's decompression-bomb protection. The
   * effective ceiling is the lower of the absolute cap and this ratio.
   */
  maximumDecompressionRatio: 20,
} as const);

export const SAFE_RETRIEVAL_REQUIREMENTS = Object.freeze([
  "https_only", "public_address_and_redirect_validation", "dns_connection_pinning",
  "documentation_and_reserved_address_rejection",
  "mime_byte_decompression_and_timeout_caps", "bounded_redirects_and_wall_clock_timeout",
  "mandatory_pinning_redirect_transfer_and_clock_evidence",
  "sandboxed_text_extraction", "escaped_text_only",
  "no_cookies_credentials_or_privileged_browser_authority",
] as const);

/**
 * Bind each named requirement to the rejection reasons that actually enforce
 * it.  The requirement list is otherwise prose: nothing failed when a label was
 * added without an enforcing check, or when a check was removed while its label
 * stayed.  This map is proven total in both directions by its test, so the
 * labels can no longer drift away from the implementation.
 */
export const RETRIEVAL_ADMISSION_RULES: Readonly<Record<typeof SAFE_RETRIEVAL_REQUIREMENTS[number], readonly RetrievalRejectionReason[]>> = Object.freeze({
  https_only: Object.freeze(["request_url", "evidence_hop_url", "document_binding"] as const),
  public_address_and_redirect_validation: Object.freeze(["evidence_address", "evidence_status", "evidence_redirects"] as const),
  dns_connection_pinning: Object.freeze(["evidence_pinning"] as const),
  documentation_and_reserved_address_rejection: Object.freeze(["evidence_address", "evidence_pinning"] as const),
  mime_byte_decompression_and_timeout_caps: Object.freeze(["request_mime_types", "request_caps", "evidence_transfer", "evidence_decompression", "document_mime"] as const),
  bounded_redirects_and_wall_clock_timeout: Object.freeze(["request_caps", "evidence_redirects", "evidence_clock"] as const),
  mandatory_pinning_redirect_transfer_and_clock_evidence: Object.freeze(["evidence_shape", "evidence_hops", "evidence_pinning", "evidence_transfer", "evidence_clock"] as const),
  sandboxed_text_extraction: Object.freeze(["document_shape", "document_digest", "document_text"] as const),
  escaped_text_only: Object.freeze(["document_text"] as const),
  no_cookies_credentials_or_privileged_browser_authority: Object.freeze(["request_shape", "request_url", "adapter_failure"] as const),
});

const REQUEST_KEYS = ["url", "expectedMimeTypes", "maximumBytes", "maximumDecompressedBytes", "maximumRedirects", "timeoutMs"] as const;
const HOP_KEYS = ["url", "resolvedAddresses", "pinnedAddress", "status", "observedAt"] as const;
const EVIDENCE_KEYS = ["hops", "redirectCount", "transferredBytes", "decompressedBytes", "startedAt", "completedAt", "elapsedMs"] as const;
const DOCUMENT_KEYS = ["finalUrl", "mimeType", "contentDigest", "extractedText"] as const;
const OUTCOME_KEYS = ["document", "evidence"] as const;
const REDIRECT_STATUSES = Object.freeze([301, 302, 303, 307, 308]);

/**
 * Validate and canonicalize a retrieval request before anything connects.
 * Unknown fields are rejected: an unrecognized key next to an authority field
 * is either a typo that silently disables a cap or an attempt to smuggle one.
 */
export function admitRetrievalRequest(request: unknown): AdmittedRetrievalRequest {
  const value = exactObject(request, REQUEST_KEYS, "request_shape");
  const url = canonicalHttpsUrl(value.url, "request_url");
  const expectedMimeTypes = admitMimeTypes(value.expectedMimeTypes);
  const maximumBytes = boundedInteger(value.maximumBytes, 1, RETRIEVAL_ADMISSION_LIMITS.maximumTransferBytes, "request_caps");
  const maximumDecompressedBytes = boundedInteger(value.maximumDecompressedBytes, maximumBytes,
    Math.min(RETRIEVAL_ADMISSION_LIMITS.maximumDecompressedBytes, maximumBytes * RETRIEVAL_ADMISSION_LIMITS.maximumDecompressionRatio), "request_caps");
  const maximumRedirects = boundedInteger(value.maximumRedirects, 0, RETRIEVAL_ADMISSION_LIMITS.maximumRedirects, "request_caps");
  const timeoutMs = boundedInteger(value.timeoutMs, 1, RETRIEVAL_ADMISSION_LIMITS.maximumTimeoutMs, "request_caps");
  return Object.freeze({ admissionRule: ADMISSION_RULE, url, expectedMimeTypes, maximumBytes, maximumDecompressedBytes, maximumRedirects, timeoutMs });
}

/**
 * Validate what an adapter claims it did.  Resolved and pinned addresses, the
 * full redirect chain and its count, transfer and decompression accounting, and
 * wall-clock evidence are all mandatory and are all bound to the exact admitted
 * request and returned document.
 */
export function admitRetrievalOutcome(request: AdmittedRetrievalRequest, outcome: unknown): RetrievalOutcome {
  if (!isRecord(request) || request.admissionRule !== ADMISSION_RULE) throw reject("request_shape");
  const admitted = admitRetrievalRequest({
    url: request.url, expectedMimeTypes: request.expectedMimeTypes, maximumBytes: request.maximumBytes,
    maximumDecompressedBytes: request.maximumDecompressedBytes, maximumRedirects: request.maximumRedirects, timeoutMs: request.timeoutMs,
  });
  const value = exactObject(outcome, OUTCOME_KEYS, "evidence_shape");
  const evidence = admitEvidence(admitted, value.evidence);
  const document = admitDocument(admitted, evidence, value.document);
  return Object.freeze({ document, evidence });
}

function admitEvidence(request: AdmittedRetrievalRequest, candidate: unknown): RetrievalEvidence {
  const value = exactObject(candidate, EVIDENCE_KEYS, "evidence_shape");
  const startedAt = boundedInteger(value.startedAt, 1, Number.MAX_SAFE_INTEGER, "evidence_clock");
  const completedAt = boundedInteger(value.completedAt, startedAt, Number.MAX_SAFE_INTEGER, "evidence_clock");
  const elapsedMs = boundedInteger(value.elapsedMs, 0, request.timeoutMs, "evidence_clock");
  if (elapsedMs !== completedAt - startedAt) throw reject("evidence_clock");
  const rawHops = Array.isArray(value.hops) ? value.hops : null;
  if (!rawHops || rawHops.length < 1 || rawHops.length > request.maximumRedirects + 1) throw reject("evidence_hops");
  const redirectCount = boundedInteger(value.redirectCount, 0, request.maximumRedirects, "evidence_redirects");
  if (redirectCount !== rawHops.length - 1) throw reject("evidence_redirects");
  const transferredBytes = boundedInteger(value.transferredBytes, 1, request.maximumBytes, "evidence_transfer");
  const decompressedBytes = boundedInteger(value.decompressedBytes, 1, request.maximumDecompressedBytes, "evidence_decompression");

  const hops: RetrievalHopEvidence[] = [];
  let previousObservedAt = startedAt;
  for (const [index, rawHop] of rawHops.entries()) {
    const hop = exactObject(rawHop, HOP_KEYS, "evidence_shape");
    const url = canonicalHttpsUrl(hop.url, "evidence_hop_url");
    if (index === 0 && url !== request.url) throw reject("evidence_hop_url");
    if (hops.some((earlier) => earlier.url === url)) throw reject("evidence_hop_url");
    const resolved = Array.isArray(hop.resolvedAddresses) ? hop.resolvedAddresses : null;
    if (!resolved || resolved.length < 1 || resolved.length > RETRIEVAL_ADMISSION_LIMITS.maximumResolvedAddresses) throw reject("evidence_address");
    const resolvedAddresses = resolved.map((address) => admitPublicAddress(address));
    /* A mixed answer set is rejected outright: a name that also resolves to a
     * private address can win the next resolution or a per-connection race. */
    if (new Set(resolvedAddresses).size !== resolvedAddresses.length) throw reject("evidence_address");
    const pinnedAddress = admitPublicAddress(hop.pinnedAddress, "evidence_pinning");
    if (!resolvedAddresses.includes(pinnedAddress)) throw reject("evidence_pinning");
    const status = boundedInteger(hop.status, 100, 599, "evidence_status");
    const isFinal = index === rawHops.length - 1;
    if (isFinal ? status !== 200 : !REDIRECT_STATUSES.includes(status)) throw reject("evidence_status");
    const observedAt = boundedInteger(hop.observedAt, previousObservedAt, completedAt, "evidence_clock");
    previousObservedAt = observedAt;
    hops.push(Object.freeze({ url, resolvedAddresses: Object.freeze(resolvedAddresses), pinnedAddress, status, observedAt }));
  }
  return Object.freeze({ hops: Object.freeze(hops), redirectCount, transferredBytes, decompressedBytes, startedAt, completedAt, elapsedMs });
}

function admitDocument(request: AdmittedRetrievalRequest, evidence: RetrievalEvidence, candidate: unknown): RetrievedDocument {
  const value = exactObject(candidate, DOCUMENT_KEYS, "document_shape");
  const finalUrl = canonicalHttpsUrl(value.finalUrl, "document_binding");
  if (finalUrl !== evidence.hops[evidence.hops.length - 1].url) throw reject("document_binding");
  const mimeType = typeof value.mimeType === "string" ? value.mimeType : "";
  if (!request.expectedMimeTypes.includes(mimeType)) throw reject("document_mime");
  if (typeof value.contentDigest !== "string" || !/^[0-9a-f]{64}$/.test(value.contentDigest)) throw reject("document_digest");
  const extractedText = value.extractedText;
  if (typeof extractedText !== "string" || extractedText.length < 1 || extractedText.length > RETRIEVAL_ADMISSION_LIMITS.maximumExtractedTextLength) throw reject("document_text");
  if (extractedText !== extractedText.normalize("NFC") || !extractedText.trim()) throw reject("document_text");
  /* Source text is quoted data, never markup: active content must already be
   * escaped by the sandboxed extractor before it can cross this boundary. */
  if (!isEscapedText(extractedText)) throw reject("document_text");
  return Object.freeze({ finalUrl, mimeType, contentDigest: value.contentDigest, extractedText });
}

/**
 * A retrieval address is public only when it is a literal, unambiguous unicast
 * address outside every special-purpose range.  Documentation, reserved,
 * transition, and non-routable space is not public: `2001:db8::/32` and
 * `3fff::/20` are as unsafe a connect target as `127.0.0.1`.
 */
export function isPublicRetrievalAddress(value: unknown): boolean {
  if (typeof value !== "string" || value !== value.trim() || !value) return false;
  const ipv4 = parseIpv4(value);
  if (ipv4) return BLOCKED_IPV4.every(([base, bits]) => !withinIpv4Prefix(ipv4, base, bits));
  const ipv6 = parseIpv6(value);
  if (!ipv6) return false;
  /* Fail closed: only global unicast `2000::/3` can be public, minus the
   * documentation, protocol-assignment, and 6to4 ranges carved out of it. */
  if ((ipv6[0] & 0xe000) !== 0x2000) return false;
  return BLOCKED_IPV6.every(([base, bits]) => !withinIpv6Prefix(ipv6, base, bits));
}

/** The default port: it is not a client and never becomes one by configuration. */
export function createRejectOnlyRetrievalPort(): RetrievalPort {
  return Object.freeze({ async retrieve(): Promise<RetrievedDocument> { throw new Error("retrieval_capability_unavailable"); } });
}

/**
 * Wrap a future transport adapter in the mandatory admission contract.  The
 * request is admitted before the adapter is reached, the adapter's own error is
 * never propagated, and its claimed evidence is revalidated before any document
 * escapes.  Creating this port grants no capability: nothing in the running
 * application composes it, and doing so requires the separate capability gate.
 */
export function createGuardedRetrievalPort(adapter: GuardedRetrievalAdapter): RetrievalPort {
  if (!isRecord(adapter) || typeof adapter.perform !== "function") throw reject("request_shape");
  return Object.freeze({
    async retrieve(request: RetrievalRequest): Promise<RetrievedDocument> {
      const admitted = admitRetrievalRequest(request);
      let outcome: unknown;
      try { outcome = await adapter.perform(admitted); } catch { throw reject("adapter_failure"); }
      return admitRetrievalOutcome(admitted, outcome).document;
    },
  });
}

function admitMimeTypes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > RETRIEVAL_ADMISSION_LIMITS.maximumMimeTypes) throw reject("request_mime_types");
  const types = value.map((entry) => {
    /* Parameters are rejected rather than parsed: `text/plain; charset=x` is a
     * second field, and a cap that accepts free text is not a cap. */
    if (typeof entry !== "string" || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/.test(entry)) throw reject("request_mime_types");
    return entry;
  });
  if (new Set(types).size !== types.length) throw reject("request_mime_types");
  return Object.freeze(types);
}

function admitPublicAddress(value: unknown, reason: RetrievalRejectionReason = "evidence_address"): string {
  if (!isPublicRetrievalAddress(value)) throw reject(reason);
  return value as string;
}

function canonicalHttpsUrl(value: unknown, reason: RetrievalRejectionReason): string {
  if (typeof value !== "string" || !value || value.length > RETRIEVAL_ADMISSION_LIMITS.maximumUrlLength) throw reject(reason);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw reject(reason); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash) throw reject(reason);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, ""), labels = host.split(".");
  /* A literal address target has no name to resolve and pin, so it can never
   * satisfy the resolution evidence this contract requires. */
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw reject(reason);
  if (/^[0-9]+$/.test(labels[labels.length - 1]) || host === "localhost") throw reject(reason);
  if (parsed.hostname !== host) throw reject(reason);
  return parsed.toString();
}

function isEscapedText(value: string): boolean {
  if (/[<>"']/.test(value)) return false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    /* Only tab, newline, and carriage return survive extraction; every other
     * control character is a framing or terminal-injection vector. */
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return !value.replace(/&(?:amp|lt|gt|quot|#39);/g, "").includes("&");
}

/** IANA IPv4 special-purpose space: none of it is a safe connect target. */
const BLOCKED_IPV4: readonly (readonly [string, number])[] = Object.freeze([
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.31.196.0", 24], ["192.52.193.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["192.175.48.0", 24], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const);

/** Carve-outs inside `2000::/3` that are documentation, protocol assignment, or
 * address-embedding transition space rather than reachable public unicast. */
const BLOCKED_IPV6: readonly (readonly [string, number])[] = Object.freeze([
  ["2001:0000::", 23], ["2001:0db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const);

function parseIpv4(value: string): readonly number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    /* Leading zeros are rejected: `127.0.0.01` is octal to some resolvers and
     * decimal to others, and an ambiguous address cannot be classified. */
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function parseIpv6(value: string): readonly number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(value) || value.length > 45) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = expandIpv6Groups(halves[0]), tail = halves.length === 2 ? expandIpv6Groups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const elided = 8 - head.length - tail.length;
  return elided < 1 ? null : [...head, ...Array.from({ length: elided }, () => 0), ...tail];
}

function expandIpv6Groups(part: string): number[] | null {
  if (part === "") return [];
  const items = part.split(":"), groups: number[] = [];
  for (const [index, item] of items.entries()) {
    if (item.includes(".")) {
      const quad = index === items.length - 1 ? parseIpv4(item) : null;
      if (!quad) return null;
      groups.push((quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3]);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(item)) return null;
    groups.push(Number.parseInt(item, 16));
  }
  return groups.length > 8 ? null : groups;
}

function withinIpv4Prefix(address: readonly number[], base: string, bits: number): boolean {
  const parsed = parseIpv4(base);
  if (!parsed) return true;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipv4Number(address) & mask) >>> 0) === ((ipv4Number(parsed) & mask) >>> 0);
}

function ipv4Number(octets: readonly number[]): number {
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

function withinIpv6Prefix(address: readonly number[], base: string, bits: number): boolean {
  const parsed = parseIpv6(base);
  if (!parsed) return true;
  for (let index = 0; index * 16 < bits; index += 1) {
    const remaining = bits - index * 16, mask = remaining >= 16 ? 0xffff : (0xffff << (16 - remaining)) & 0xffff;
    if ((address[index] & mask) !== (parsed[index] & mask)) return false;
  }
  return true;
}

function exactObject<Key extends string>(value: unknown, keys: readonly Key[], reason: RetrievalRejectionReason): Record<Key, unknown> {
  if (!isRecord(value)) throw reject(reason);
  const present = Object.keys(value);
  if (present.length !== keys.length || keys.some((key) => !present.includes(key))) throw reject(reason);
  return value as Record<Key, unknown>;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, reason: RetrievalRejectionReason): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw reject(reason);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reject(reason: RetrievalRejectionReason): RetrievalAdmissionError {
  return new RetrievalAdmissionError(reason);
}
