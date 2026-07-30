import { R2ObjectStorage } from "../../adapters/cloudflare/r2-object-storage";
import {
  CAPABILITY_IDS,
  runObjectStorageProof,
  type CapabilityEvidence,
  type CapabilityId,
} from "../../domain/capabilities";
import type { CapabilityHandlerDependencies } from "../../domain/capability-handler";
import { consumeCsrfToken, issueCsrfToken } from "../../domain/csrf";
import type { InterviewPrincipal } from "../../domain/interview";
import { getChatGPTUser } from "../chatgpt-auth";

export type CapabilityBindings = {
  DB: D1Database;
  FILES?: R2Bucket;
  OWNER_SUBJECT_PEPPER: string;
  PILOT_OWNER_EMAIL: string;
};

export function capabilityDependencies(
  bindings: CapabilityBindings,
): CapabilityHandlerDependencies {
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    getIdentity: async () => {
      const user = await getChatGPTUser();
      return user
        ? { email: user.email, displayName: user.displayName }
        : null;
    },
    getWorkspace: (principal) => workspaceFor(bindings.DB, principal),
    readEvidence: (workspaceId) => readEvidence(bindings.DB, workspaceId),
    prerequisites: {
      database: true,
      objectStorage: Boolean(bindings.FILES),
      secrets: true,
    },
    issueCsrfToken: (subject) => issueCsrfToken(bindings.DB, subject),
    consumeCsrfToken: (subject, token) =>
      consumeCsrfToken(bindings.DB, subject, token),
    runStorageProof: async (workspace, principal) => {
      if (!bindings.FILES) throw new Error("Storage binding unavailable");
      const proof = await runObjectStorageProof(
        new R2ObjectStorage(bindings.FILES, workspace.id),
      );
      await recordStorageProof(bindings.DB, workspace.id, principal, proof);
      return proof;
    },
  };
}

async function workspaceFor(
  database: D1Database,
  principal: InterviewPrincipal,
) {
  const workspace = await database
    .prepare(
      "SELECT id, company_name FROM workspaces WHERE owner_subject IN (?, ?) ORDER BY CASE WHEN owner_subject = ? THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(principal.subject, principal.legacySubject, principal.subject)
    .first<{ id: string; company_name: string }>();
  return workspace
    ? { id: workspace.id, companyName: workspace.company_name }
    : null;
}

async function readEvidence(database: D1Database, workspaceId: string) {
  const rows = await database
    .prepare(
      `SELECT id, action, detail_json, created_at
       FROM audit_events
       WHERE workspace_id = ? AND action IN (
         'workspace.interview_initialized',
         'interview.recommendation_confirmed',
         'capability.object_storage_proof'
       )
       ORDER BY created_at DESC`,
    )
    .bind(workspaceId)
    .all<{
      id: string;
      action: string;
      detail_json: string;
      created_at: number;
    }>();

  const evidence: Partial<Record<CapabilityId, CapabilityEvidence>> = {};
  for (const row of rows.results) {
    if (row.action === "capability.object_storage_proof") {
      if (evidence[CAPABILITY_IDS.objectStorage]) continue;
      const detail = safeDetail(row.detail_json);
      evidence[CAPABILITY_IDS.objectStorage] = {
        reference: row.id,
        checkedAt: row.created_at,
        outcome: detail.outcome === "passed" ? "passed" : "failed",
        steps: isProofSteps(detail.steps) ? detail.steps : {},
      };
    } else if (row.action === "workspace.interview_initialized") {
      for (const capabilityId of [
        CAPABILITY_IDS.trustedIdentity,
        CAPABILITY_IDS.authorization,
        CAPABILITY_IDS.database,
      ]) {
        evidence[capabilityId] ??= {
          reference: row.id,
          checkedAt: row.created_at,
          outcome: "passed",
        };
      }
    } else if (row.action === "interview.recommendation_confirmed") {
      evidence[CAPABILITY_IDS.mutationProtection] ??= {
        reference: row.id,
        checkedAt: row.created_at,
        outcome: "passed",
      };
    }
  }
  return evidence;
}

async function recordStorageProof(
  database: D1Database,
  workspaceId: string,
  principal: InterviewPrincipal,
  proof: Awaited<ReturnType<typeof runObjectStorageProof>>,
) {
  const auditId = `ae_cap_${proof.probeId.slice(0, 24)}`;
  await database
    .prepare(
      `INSERT INTO audit_events
       (id, workspace_id, actor_type, actor_id, action, subject_type, subject_id, detail_json, created_at)
       VALUES (?, ?, 'owner', ?, 'capability.object_storage_proof', 'capability', ?, ?, ?)`,
    )
    .bind(
      auditId,
      workspaceId,
      principal.subject,
      proof.evidenceReference,
      JSON.stringify({
        capabilityId: CAPABILITY_IDS.objectStorage,
        outcome: proof.status === "proven" ? "passed" : "failed",
        steps: proof.steps,
        digest: proof.digest,
        checkedAt: proof.checkedAt,
      }),
      proof.checkedAt,
    )
    .run();
}

function safeDetail(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isProofSteps(
  value: unknown,
): value is NonNullable<CapabilityEvidence["steps"]> {
  if (!value || typeof value !== "object") return false;
  return ["put", "read", "digest", "delete", "absence"].every(
    (key) => typeof (value as Record<string, unknown>)[key] === "boolean",
  );
}
