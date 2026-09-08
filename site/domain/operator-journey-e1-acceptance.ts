import { principalFromIdentity, type InterviewPrincipal } from "./interview";
import { seedPersonDiscoveryC4 } from "./person-discovery-c4-acceptance";

/** Work Unit E1 operator-journey acceptance fixture.
 *
 * The C4 fixture already builds the whole governed hierarchy up to one
 * *approved* Prospect. Review acceptance needs the state before that decision,
 * so this adds exactly one more synthetic candidate, its Passed assessment, and
 * a `qualified` Prospect with no review decision. The browser then makes that
 * decision itself, which is the behaviour under test.
 *
 * It composes no provider and no discovery service: E1 drives only services the
 * runtime already exposes.
 */
export const OPERATOR_JOURNEY_E1_BINDING_VALUE = "synthetic-zero-network-e1-v1";
export const OPERATOR_JOURNEY_E1_PROSPECT_ID = "e1-qualified-prospect";
export const OPERATOR_JOURNEY_E1_ASSESSMENT_ID = "e1-assessment";
const NOW = 1_788_000_000_000;

type Bindings = Readonly<{
  PROSPECTOR_OPERATOR_JOURNEY_E1?: unknown;
  TRUSTED_IDENTITY_PROVIDER?: unknown;
  LOCAL_DEMO?: unknown;
}>;

export function operatorJourneyE1Enabled(request: Request, bindings: Bindings) {
  const url = new URL(request.url);
  return import.meta.env.DEV
    && bindings.PROSPECTOR_OPERATOR_JOURNEY_E1 === OPERATOR_JOURNEY_E1_BINDING_VALUE
    && bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo"
    && bindings.LOCAL_DEMO === "1"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1");
}

export async function seedOperatorJourneyE1(database: D1Database, ownerEmail: string, ownerPepper: string) {
  await seedPersonDiscoveryC4(database, ownerEmail, ownerPepper);
  const owner = await principalFromIdentity(ownerEmail, "Local Demo Owner", ownerPepper);
  const workspace = await database
    .prepare("SELECT id FROM workspaces WHERE owner_subject IN (?,?) LIMIT 1")
    .bind(owner.subject, owner.legacySubject ?? owner.subject)
    .first<{ id: string }>();
  if (!workspace) throw new Error("e1_workspace_missing");
  const existing = await database
    .prepare("SELECT id FROM profile_prospects WHERE workspace_id=? AND id=?")
    .bind(workspace.id, OPERATOR_JOURNEY_E1_PROSPECT_ID)
    .first();
  if (existing) return ready();
  await seedQualifiedProspect(database, owner, workspace.id);
  return ready();
}

function ready() {
  return Object.freeze({
    status: "ready" as const,
    prospectId: OPERATOR_JOURNEY_E1_PROSPECT_ID,
    assessmentId: OPERATOR_JOURNEY_E1_ASSESSMENT_ID,
  });
}

async function seedQualifiedProspect(database: D1Database, owner: InterviewPrincipal, workspaceId: string) {
  const scope = await database
    .prepare("SELECT p.profile_id, p.offer_id, m.id play_id, c.id company_id FROM profile_prospects p JOIN customer_profiles cp ON cp.id=p.profile_id AND cp.workspace_id=p.workspace_id JOIN market_plays m ON m.id=cp.play_id AND m.workspace_id=p.workspace_id JOIN companies c ON c.workspace_id=p.workspace_id WHERE p.workspace_id=? LIMIT 1")
    .bind(workspaceId)
    .first<{ profile_id: string; offer_id: string; play_id: string; company_id: string }>();
  if (!scope) throw new Error("e1_profile_missing");
  // The Review Queue projection joins the candidate to its Target, Account, and
  // Organization, so a reviewable Prospect needs that identity chain. The
  // candidate reuses the C4 run and submission: E1 adds a reviewable Prospect,
  // not a second synthetic prospecting execution.
  const candidate = { accountId: "e1-account", targetId: "e1-target", targetValue: "Synthetic Operations Site" };
  await database.batch([
    database.prepare("INSERT INTO organizations (id,workspace_id,created_at,updated_at,revision,company_id,canonical_name,identity_digest) VALUES ('e1-organization',?,?,?,1,?,'Synthetic Terminal Operator',?)")
      .bind(workspaceId, NOW, NOW, scope.company_id, "9".repeat(64)),
    database.prepare("INSERT INTO accounts (id,workspace_id,created_at,updated_at,revision,play_id,organization_id,state) VALUES ('e1-account',?,?,?,1,?,'e1-organization','draft')")
      .bind(workspaceId, NOW, NOW, scope.play_id),
    database.prepare("INSERT INTO targets (id,workspace_id,created_at,updated_at,revision,profile_id,account_id,state) VALUES ('e1-target',?,?,?,1,?,'e1-account','draft')")
      .bind(workspaceId, NOW, NOW, scope.profile_id),
    database.prepare("INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES ('e1-company-candidate',?,?,?,1,?,?,'c4-prospecting-run','c4-submission','c4-profile-config',?,?,?,'observed')")
      .bind(workspaceId, NOW, NOW, scope.profile_id, scope.offer_id, "2".repeat(64), JSON.stringify(candidate), "3".repeat(64)),
    database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES (?,?,'e1-company-candidate','c4-profile-config',?,'{}',?,'{}','{}','{}','{}',8,'Passed','[]',?,NULL,?)")
      .bind(OPERATOR_JOURNEY_E1_ASSESSMENT_ID, workspaceId, "5".repeat(64), "6".repeat(64), "7".repeat(64), NOW),
    database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) VALUES (?,?,?,?,1,?,?,'e1-company-candidate',?,?,'qualified',1)")
      .bind(OPERATOR_JOURNEY_E1_PROSPECT_ID, workspaceId, NOW, NOW, scope.profile_id, scope.offer_id, OPERATOR_JOURNEY_E1_ASSESSMENT_ID, "8".repeat(64)),
  ]);
}
