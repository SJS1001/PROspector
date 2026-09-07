/** Presentation-only operator context.
 *
 * It records which commercial scope the operator is currently reading so the
 * shell can repeat it across tasks. It grants no authority: every command still
 * carries server-projected locators and every route re-derives its own scope.
 *
 * Two properties are load-bearing:
 *  - **Identity-keyed.** A stored context is only ever restored for the exact
 *    admitted identity key it was written under. Any other key discards it.
 *  - **Atomic.** A context is one frozen record replaced whole, in memory and in
 *    one storage entry, so a parent change can never be observed without its
 *    descendants already cleared.
 */

export const OPERATOR_SCOPES = ["company", "product", "marketPlay", "customerProfile"] as const;
export type OperatorScope = (typeof OPERATOR_SCOPES)[number];

export const OPERATOR_SCOPE_LABEL: Readonly<Record<OperatorScope, string>> = Object.freeze({
  company: "Company",
  product: "Product",
  marketPlay: "Market play",
  customerProfile: "Customer profile",
});

export type OperatorScopeEntry = Readonly<{ id: string; name: string }>;
export type OperatorContext = Readonly<
  { identityKey: string } & Readonly<Record<OperatorScope, OperatorScopeEntry | null>>
>;
export type OperatorContextPath = Readonly<Partial<Record<OperatorScope, OperatorScopeEntry | null>>>;

export const OPERATOR_CONTEXT_STORAGE_KEY = "prospector.operator-context";
const STORAGE_VERSION = 1;
const MAX_ID = 160;
const MAX_NAME = 240;
const MAX_IDENTITY_KEY = 128;

export function emptyOperatorContext(identityKey: string): OperatorContext {
  return Object.freeze({
    identityKey: safeIdentityKey(identityKey),
    company: null,
    product: null,
    marketPlay: null,
    customerProfile: null,
  });
}

/** A context is usable only under the exact identity key it was recorded for. */
export function operatorContextForIdentity(
  context: OperatorContext | null,
  identityKey: string,
): OperatorContext {
  const key = safeIdentityKey(identityKey);
  return context && context.identityKey === key && key !== ""
    ? context
    : emptyOperatorContext(key);
}

/** Replace one scope and clear every descendant in a single new record. */
export function setOperatorScope(
  context: OperatorContext | null,
  identityKey: string,
  scope: OperatorScope,
  entry: OperatorScopeEntry | null,
): OperatorContext {
  return applyScope(operatorContextForIdentity(context, identityKey), scope, entry);
}

/** Apply a whole server-projected path atomically. Scopes are folded in
 * hierarchy order, so a changed parent clears its descendants before the new
 * descendants are recorded, and only the finished record is ever returned. */
export function setOperatorPath(
  context: OperatorContext | null,
  identityKey: string,
  path: OperatorContextPath | null,
): OperatorContext {
  const base = operatorContextForIdentity(context, identityKey);
  if (!path) return clearOperatorContext(identityKey);
  let next = base;
  for (const scope of OPERATOR_SCOPES) next = applyScope(next, scope, path[scope] ?? null);
  return next;
}

export function clearOperatorContext(identityKey: string): OperatorContext {
  return emptyOperatorContext(identityKey);
}

export function operatorContextTrail(
  context: OperatorContext,
): readonly Readonly<{ scope: OperatorScope; label: string; entry: OperatorScopeEntry }>[] {
  return OPERATOR_SCOPES.flatMap((scope) => {
    const entry = context[scope];
    return entry ? [Object.freeze({ scope, label: OPERATOR_SCOPE_LABEL[scope], entry })] : [];
  });
}

export function isOperatorContextEmpty(context: OperatorContext): boolean {
  return OPERATOR_SCOPES.every((scope) => context[scope] === null);
}

/** Two records that would render the same text are separated by a plain-language
 * ordinal rather than a raw identifier; the exact ID stays in the closed
 * technical record beside the control. */
