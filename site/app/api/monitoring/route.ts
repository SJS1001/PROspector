import { env } from "cloudflare:workers";
import {
  handleMonitoringGet,
  monitoringUnavailable,
  type MonitoringHandlerDependencies,
} from "../../../domain/monitoring-handler";
import type { InterviewPrincipal } from "../../../domain/interview";
import { runtimeIdentity, type RuntimeIdentityBindings } from "../../runtime-identity";

export const dynamic = "force-dynamic";

type MonitoringBindings = RuntimeIdentityBindings & Readonly<{
  DB?: D1Database;
  PILOT_OWNER_EMAIL?: string;
  OWNER_SUBJECT_PEPPER?: string;
}>;

export async function GET(request: Request) {
  try {
    const dependencies = composeDependencies(request, env as unknown as MonitoringBindings);
    return dependencies ? handleMonitoringGet(request, dependencies) : monitoringUnavailable();
  } catch {
    return monitoringUnavailable();
  }
}

/**
 * Monitoring stays uncomposed until a separately reviewed aggregate snapshot
 * source exists. The route is present so its HTTP/privacy contract can be
 * tested now; DB presence alone never activates a data reader.
 */
function composeDependencies(
  request: Request,
  bindings: MonitoringBindings,
): MonitoringHandlerDependencies | undefined {
  if (!bindings.DB || !bindings.PILOT_OWNER_EMAIL || !bindings.OWNER_SUBJECT_PEPPER) return undefined;
  return {
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    getIdentity: async () => runtimeIdentity(request, bindings),
    getWorkspace: (principal) => workspaceFor(bindings.DB as D1Database, principal),
    source: undefined,
  };
}

async function workspaceFor(database: D1Database, principal: InterviewPrincipal) {
  const row = await database.prepare(
    `SELECT id FROM workspaces
     WHERE owner_subject IN (?, ?)
     ORDER BY CASE WHEN owner_subject = ? THEN 0 ELSE 1 END
     LIMIT 1`,
  ).bind(principal.subject, principal.legacySubject, principal.subject).first<{ id: string }>();
  return row ? { id: row.id } : null;
}
