export const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
export const DIGEST = /^[a-f0-9]{64}$/u;
export const MAX_TIMESTAMP = 8_640_000_000_000_000;

export function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const keys = Object.keys(descriptors);
  if (keys.sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

export function syntheticId(value: unknown): string {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

export function digest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

export function timestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_TIMESTAMP) invalid();
  return value as number;
}

export function positiveInteger(value: unknown, maximum = 1_000_000_000): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) invalid();
  return value as number;
}

export function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function sha256Bytes(value: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(value);
  const hashed = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(hashed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Ascii(value: string): Promise<string> {
  if ([...value].some((character) => character.charCodeAt(0) > 0x7f)) invalid();
  return sha256Bytes(Uint8Array.from(value, (character) => character.charCodeAt(0)));
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function invalid(): never {
  throw new Error("invalid");
}