export function disambiguateOperatorLabels<T extends { id: string; name: string }>(
  entries: readonly T[],
): readonly Readonly<T & { label: string }>[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.name.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const key = entry.name.trim();
    const total = counts.get(key) ?? 1;
    if (total < 2) return Object.freeze({ ...entry, label: entry.name });
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    return Object.freeze({ ...entry, label: `${entry.name} (${ordinal} of ${total})` });
  });
}

type MinimalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Restore only a record written under this exact identity key. Anything else —
 * a different owner, a truncated record, or hostile content — is removed. */
export function readStoredOperatorContext(
  storage: MinimalStorage | null | undefined,
  identityKey: string,
): OperatorContext {
  const key = safeIdentityKey(identityKey);
  if (!storage || key === "") return emptyOperatorContext(key);
  let raw: string | null = null;
  try {
    raw = storage.getItem(OPERATOR_CONTEXT_STORAGE_KEY);
  } catch {
    return emptyOperatorContext(key);
  }
  if (raw === null) return emptyOperatorContext(key);
  const stored = parseStoredContext(raw);
  if (stored && stored.identityKey === key) return stored;
  try {
    storage.removeItem(OPERATOR_CONTEXT_STORAGE_KEY);
  } catch {
    /* a rejected removal still leaves the mismatched record unusable */
  }
  return emptyOperatorContext(key);
}

/** One storage entry written whole, so no partially updated context is visible. */
export function writeStoredOperatorContext(
  storage: MinimalStorage | null | undefined,
  context: OperatorContext,
): void {
  if (!storage) return;
  try {
    if (context.identityKey === "") {
      storage.removeItem(OPERATOR_CONTEXT_STORAGE_KEY);
      return;
    }
    storage.setItem(
      OPERATOR_CONTEXT_STORAGE_KEY,
      JSON.stringify({
        v: STORAGE_VERSION,
        identityKey: context.identityKey,
        company: context.company,
        product: context.product,
        marketPlay: context.marketPlay,
        customerProfile: context.customerProfile,
      }),
    );
  } catch {
    /* presentation state only; a full or blocked store changes no authority */
  }
}

function applyScope(
  context: OperatorContext,
  scope: OperatorScope,
  entry: OperatorScopeEntry | null,
): OperatorContext {
  const next = safeEntry(entry);
  const current = context[scope];
  if (sameEntry(current, next)) return context;
  const index = OPERATOR_SCOPES.indexOf(scope);
  const record: Record<string, unknown> = { identityKey: context.identityKey };
  for (const [position, name] of OPERATOR_SCOPES.entries()) {
    record[name] = position < index ? context[name] : position === index ? next : null;
  }
  return Object.freeze(record as unknown as OperatorContext);
}

function parseStoredContext(raw: string): OperatorContext | null {
  if (raw.length > 4096) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== STORAGE_VERSION) return null;
  const identityKey = safeIdentityKey(typeof value.identityKey === "string" ? value.identityKey : "");
  if (identityKey === "") return null;
  const record: Record<string, unknown> = { identityKey };
  for (const scope of OPERATOR_SCOPES) {
    const entry = value[scope];
    if (entry !== null && !isRecord(entry)) return null;
    record[scope] = entry === null ? null : safeEntry(entry as Partial<OperatorScopeEntry>);
  }
  return Object.freeze(record as unknown as OperatorContext);
}

function safeEntry(entry: Partial<OperatorScopeEntry> | null | undefined): OperatorScopeEntry | null {
  if (!entry) return null;
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!id || id.length > MAX_ID || !name || name.length > MAX_NAME) return null;
  return Object.freeze({ id, name });
}

function sameEntry(left: OperatorScopeEntry | null, right: OperatorScopeEntry | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.name === right.name;
}

function safeIdentityKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_IDENTITY_KEY && /^[A-Za-z0-9_-]+$/.test(normalized)
    ? normalized
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
