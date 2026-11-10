/**
 * Plan 07-06: D1-backed store for the CSV CRM handoff service, over the 0023
 * evidence tables through `handoff-recovery-repository.ts`. Local only.
 *
 * One materialized version is written as three idempotent repository commands
 * with keys derived from the service idempotency key:
 *
 *   1. export snapshot   the frozen contactable rows, each bound to its D1
 *                        Prospect, Contact, selected contact-point digest and
 *                        approved Package version/approval, behind the
 *                        suppression fence the service read before planning
 *                        (0023 refuses a stale fence or revoked/expired lineage);
 *   2. export artifact   the exact-byte checksum, byte length, object key and a
 *                        store envelope (service version, snapshot digest,
 *                        artifact manifest, and the exclusion ledger of safe
 *                        identity references and reason codes, never a contact
 *                        value);
 *   3. delivery issued   the download window.
 *
 * The CSV bytes go to an injected immutable object port; no production
 * binding exists. Every repository call re-admits the owner and workspace
 * against `workspaces`, which is the download re-authorization.
 *
 * Each snapshot row is the exported row's own lineage: the store refuses a row
 * whose `authorityRef` names another Prospect or Contact (the service also
 * binds the contact-point digest to the exported value).
 *
 * Partial writes: an artifact recorded without its issued event cannot be
 * downloaded. The envelope carries the service key and the original window,
 * so the next `lookup` (any retry, by key or by the latest fallback) records
 * the missing issued event with that same window -- never a new one -- under
 * the same idempotent command key. That is the only write `lookup` makes.
 * Before any write, a version whose bytes another artifact already holds is
 * refused, so no snapshot is left without its artifact.
 *
 * Production composition (`createD1CrmHandoffPorts`) always wires the blocked
 * `recheckForCrmExport` eligibility port and the real suppression resolver; it
 * accepts no override, so it refuses every candidate today. Nothing here calls
 * a provider, a CRM, a route, or the network.
 */

import {
  CrmHandoffStoreError,
  createCrmExportEligibilityPort,
  type CrmHandoffAccessStorePort,
  type CrmHandoffPorts,
  type CrmHandoffSourceRead,
  type CrmHandoffStoreRecord,
} from "./crm-handoff";
import type { StoredCrmHandoffArtifact } from "./crm-handoff-delivery";
import {
  createD1HandoffRecoveryRepository,
  type ExportArtifactView,
  type HandoffRecoveryScope,
} from "./handoff-recovery-repository";
import type { ExportArtifactObjectPort } from "./ports/export-delivery";
import { createSuppressionResolver } from "./suppression";

export const CRM_HANDOFF_STORE_SCHEMA = "prospector/crm-handoff-store/v1";
const POLICY_SCHEMA = "prospector/crm-handoff-policy/v1";
const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;

export type CrmHandoffD1StoreOptions = Readonly<{ objects: ExportArtifactObjectPort }>;

export type CrmHandoffD1Store = CrmHandoffAccessStorePort & Readonly<{
  readSuppressionFenceCount(): Promise<number>;
}>;

