export const CONTACTS_PAGE_LIMIT = 20;
export const CONTACTS_PAGE_INFO_SCHEMA = "contacts-page-info/v1" as const;
const CURSOR_SCHEMA = "contacts-cursor/v2" as const;
const CURSOR_DOMAIN = "prospector.contacts.cursor.v2";
const FEEDS = ["contacts", "identity", "approved"] as const;
export type ContactsFeed = typeof FEEDS[number];
export type ContactsPageKey = Readonly<{ time: number; id: string }>;
export type ContactsPageCursor = Readonly<{ highWater: ContactsPageKey | null; after: ContactsPageKey | null; generation: number | null; authorityDigest: string | null }>;
export type ContactsPageInfo = Readonly<{ schema: typeof CONTACTS_PAGE_INFO_SCHEMA; limit: 20; total: number; returned: number; hasNext: boolean; nextCursor: string | null }>;
export type ContactsPagination = Readonly<Record<ContactsFeed, ContactsPageCursor>>;
export type ContactsCursorScope = Readonly<{ workspaceId: string; principalSubject: string; secret: string; capabilityEpoch: string }>;

export class ContactsPaginationError extends Error { readonly status = 400; readonly code = "invalid_contacts_cursor"; constructor() { super("invalid_contacts_cursor"); } }
export class ContactsPageDriftError extends Error { readonly status = 409; readonly code = "contacts_page_drifted"; constructor() { super("contacts_page_drifted"); } }

export async function parseContactsPagination(request: Request, scope: ContactsCursorScope, now = Date.now()): Promise<ContactsPagination> {
  const requestTime = safeTime(now);
  const url = new URL(request.url);
  const names = { contactsCursor: "contacts", identityCursor: "identity", approvedCursor: "approved" } as const;
  for (const key of url.searchParams.keys()) if (!(key in names)) throw new ContactsPaginationError();
  const result = {} as Record<ContactsFeed, ContactsPageCursor>;
  for (const [key, feed] of Object.entries(names) as [keyof typeof names, ContactsFeed][]) {
    const values = url.searchParams.getAll(key);
    if (values.length > 1) throw new ContactsPaginationError();
    result[feed] = values.length === 0 ? Object.freeze({ highWater: null, after: null, generation: null, authorityDigest: null }) : await decodeCursor(values[0], feed, scope, requestTime);
  }
  return Object.freeze(result);
}

export async function pageInfo(feed: ContactsFeed, scope: ContactsCursorScope, cursor: ContactsPageCursor, total: number, rows: readonly Readonly<{ time: number; id: string }>[]): Promise<ContactsPageInfo> {
  if (!safeCount(total) || rows.length > CONTACTS_PAGE_LIMIT + 1 || rows.some((row) => !safeTime(row.time) || !opaqueId(row.id) || cursor.highWater !== null && compare(row, cursor.highWater) > 0)) throw new ContactsPaginationError();
  for (let index = 0; index < rows.length; index += 1) {
    if ((index > 0 && compare(rows[index - 1], rows[index]) <= 0) || (cursor.after && compare(rows[index], cursor.after) >= 0)) throw new ContactsPaginationError();
  }
  const returned = Math.min(rows.length, CONTACTS_PAGE_LIMIT), hasNext = rows.length > CONTACTS_PAGE_LIMIT;
  const last = returned > 0 ? rows[returned - 1] : undefined;
  if (total < returned + (hasNext ? 1 : 0) || hasNext && returned !== CONTACTS_PAGE_LIMIT || hasNext && cursor.highWater === null) throw new ContactsPaginationError();
  return Object.freeze({ schema: CONTACTS_PAGE_INFO_SCHEMA, limit: CONTACTS_PAGE_LIMIT, total, returned, hasNext, nextCursor: hasNext && last ? await encodeCursor(feed, scope, { highWater: cursor.highWater, after: { time: last.time, id: last.id }, generation: cursor.generation, authorityDigest: cursor.authorityDigest }) : null });
}

