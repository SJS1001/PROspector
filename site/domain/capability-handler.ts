import {
  CAPABILITY_IDS,
  projectCapabilityState,
  type CapabilityEvidence,
  type CapabilityId,
  type ObjectStorageProof,
} from "./capabilities";
import { csrfTokenFromRequest, CsrfTokenError, withCsrfCookie } from "./csrf";
import type { InterviewPrincipal } from "./interview";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";

type WorkspaceView = { id: string; companyName: string };

export type CapabilityHandlerDependencies = {
  database: unknown;
  pilotOwnerEmail: string;
  subjectPepper: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  getWorkspace(principal: InterviewPrincipal): Promise<WorkspaceView | null>;
  readEvidence(
    workspaceId: string,
  ): Promise<
    | Partial<Record<CapabilityId, CapabilityEvidence>>
    | Array<[CapabilityId, CapabilityEvidence]>
  >;
  prerequisites: {
    database: boolean;
    objectStorage: boolean;
    secrets: boolean;
  };
  issueCsrfToken(principalSubject: string): Promise<string>;
  consumeCsrfToken(principalSubject: string, token: string): Promise<void>;
  runStorageProof(
    workspace: WorkspaceView,
    principal: InterviewPrincipal,
  ): Promise<ObjectStorageProof>;
};

const DISPLAY_CAPABILITY_IDS = [
  CAPABILITY_IDS.trustedIdentity,
  CAPABILITY_IDS.authorization,
  CAPABILITY_IDS.database,
  CAPABILITY_IDS.objectStorage,
  CAPABILITY_IDS.isolation,
  CAPABILITY_IDS.mutationProtection,
  CAPABILITY_IDS.secretsAudit,
  CAPABILITY_IDS.providerBoundary,
] as const;

export async function handleCapabilitiesGet(
  dependencies: CapabilityHandlerDependencies,
): Promise<Response> {
  try {
    const principal = await admittedPrincipal(dependencies);
    const workspace = await dependencies.getWorkspace(principal);
    if (!workspace) return privateWorkspaceUnavailable();
    const evidence = evidenceMap(await dependencies.readEvidence(workspace.id));
    const capabilities = DISPLAY_CAPABILITY_IDS.map((capabilityId) =>
      projectCapabilityState({
        capabilityId,
        prerequisite: prerequisiteFor(capabilityId, dependencies.prerequisites),
        evidence: evidence.get(capabilityId) ?? null,
      }),
    );
    const response = json({
      ok: true,
      owner: { admitted: true },
      workspace: { companyName: workspace.companyName },
      overallStatus: overallStatus(capabilities.map((item) => item.status)),
      capabilities,
    });
    return withCsrfCookie(
      response,
      await dependencies.issueCsrfToken(principal.subject),
    );
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    return json({ error: "capability_status_unavailable" }, 503);
  }
}

export async function handleCapabilityProbePost(
  request: Request,
  dependencies: CapabilityHandlerDependencies,
): Promise<Response> {
  try {
    const principal = await admittedPrincipal(dependencies);
    const rejected = validateSameOriginMutation(
      request,
      "capability-proof",
      256,
    );
    if (rejected) return json({ error: rejected.error }, rejected.status);

    await dependencies.consumeCsrfToken(
      principal.subject,
      csrfTokenFromRequest(request),
    );
    const body = await readBoundedJson(request, 256);
    if (Object.keys(body).length !== 0) {
      return json({ error: "fixed_probe_only" }, 400);
    }

    const workspace = await dependencies.getWorkspace(principal);
    if (!workspace) return privateWorkspaceUnavailable();
    if (!dependencies.prerequisites.objectStorage) {
      return json(
        {
          error: "storage_proof_blocked",
          status: "blocked",
          reason: "The storage binding is unavailable.",
        },
        409,
      );
    }

    const proof = await dependencies.runStorageProof(workspace, principal);
    const response = json({
      ok: proof.status === "proven",
      proof,
    });
    return withCsrfCookie(
      response,
      await dependencies.issueCsrfToken(principal.subject),
    );
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (
      error instanceof CsrfTokenError ||
      (error instanceof Error &&
        "code" in error &&
        error.code === "invalid_csrf_token")
    ) {
      return json({ error: "invalid_csrf_token" }, 403);
    }
    if (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        "status" in error &&
        error.status === 413)
    ) {
      const tooLarge =
        error instanceof Error &&
        "status" in error &&
        error.status === 413;
      return json(
        { error: tooLarge ? "payload_too_large" : "invalid_json" },
        tooLarge ? 413 : 400,
      );
    }
    return json({ error: "storage_proof_unavailable" }, 503);
  }
}

async function admittedPrincipal(
  dependencies: CapabilityHandlerDependencies,
) {
  return admitPilotOwner(
    await dependencies.getIdentity(),
    dependencies.pilotOwnerEmail,
    dependencies.subjectPepper,
  );
}

function evidenceMap(
  evidence:
    | Partial<Record<CapabilityId, CapabilityEvidence>>
    | Array<[CapabilityId, CapabilityEvidence]>,
) {
  return new Map<CapabilityId, CapabilityEvidence>(
    Array.isArray(evidence)
      ? evidence
      : (Object.entries(evidence) as Array<[CapabilityId, CapabilityEvidence]>),
  );
}

function prerequisiteFor(
  capabilityId: CapabilityId,
  prerequisites: CapabilityHandlerDependencies["prerequisites"],
) {
  if (capabilityId === CAPABILITY_IDS.objectStorage) {
    return {
      available: prerequisites.objectStorage,
      reason: "The storage binding is unavailable.",
    };
  }
  if (
    capabilityId === CAPABILITY_IDS.secretsAudit ||
    capabilityId === CAPABILITY_IDS.providerBoundary
  ) {
    return {
      available: prerequisites.secrets && prerequisites.database,
      reason: "Required server configuration is unavailable.",
    };
  }
  return {
    available: prerequisites.database,
    reason: "Durable database access is unavailable.",
  };
}

function overallStatus(
  statuses: Array<"proven" | "blocked" | "unproven">,
) {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("unproven")) return "unproven";
  return "proven";
}

function privateWorkspaceUnavailable() {
  return json({ error: "private_workspace_unavailable" }, 404);
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