export function createD1CrmHandoffStore(
  database: D1Database,
  scope: HandoffRecoveryScope,
  options: CrmHandoffD1StoreOptions,
): CrmHandoffD1Store {
  const objects = options?.objects;
  if (!objects || typeof objects.putImmutable !== "function" || typeof objects.get !== "function") invalid();
  const repository = createD1HandoffRecoveryRepository(database, scope);
  const workspaceId = scope.workspaceId;
  const clock = scope.now ?? Date.now;
  const inScope = (requested: unknown) => {
    if (requested !== workspaceId) invalid();
  };

  const viewFor = async (artifactId: string) => {
    if (typeof artifactId !== "string" || !ID.test(artifactId)) invalid();
    const view = await repository.readExportArtifact({ by: "objectKey", objectKey: await objectKeyFor(workspaceId, artifactId) });
    if (!view) return null;
    const stored = toStored(workspaceId, view, view.idempotencyKey);
    if (stored.artifactId !== artifactId) unavailable();
    return { view, stored };
  };

  /** Records the issued event an interrupted write left out, with its original window. */
  const completeInterruptedIssue = async (view: ExportArtifactView): Promise<ExportArtifactView> => {
    if (view.delivery.issued || view.delivery.terminal) return view;
    const envelope = view.manifest as Record<string, unknown>;
    const serviceKey = envelope.serviceIdempotencyKey;
    const issuedAt = envelope.deliveryIssuedAt;
    const expiresAt = envelope.deliveryExpiresAt;
    if (
      typeof serviceKey !== "string" || !ID.test(serviceKey)
      || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || (expiresAt as number) <= (issuedAt as number)
    ) return view;
    await repository.recordDeliveryEvent({
      subjectKind: "export_artifact",
      subjectId: view.id,
      eventKind: "issued",
      expiresAt: expiresAt as number,
      reasonCode: "artifact_issued",
      occurredAt: issuedAt as number,
      idempotencyKey: (await commandKeys(serviceKey)).issued,
    });
    return (await repository.readExportArtifact({ by: "objectKey", objectKey: view.objectKey })) ?? view;
  };

  const store: CrmHandoffD1Store = {
    async readSuppressionFenceCount() {
      return (await repository.readSuppressionFence()).tombstoneCount;
    },

    async lookup(request) {
      inScope(request?.workspaceId);
      if (typeof request.idempotencyKey !== "string" || !ID.test(request.idempotencyKey)) invalid();
      const keys = await commandKeys(request.idempotencyKey);
      const byKey = await repository.readExportArtifact({ by: "idempotencyKey", idempotencyKey: keys.artifact });
      if (byKey) return toStored(workspaceId, await completeInterruptedIssue(byKey), request.idempotencyKey);
      const latest = await repository.readExportArtifact({ by: "latest" });
      return latest ? toStored(workspaceId, await completeInterruptedIssue(latest), latest.idempotencyKey) : null;
    },

    async putImmutable(record: CrmHandoffStoreRecord) {
      const { stored } = record ?? ({} as CrmHandoffStoreRecord);
      inScope(stored?.workspaceId);
      if (
        !(record.bytes instanceof Uint8Array) || record.bytes.byteLength === 0
        || !Number.isSafeInteger(record.suppressionFenceCount) || (record.suppressionFenceCount as number) < 0
        || !DIGEST.test(record.configurationDigest) || !Array.isArray(record.rows) || record.rows.length === 0
        || record.rows.some((row) => !row.authorityRef || row.authorityRef.prospectId !== row.prospectId || row.authorityRef.contactId !== row.contactId)
        || !Array.isArray(record.packageDigests) || !record.packageDigests.every((value) => DIGEST.test(value))
        || record.manifest?.csvSha256 !== stored.csvSha256 || record.manifest?.artifactSha256 !== stored.manifestSha256
        || (await sha256(record.bytes)) !== stored.csvSha256
      ) invalid();
      const keys = await commandKeys(stored.idempotencyKey);
      const objectKey = await objectKeyFor(workspaceId, stored.artifactId);
      const issuedAt = clock();
      const expiresAt = Date.parse(stored.deliveryExpiresAt);
      if (!Number.isSafeInteger(issuedAt) || !(expiresAt > issuedAt)) invalid();
      // 0023 keeps one artifact per workspace content checksum: refuse before
      // writing anything rather than leave a snapshot without its artifact.
      const sameBytes = await repository.readExportArtifact({ by: "contentSha256", contentSha256: stored.csvSha256 });
      if (sameBytes && sameBytes.objectKey !== objectKey) invalid();

      let snapshot;
      try {
        snapshot = await repository.recordExportSnapshot({
          exportDefinitionDigest: stored.exportDefinitionDigest,
          policyDigest: await digestJson({
            schema: POLICY_SCHEMA,
            privacyPolicy: record.manifest.privacyPolicy,
            csvSchemaVersion: record.manifest.csvSchemaVersion,
            artifactId: stored.artifactId,
            version: stored.version,
            snapshotDigest: stored.snapshotDigest,
          }),
          configurationDigest: record.configurationDigest,
          packageSetDigest: await digestJson({ schema: "prospector/crm-handoff-package-set/v1", packageDigests: [...record.packageDigests].sort() }),
          suppressionFenceCount: record.suppressionFenceCount as number,
          rows: record.rows.map((row) => ({
            prospectId: row.authorityRef!.prospectId,
            contactId: row.authorityRef!.contactId,
            contactPointDigest: row.authorityRef!.contactPointDigest,
            packageVersionId: row.authorityRef!.packageVersionId,
            packageApprovalId: row.authorityRef!.packageApprovalId,
          })),
          // 0023 exclusions cite tombstone ids, which the scope-aware resolver
          // does not return; the service exclusion ledger is kept in the
          // artifact envelope below instead.
          exclusions: [],
          idempotencyKey: keys.snapshot,
        });
      } catch (error) {
        if (String((error as Error)?.message).endsWith(":suppression_fence_stale")) throw new CrmHandoffStoreError("crm_handoff_store_fence_stale");
        throw error;
      }

      await objects.putImmutable(objectKey, Uint8Array.from(record.bytes), stored.csvSha256);

      const artifact = await repository.recordExportArtifact({
        snapshotId: snapshot.id,
        schemaVersion: record.manifest.schema,
        mediaType: "text/csv",
        objectKey,
        contentSha256: stored.csvSha256,
        byteLength: record.bytes.byteLength,
        manifest: {
          schema: CRM_HANDOFF_STORE_SCHEMA,
          artifactId: stored.artifactId,
          version: stored.version,
          serviceIdempotencyKey: stored.idempotencyKey,
          deliveryIssuedAt: issuedAt,
          deliveryExpiresAt: expiresAt,
          snapshotDigest: stored.snapshotDigest,
          exportDefinitionDigest: stored.exportDefinitionDigest,
          manifestSha256: stored.manifestSha256,
          artifactManifest: { ...record.manifest, fieldIds: [...record.manifest.fieldIds] },
          exclusions: record.exclusions.map((entry) => ({
            prospectId: entry.prospectId, contactId: entry.contactId, contactPointId: entry.contactPointId, reason: entry.reason,
          })),
        },
        idempotencyKey: keys.artifact,
      });

      await repository.recordDeliveryEvent({
        subjectKind: "export_artifact",
        subjectId: artifact.id,
        eventKind: "issued",
        expiresAt,
        reasonCode: "artifact_issued",
        occurredAt: issuedAt,
        idempotencyKey: keys.issued,
      });
    },

    async readArtifact(request) {
      inScope(request?.workspaceId);
      return (await viewFor(request.artifactId))?.stored ?? null;
    },

    async readBytes(request) {
      inScope(request?.workspaceId);
      const found = await viewFor(request.artifactId);
      if (!found) return null;
      const bytes = await objects.get(found.view.objectKey);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== found.view.byteLength) return null;
      return bytes;
    },

    async recordDeliveryEnd(request) {
      inScope(request?.workspaceId);
      const found = await viewFor(request.artifactId);
      if (!found) unavailable();
      await repository.recordDeliveryEvent({
        subjectKind: "export_artifact",
        subjectId: found!.view.id,
        eventKind: request.eventKind,
        expiresAt: null,
        reasonCode: request.reasonCode,
        occurredAt: clock(),
        idempotencyKey: `crmh-${(await sha256Text(request.artifactId)).slice(0, 40)}-end`,
      });
    },

    async recordAccessRefusal(request) {
      inScope(request?.workspaceId);
      const found = await viewFor(request.artifactId);
      await repository.recordRefusal({
        action: "delivery.event",
        subjectKind: "export_artifact",
        subjectId: found?.view.id ?? null,
        reasonCode: request.reasonCode,
      });
    },
  };
  return Object.freeze(store);
}

