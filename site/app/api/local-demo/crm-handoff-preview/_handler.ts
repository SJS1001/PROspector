import { env } from "cloudflare:workers";
import { isLocalDemoRequest, runtimeIdentity } from "../../../runtime-identity";
import { admitPilotOwner } from "../../../../domain/pilot-access";
import { encodeCrmCsv } from "../../../../domain/crm-csv-codec";
import {
  projectCrmHandoff,
  projectCrmHandoffRow,
} from "../../../../domain/crm-handoff-projection";

/**
 * Local-demo CRM handoff preview.
 *
 * Authorized by the owner on 2026-09-08 as a narrow exception to the Phase 7
 * stop condition: an in-memory, fictional-data-only CSV preview. See
 * `.planning/phases/07-mining-pilot-handoff-and-recovery/07-PREPARATION.md`,
 * "Local-demo CRM handoff preview exception".
 *
 * Two things are returned, and they are deliberately separate:
 *
 *   `decision` is the real seam. It runs the fictional candidates through
 *   `projectCrmHandoff`, which consults `recheckForCrmExport`. That boundary
 *   reports blocked, so `admitted` is empty and every candidate is refused.
 *   This route does not and cannot change that.
 *
 *   `preview` is a demonstration of the codec over the same fictional rows. It
 *   exists so a browser owner can see the byte policy applied. These rows were
 *   NOT admitted by the decision, and the response says so in a field rather
 *   than leaving it to be inferred.
 *
 * The fictional rows never leave memory: no file is written, no
 * `Content-Disposition` is set, no download is offered, nothing is persisted,
 * no D1 or R2 write occurs, no provider is reached, and no real row is read.
 * The handler takes no request body and accepts no caller-supplied rows, so it
 * cannot be used to serialize real data.
 */

type PreviewBindings = {
  OWNER_SUBJECT_PEPPER?: string;
  PILOT_OWNER_EMAIL?: string;
  LOCAL_DEMO?: string;
  TRUSTED_IDENTITY_PROVIDER?: string;
  CLOUDFLARE_ACCESS_ISSUER?: unknown;
  CLOUDFLARE_ACCESS_AUDIENCE?: unknown;
};

const DEMO_DIGEST = "b".repeat(64);
const DEMO_NOW = Date.parse("2026-09-08T12:00:00.000Z");

/** Fictional throughout: example.test addresses and reserved-range numbers. */
function fictionalCandidates() {
  const authority = (patch: Record<string, unknown> = {}) => ({
    prospectId: "demo-prospect-1",
    configurationId: "demo-configuration-1",
    configurationDigest: DEMO_DIGEST,
    profileAvailable: true,
    configurationCurrent: true,
    drifted: false,
    disqualified: false,
    suppressed: false,
    phase4Approved: true,
    contactCapabilityEnabled: true,
    ...patch,
  });
  const eligibilityInput = (patch: Record<string, unknown> = {}) => ({
    now: DEMO_NOW,
    target: {
      workspaceId: "demo-workspace-1",
      prospectId: "demo-prospect-1",
      contactId: "demo-contact-1",
    },
    strategy: {
      configurationId: "demo-configuration-1",
      configurationDigest: DEMO_DIGEST,
    },
    authority: authority(),
    points: [],
    ...patch,
  });
  return [
    {
      prospectId: "demo-prospect-1",
      contactId: "demo-contact-1",
      contactPointId: "demo-point-1",
      eligibilityInput: eligibilityInput(),
      cells: {
        prospect_id: "demo-prospect-1",
        contact_id: "demo-contact-1",
        contact_point_id: "demo-point-1",
        contact_kind: "email",
        contact_value: "fictional.buyer@example.test",
        account_target: "Northern, Metals",
        selected_role: 'Operations "lead"',
      },
    },
    {
      prospectId: "demo-prospect-2",
      contactId: "demo-contact-2",
      contactPointId: "demo-point-2",
      eligibilityInput: eligibilityInput({
        authority: authority({ suppressed: true }),
      }),
      cells: {
        prospect_id: "demo-prospect-2",
        contact_id: "demo-contact-2",
        contact_point_id: "demo-point-2",
        contact_kind: "phone",
        contact_value: "+15555550123",
      },
    },
  ];
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function handleCrmHandoffPreview(request: Request) {
  const bindings = env as unknown as PreviewBindings;
  if (!isLocalDemoRequest(request, bindings)) return notFound();
  if (!sameOrigin(request)) return notFound();
  if (!bindings.PILOT_OWNER_EMAIL || !bindings.OWNER_SUBJECT_PEPPER) return notFound();
  try {
    await admitPilotOwner(
      await runtimeIdentity(request, bindings),
      bindings.PILOT_OWNER_EMAIL,
      bindings.OWNER_SUBJECT_PEPPER,
    );
  } catch {
    return notFound();
  }

  const candidates = fictionalCandidates();
  const decision = projectCrmHandoff({ evaluatedAt: DEMO_NOW, candidates });

  // The demonstration serialization. These are the fictional rows, not the
  // decision's admitted rows -- which are empty, and must stay empty.
  const rows = candidates.map((candidate) => projectCrmHandoffRow(candidate.cells));
  const document = await encodeCrmCsv(rows);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(document.bytes);

  return Response.json({
    kind: "crm_handoff_local_demo_preview",
    fictional: true,
    decision: {
      admitted: decision.admitted,
      refused: decision.refused,
      admittedRowCount: decision.admittedRowCount,
      refusedCount: decision.refusedCount,
      uniqueProspectCount: decision.uniqueProspectCount,
      effects: decision.effects,
    },
    preview: {
      previewRowsAreFictionalAndUnadmitted: true,
      schemaVersion: document.schemaVersion,
      encoding: document.encoding,
      byteOrderMark: document.byteOrderMark,
      recordSeparator: document.recordSeparator,
      byteLength: document.byteLength,
      sha256: document.sha256,
      text,
    },
    exportAuthorized: false,
    deliveryAuthorized: false,
    downloadAuthorized: false,
    persistenceAuthorized: false,
    providerInvocationAuthorized: false,
  }, { headers: { "cache-control": "no-store" } });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}
