type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readOperatorPreference(key: string, storage = browserStorage()) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeOperatorPreference(key: string, value: string, storage = browserStorage()) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Browser storage is an optional convenience, never an authority dependency.
  }
}

export function chooseOperatorPreference(
  preferred: string | null | undefined,
  authoritativeIds: readonly string[],
  fallback: string | null | undefined,
) {
  if (preferred && authoritativeIds.includes(preferred)) return preferred;
  if (fallback && authoritativeIds.includes(fallback)) return fallback;
  return null;
}
