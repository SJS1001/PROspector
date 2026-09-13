import type { InterviewPrincipal } from "./interview";
import {
  evaluateMonitoringReadiness,
  MonitoringContractError,
  type MonitoringSnapshot,
} from "./monitoring-readiness";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";

type Workspace = Readonly<{ id: string }>;

export type MonitoringSnapshotSource = Readonly<{
  read(workspaceId: string, observedAt: number): Promise<MonitoringSnapshot | unknown>;
}>;

export type MonitoringHandlerDependencies = Readonly<{
  pilotOwnerEmail: string;
  subjectPepper: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  getWorkspace(principal: InterviewPrincipal): Promise<Workspace | null>;
  source?: MonitoringSnapshotSource;
  now?: () => number;
}>;

/** GET-only, owner-derived read boundary. Callers supply no workspace, clock,
 * threshold, provider, or diagnostic authority. */
export async function handleMonitoringGet(
  request: Request,
  dependencies: MonitoringHandlerDependencies,
): Promise<Response> {
  try {
    const principal = await admitPilotOwner(
      await dependencies.getIdentity(),
      dependencies.pilotOwnerEmail,
      dependencies.subjectPepper,
    );
    if (new URL(request.url).search.length !== 0) return privateWorkspaceUnavailable();
    if (!dependencies.source) return monitoringUnavailable();
    const workspace = await dependencies.getWorkspace(principal);
    if (!workspace) return privateWorkspaceUnavailable();
    const now = dependencies.now?.() ?? Date.now();
    const snapshot = await dependencies.source.read(workspace.id, now);
    const readiness = evaluateMonitoringReadiness(snapshot, workspace.id, now);
    return json({ ok: true, ...readiness });
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof MonitoringContractError) return monitoringUnavailable();
    return monitoringUnavailable();
  }
}

export function monitoringUnavailable() {
  return json({ error: "monitoring_unavailable" }, 503);
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
