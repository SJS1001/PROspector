export interface ObjectStoragePort {
  put(probeId: string, bytes: Uint8Array): Promise<void>;
  get(probeId: string): Promise<Uint8Array | null>;
  delete(probeId: string): Promise<void>;
  exists(probeId: string): Promise<boolean>;
}

export async function workspaceObjectPrefix(
  workspaceId: string,
): Promise<string> {
  if (!/^ws_[A-Za-z0-9_-]{3,128}$/.test(workspaceId)) {
    throw new Error("Invalid workspace scope");
  }
  const digest = await sha256(new TextEncoder().encode(workspaceId));
  return `workspaces/${digest}/capability-probes/`;
}

export async function workspaceProbeObjectKey(
  workspaceId: string,
  probeId: string,
): Promise<string> {
  if (!isProbeId(probeId)) throw new Error("Invalid probe identifier");
  return `${await workspaceObjectPrefix(workspaceId)}${probeId}`;
}

export function isProbeId(value: string): boolean {
  return /^[a-f0-9]{32}$/.test(value);
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