async function encodeCursor(feed: ContactsFeed, scope: ContactsCursorScope, cursor: ContactsPageCursor) {
  validateScope(scope); if (!FEEDS.includes(feed) || !cursor.highWater || !validKey(cursor.highWater) || !cursor.after || !validKey(cursor.after) || compare(cursor.after, cursor.highWater) > 0 || !safeGeneration(cursor.generation)) throw new ContactsPaginationError();
  if (feed === "approved" ? !digest(cursor.authorityDigest) : cursor.authorityDigest !== null) throw new ContactsPaginationError();
  const payload = JSON.stringify({ schema: CURSOR_SCHEMA, feed, highWater: cursor.highWater, after: cursor.after, generation: cursor.generation, authorityDigest: cursor.authorityDigest, capabilityEpoch: scope.capabilityEpoch });
  const signature = await sign(payload, scope);
  return `${base64url(new TextEncoder().encode(payload))}.${base64url(signature)}`;
}

async function decodeCursor(value: string, expectedFeed: ContactsFeed, scope: ContactsCursorScope, now: number): Promise<ContactsPageCursor> {
  try {
    validateScope(scope);
    if (typeof value !== "string" || value.length < 20 || value.length > 768 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const [encoded, signature] = value.split(".");
    const payload = new TextDecoder().decode(fromBase64url(encoded));
    if (!await crypto.subtle.verify("HMAC", await key(scope.secret), fromBase64url(signature), new TextEncoder().encode(bound(payload, scope)))) throw new Error();
    const parsed = JSON.parse(payload) as unknown;
    if (!exact(parsed, ["schema", "feed", "highWater", "after", "generation", "authorityDigest", "capabilityEpoch"]) || parsed.schema !== CURSOR_SCHEMA || parsed.feed !== expectedFeed || !digest(parsed.capabilityEpoch) || !validKey(parsed.highWater) || parsed.highWater.time > now || !validKey(parsed.after) || compare(parsed.after, parsed.highWater) > 0 || !safeGeneration(parsed.generation) || (expectedFeed === "approved" ? !digest(parsed.authorityDigest) : parsed.authorityDigest !== null)) throw new Error();
    if (parsed.capabilityEpoch !== scope.capabilityEpoch) throw new ContactsPageDriftError();
    return Object.freeze({ highWater: Object.freeze({ time: parsed.highWater.time, id: parsed.highWater.id }), after: Object.freeze({ time: parsed.after.time, id: parsed.after.id }), generation: parsed.generation, authorityDigest: parsed.authorityDigest });
  } catch (error) { if (error instanceof ContactsPageDriftError) throw error; throw new ContactsPaginationError(); }
}

async function sign(payload: string, scope: ContactsCursorScope) { return new Uint8Array(await crypto.subtle.sign("HMAC", await key(scope.secret), new TextEncoder().encode(bound(payload, scope)))); }
async function key(secret: string) { if (secret.length < 16) throw new ContactsPaginationError(); return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
function bound(payload: string, scope: ContactsCursorScope) { return `${CURSOR_DOMAIN}\n${scope.workspaceId}\n${scope.principalSubject}\n${payload}`; }
function validateScope(scope: ContactsCursorScope) { if (!opaqueId(scope.workspaceId) || !opaqueId(scope.principalSubject) || typeof scope.secret !== "string" || !digest(scope.capabilityEpoch)) throw new ContactsPaginationError(); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const actual = Object.keys(value as object).sort(), expected = [...keys].sort(); return actual.length === expected.length && actual.every((item, index) => item === expected[index]); }
function safeTime(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > 8_640_000_000_000_000) throw new ContactsPaginationError(); return value; }
function safeCount(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function safeGeneration(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER; }
function validKey(value: unknown): value is ContactsPageKey { return exact(value, ["time", "id"]) && Boolean(safeTime(value.time)) && opaqueId(value.id); }
function compare(left: ContactsPageKey, right: ContactsPageKey) { return left.time === right.time ? left.id < right.id ? -1 : left.id > right.id ? 1 : 0 : left.time < right.time ? -1 : 1; }
function opaqueId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value); }
function digest(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function base64url(bytes: Uint8Array) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, ""); }
function fromBase64url(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)); return Uint8Array.from(decoded, (character) => character.charCodeAt(0)); }