/**
 * Production composition for one admitted owner workspace. Eligibility is
 * always the blocked `recheckForCrmExport` port and suppression is always the
 * real resolver; any attempt to supply either, or a store, is refused.
 */
export function createD1CrmHandoffPorts(
  database: D1Database,
  scope: HandoffRecoveryScope,
  options: Readonly<{ source: Readonly<{ read(workspaceId: string): Promise<CrmHandoffSourceRead> }>; objects: ExportArtifactObjectPort }>,
): CrmHandoffPorts {
  if (!options || typeof options !== "object" || Object.keys(options).sort().join(",") !== "objects,source") invalid();
  if (typeof options.source?.read !== "function") invalid();
  const now = scope.now ?? Date.now;
  return Object.freeze({
    source: options.source,
    eligibility: createCrmExportEligibilityPort(),
    suppression: createSuppressionResolver(database, scope),
    store: createD1CrmHandoffStore(database, scope, { objects: options.objects }),
    clock: Object.freeze({ nowIso: () => new Date(now()).toISOString() }),
  });
}

// -- internals --------------------------------------------------------------

function toStored(workspaceId: string, view: ExportArtifactView, idempotencyKey: string): StoredCrmHandoffArtifact {
  const envelope = view.manifest as Record<string, unknown>;
  const inner = envelope.artifactManifest as Record<string, unknown> | undefined;
  if (
    envelope.schema !== CRM_HANDOFF_STORE_SCHEMA || typeof envelope.artifactId !== "string"
    || !Number.isSafeInteger(envelope.version) || (envelope.version as number) < 1
    || typeof envelope.snapshotDigest !== "string" || typeof envelope.exportDefinitionDigest !== "string"
    || typeof envelope.manifestSha256 !== "string" || inner?.csvSha256 !== view.contentSha256
  ) unavailable();
  const { issued, terminal } = view.delivery;
  return Object.freeze({
    workspaceId,
    artifactId: envelope.artifactId as string,
    version: envelope.version as number,
    snapshotDigest: envelope.snapshotDigest as string,
    exportDefinitionDigest: envelope.exportDefinitionDigest as string,
    idempotencyKey,
    csvSha256: view.contentSha256,
    manifestSha256: envelope.manifestSha256 as string,
    // An artifact without its issued event (a partial write) is never downloadable.
    deliveryState: !issued ? "failed" as const : terminal ? terminal.eventKind : "available" as const,
    deliveryExpiresAt: new Date(issued ? issued.expiresAt : view.createdAt).toISOString(),
  });
}

async function commandKeys(serviceKey: string) {
  const base = `crmh-${(await sha256Text(serviceKey)).slice(0, 40)}`;
  return { snapshot: `${base}-s`, artifact: `${base}-a`, issued: `${base}-i` };
}

async function objectKeyFor(workspaceId: string, artifactId: string) {
  return `crm-handoff/${(await sha256Text(workspaceId)).slice(0, 32)}/${(await sha256Text(artifactId)).slice(0, 40)}.csv`;
}

function invalid(): never {
  throw new CrmHandoffStoreError("crm_handoff_store_invalid");
}

function unavailable(): never {
  throw new CrmHandoffStoreError("crm_handoff_store_unavailable");
}

async function digestJson(value: Record<string, unknown>) {
  return sha256Text(JSON.stringify(sortKeys(value)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

async function sha256Text(value: string) {
  return sha256(new TextEncoder().encode(value));
}

async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
