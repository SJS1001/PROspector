/**
 * Narrow immutable CRM-artifact delivery port.
 *
 * The trusted domain decides whether a stored artifact may be written.
 * An implementation may persist only the exact bytes and digests it is given.
 * This file defines that boundary. It does not store, download, or call a CRM.
 */

export type ImmutableExportArtifactPut = Readonly<{
  workspaceId: string;
  artifactId: string;
  version: number;
  csvSha256: string;
  manifestSha256: string;
  byteLength: number;
}>;

export type ExportDeliveryPort = Readonly<{
  putImmutable(artifact: ImmutableExportArtifactPut): Promise<void>;
}>;

/**
 * Narrow immutable object port for CRM handoff CSV bytes (Plan 07-06).
 *
 * `putImmutable` stores the exact bytes under a new key. It must refuse
 * (throw) when the bytes do not match `contentSha256`, or when different bytes
 * already exist under that key. It must accept an identical re-put, so a retry
 * is safe. `get` returns the stored bytes or null. There is no delete, list,
 * overwrite, URL, or CRM method. No production binding exists; only tests
 * supply an in-memory implementation.
 */
export type ExportArtifactObjectPort = Readonly<{
  putImmutable(objectKey: string, bytes: Uint8Array, contentSha256: string): Promise<void>;
  get(objectKey: string): Promise<Uint8Array | null>;
}>;
