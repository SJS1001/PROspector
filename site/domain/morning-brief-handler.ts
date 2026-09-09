import { readMorningBrief, type MorningBriefReadResult } from "./morning-brief-read";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { torontoWeekForInstant } from "./weekly-outcome";

export type MorningBriefHandlerDependencies = Readonly<{
  database: D1Database;
  pilotOwnerEmail: string;
  subjectPepper: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
  now?: () => number;
  read?: typeof readMorningBrief;
}>;

/** GET-only owner boundary. The request carries no workspace, scope, profile,
 * clock, or reporting-window authority. */
export async function handleMorningBriefGet(
  request: Request,
  dependencies: MorningBriefHandlerDependencies,
): Promise<Response> {
  try {
    const principal = await admitPilotOwner(
      await dependencies.getIdentity(),
      dependencies.pilotOwnerEmail,
      dependencies.subjectPepper,
    );
    if (new URL(request.url).search.length !== 0) return denied();
    const now = dependencies.now?.() ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("invalid server clock");
    const asOf = new Date(now).toISOString();
    const week = torontoWeekForInstant(asOf);
    const result: MorningBriefReadResult = await (dependencies.read ?? readMorningBrief)(
      dependencies.database,
      principal,
      {
        asOf,
        reviewWindowStart: week.start.instant,
        reviewWindowEndExclusive: week.endExclusive.instant,
      },
    );
    if (result.status !== "available") return denied();
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PilotAccessError) return denied();
    return morningBriefReadFailure();
  }
}

function denied() {
  return json({ error: "private_workspace_unavailable" }, 404);
}

export function morningBriefReadFailure() {
  return json({ error: "morning_brief_unavailable" }, 503);
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
