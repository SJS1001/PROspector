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
