import { createPublicUnsubscribe, UNSUBSCRIBE_ACKNOWLEDGEMENT } from "./outreach-stop-rules";

/**
 * Public unsubscribe transport (06-08, local).
 *
 * The token is the only authority: there is no owner admission and no read
 * capability. `createPublicUnsubscribe` consults the injected limiter before
 * any read and writes the tombstone before it acknowledges.
 *
 * Every token outcome (valid, replayed, unknown, malformed, oversized) gets
 * the same acknowledgement. A rate limit and a service failure get one shared
 * "try again" answer, so they cannot be told apart either. The only answer
 * that differs by token is a failed tombstone write on a valid token, which
 * must not claim success.
 *
 * The limiter backend here is in-memory and per isolate: a local control, not
 * a hosted rate limit.
 */

export const MAX_UNSUBSCRIBE_BODY_BYTES = 1024;
export const UNSUBSCRIBE_RETRY_MESSAGE = "We could not process this request right now. Please try the link again later.";

export type UnsubscribeLimiter = Readonly<{ consume(key: string): Promise<boolean> | boolean }>;
export type PublicUnsubscribeDependencies = Readonly<{ database: D1Database; limiter: UnsubscribeLimiter; now?: () => number }>;

export async function handlePublicUnsubscribePost(request: Request, dependencies: PublicUnsubscribeDependencies): Promise<Response> {
  const service = createPublicUnsubscribe(dependencies.database, {
    limiter: dependencies.limiter,
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  const clientKey = boundedClientKey(request.headers.get("cf-connecting-ip"));
  const token = await readToken(request);
  let result: Awaited<ReturnType<typeof service.unsubscribe>>;
  try {
    // A missing token is an empty one: it is still limited by this client's
    // key, then fails token validation and gets the generic acknowledgement.
    result = await service.unsubscribe({ token: token ?? "", clientKey });
  } catch {
    return answer(UNSUBSCRIBE_RETRY_MESSAGE, 503);
  }
  return result.kind === "acknowledged" ? answer(UNSUBSCRIBE_ACKNOWLEDGEMENT, 200) : answer(UNSUBSCRIBE_RETRY_MESSAGE, 503);
}

/**
 * The token from a bounded JSON `{ token }` body or a form field `token`.
 * Anything else (extra fields, oversized, unreadable) is treated as no token,
 * which still passes through the limiter and gets the generic answer.
 */
async function readToken(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_UNSUBSCRIBE_BODY_BYTES)) return null;
  let raw: string;
  try {
    raw = await boundedText(request);
  } catch {
    return null;
  }
  const type = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (type === "application/json") {
    try {
      const value = JSON.parse(raw) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const keys = Object.keys(value);
      return keys.length === 1 && keys[0] === "token" && typeof (value as { token: unknown }).token === "string" ? (value as { token: string }).token : null;
    } catch {
      return null;
    }
  }
  if (type === "application/x-www-form-urlencoded") {
    const form = new URLSearchParams(raw);
    const names = [...new Set(form.keys())];
    // RFC 8058 one-click posts carry `List-Unsubscribe=One-Click` beside the token.
    if (names.some((name) => name !== "token" && name !== "List-Unsubscribe") || form.getAll("token").length !== 1) return null;
    return form.get("token");
  }
  return null;
}

async function boundedText(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UNSUBSCRIBE_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("unsubscribe_body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function boundedClientKey(value: string | null) {
  return value && value.length <= 64 && /^[0-9A-Fa-f.:]+$/u.test(value) ? value : "anonymous";
}

function answer(message: string, status: number) {
  return Response.json({ message }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

/**
 * Fixed-window counter per key, bounded in size. Local and per isolate only;
 * a hosted deployment needs a shared limiter before this route is relied on.
 */
export function createInMemoryRateLimiter(options: Readonly<{ limit: number; windowMs: number; maxKeys?: number; now?: () => number }>) {
  const limit = options?.limit;
  const windowMs = options?.windowMs;
  const maxKeys = options?.maxKeys ?? 10_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1 || !Number.isSafeInteger(maxKeys) || maxKeys < 1) {
    throw new TypeError("invalid_rate_limiter_options");
  }
  const clock = options.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  return Object.freeze({
    consume(key: string): boolean {
      const now = clock();
      const existing = windows.get(key);
      if (existing && now - existing.start < windowMs) {
        if (existing.count >= limit) return false;
        existing.count += 1;
        return true;
      }
      if (existing) windows.delete(key);
      while (windows.size >= maxKeys) {
        const oldest = windows.keys().next().value;
        if (oldest === undefined) break;
        windows.delete(oldest);
      }
      windows.set(key, { start: now, count: 1 });
      return true;
    },
    size: () => windows.size,
  });
}
