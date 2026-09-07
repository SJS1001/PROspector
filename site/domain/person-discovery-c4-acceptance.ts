import { initializeCommercialModel } from "./commercial-model";
import { principalFromIdentity, type InterviewPrincipal } from "./interview";
import { createPersonDiscoveryService, type PersonDiscoveryService } from "./person-discovery";
import type { PersonDiscoveryPort } from "./person-discovery-port";

export const PERSON_DISCOVERY_C4_BINDING_VALUE = "synthetic-zero-network-c4-v1";
export const PERSON_DISCOVERY_C4_PROSPECT_ID = "c4-approved-prospect";
export const PERSON_DISCOVERY_C4_CONTACT_NAME = "Jordan Synthetic";
const NOW = 1_788_000_000_000;

type Bindings = Readonly<{
  PROSPECTOR_PERSON_DISCOVERY_C4?: unknown;
  TRUSTED_IDENTITY_PROVIDER?: unknown;
  LOCAL_DEMO?: unknown;
}>;

export function personDiscoveryC4Enabled(request: Request, bindings: Bindings) {
  const url = new URL(request.url);
  return import.meta.env.DEV
    && bindings.PROSPECTOR_PERSON_DISCOVERY_C4 === PERSON_DISCOVERY_C4_BINDING_VALUE
    && bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo"
    && bindings.LOCAL_DEMO === "1"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1");
}

export function createPersonDiscoveryC4Service(request: Request, bindings: Bindings, database: D1Database): PersonDiscoveryService | undefined {
  if (!personDiscoveryC4Enabled(request, bindings)) return undefined;
  const port: PersonDiscoveryPort = Object.freeze({
    kind: "synthetic_acceptance" as const,
    [Symbol.for("prospector.person-discovery.c4-acceptance")]: PERSON_DISCOVERY_C4_BINDING_VALUE,
    async discover(assignment, signal) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      return Object.freeze({
        kind: "completed" as const,
        candidates: Object.freeze([
          Object.freeze({
            displayName: PERSON_DISCOVERY_C4_CONTACT_NAME,
            roleTitle: "Operations Director",
            roleSummary: "Synthetic decision-maker for the disposable C4 acceptance prospect.",
            provenance: Object.freeze([Object.freeze({
              sourceReference: `synthetic:c4:${assignment.prospectId}`,
              excerpt: "Synthetic public-role evidence generated locally for C4 acceptance only.",
              retrievedAt: NOW,
            })]),
          }),
          Object.freeze({
            displayName: "Morgan Synthetic",
            roleTitle: "Maintenance Manager",
            roleSummary: "Synthetic supporting role for pagination and review evidence.",
            provenance: Object.freeze([Object.freeze({
              sourceReference: `synthetic:c4:${assignment.prospectId}:supporting`,
              excerpt: "Second synthetic result generated locally without network access.",
              retrievedAt: NOW,
            })]),
          }),
        ]),
      });
    },
  });
  return createPersonDiscoveryService({ database, port, requestTimeoutMs: 1_000 });
}

export async function seedPersonDiscoveryC4(database: D1Database, ownerEmail: string, ownerPepper: string) {
  const owner = await principalFromIdentity(ownerEmail, "Local Demo Owner", ownerPepper);
  const existing = await database.prepare("SELECT id FROM profile_prospects WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_subject IN (?,?)) AND id=?").bind(owner.subject, owner.legacySubject ?? owner.subject, PERSON_DISCOVERY_C4_PROSPECT_ID).first();
  if (existing) return Object.freeze({ status: "ready" as const, prospectId: PERSON_DISCOVERY_C4_PROSPECT_ID });
  await seedAuthority(database, owner);
  return Object.freeze({ status: "ready" as const, prospectId: PERSON_DISCOVERY_C4_PROSPECT_ID });
}

async function seedAuthority(database: D1Database, owner: InterviewPrincipal) {
  const model = await initializeCommercialModel(database, owner, { idempotencyKey: "019cff00-0000-7000-8000-000000000001" });
  const product = model.products.find((entry) => entry.name === "ONE");
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  if (!product || !profile) throw new Error("c4_commercial_model_missing");
  const workspace = await database.prepare("SELECT id FROM workspaces WHERE owner_subject IN (?,?) LIMIT 1").bind(owner.subject, owner.legacySubject ?? owner.subject).first<{ id: string }>();
  const company = workspace && await database.prepare("SELECT id FROM companies WHERE workspace_id=? LIMIT 1").bind(workspace.id).first<{ id: string }>();
  if (!workspace || !company) throw new Error("c4_workspace_missing");
  const commandId = "c4-profile-authority-command";
  await database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'c4.synthetic.profile.authority',?,?,1,'profile',?,'accepted')").bind(commandId, workspace.id, NOW, NOW, "019cff00-0000-7000-8000-000000000002", "1".repeat(64), profile.id).run();
  const productCommandId = "c4-product-authority-command";
  await database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'c4.synthetic.product.authority',?,?,1,'product',?,'accepted')").bind(productCommandId, workspace.id, NOW, NOW, "019cff00-0000-7000-8000-000000000003", "2".repeat(64), product.id).run();
  const productKinds = ["capability", "limitation", "delivery", "proof", "ownership", "claim_guardrail", "source_policy", "discovery_policy", "default_runner_policy"];
  for (const [index, kind] of productKinds.entries()) await addKnowledge(database, { workspaceId: workspace.id, companyId: company.id, scopeType: "product", scopeId: product.id, kind, index: `product-${index}`, commandId: productCommandId, value: {} });
  const productManifest = { policySnapshot: { sourcePolicy: { id: "c4-source-policy", versionId: "c4-product-6-version", digest: "a".repeat(64), value: { tier1Origins: ["example.invalid"], tier2Origins: [], materialSignalKinds: ["operating-signal"] } }, runnerPolicy: { id: "c4-runner-policy", versionId: "c4-product-8-version", digest: "a".repeat(64), value: { allowedTools: [] } } }, replacementDirectives: { id: "c4-replacement", digest: "a".repeat(64) } };
  await database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES ('c4-product-config',?,?,?,1,NULL,'product',?,'product_discovery',?,?,1)").bind(workspace.id, NOW, NOW, product.id, "a".repeat(64), JSON.stringify(productManifest)).run();
  for (const [index, kind] of productKinds.entries()) await database.prepare("INSERT INTO product_discovery_configuration_prerequisites (id,workspace_id,product_id,configuration_id,knowledge_version_id,knowledge_version_digest,category,ordinal,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(`c4-product-prerequisite-${index}`, workspace.id, product.id, "c4-product-config", `c4-product-${index}-version`, "a".repeat(64), kind, index, NOW).run();
  await database.prepare("UPDATE products SET lifecycle='ready',updated_at=?,revision=revision+1 WHERE id=?").bind(NOW, product.id).run();
  await database.prepare("UPDATE market_plays SET lifecycle='active',updated_at=?,revision=revision+1 WHERE id=(SELECT play_id FROM customer_profiles WHERE id=?)").bind(NOW, profile.id).run();
  await database.prepare("UPDATE customer_profiles SET lifecycle='ready',timezone='America/Toronto',weekly_target=1,updated_at=?,revision=revision+1 WHERE id=?").bind(NOW,profile.id).run();
  const profileAuthority = await database.prepare("SELECT revision FROM customer_profiles WHERE id=? AND workspace_id=? AND lifecycle='ready'").bind(profile.id,workspace.id).first<{ revision: number }>();
  if (!profileAuthority) throw new Error("c4_profile_authority_missing");
  const profileKinds = ["fit", "disqualifier", "roles", "signals", "timezone", "rubric", "proof_policy", "contact_policy", "outreach_policy", "schedule", "output_target"];
  const contactPolicy = { mailboxVerifiedEmailFreshnessMs: 604800000, sourceVerifiedEmailFreshnessMs: 950400000, verifiedBusinessPhoneFreshnessMs: 1123200000 };
  for (const [index, kind] of profileKinds.entries()) await addKnowledge(database, { workspaceId: workspace.id, companyId: company.id, scopeType: "profile", scopeId: profile.id, kind, index: `profile-${index}`, commandId, value: kind === "contact_policy" ? contactPolicy : {} });
  await seedOffer(database, owner, workspace.id, company.id, profile.id, commandId);
  const profileManifest = {
    schema: "profile-effective-configuration/v2",
    profile: { id: profile.id, revision: Number(profileAuthority.revision) },
    confirmedCategoryInputs: {
      contact_strategy: [{ id: "c4-profile-7-version", versionId: "c4-profile-7-version", digest: "a".repeat(64), value: contactPolicy }],
    },
    policy: { transport: "reject_only" },
  };
  await database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) VALUES ('c4-profile-config',?,?,?,1,?,'profile',?,'profile_effective',?,?,1)").bind(workspace.id,NOW,NOW,company.id,profile.id,"5".repeat(64),JSON.stringify(profileManifest)).run();
  await seedApprovedProspect(database, owner, workspace.id, profile.id, "c4-prospecting-run", "c4-profile-config", "5".repeat(64));
}

async function addKnowledge(database: D1Database, input: { workspaceId: string; companyId: string; scopeType: "product" | "profile"; scopeId: string; kind: string; index: string; commandId: string; value: object }) {
  const item = `c4-${input.index}-item`, version = `c4-${input.index}-version`;
  await database.batch([
    database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES (?,?,?,?,1,?,?,?,?, 'default',NULL)").bind(item,input.workspaceId,NOW,NOW,input.companyId,input.scopeType,input.scopeId,input.kind),
    database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES (?,?,?,?,1,?,?,?,?, 'confirmed',?,?,NULL,NULL,?,?,NULL)").bind(version,input.workspaceId,NOW,NOW,input.scopeType,input.scopeId,input.kind,JSON.stringify(input.value),"a".repeat(64),item,input.commandId,"a".repeat(64)),
    database.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=?").bind(version,item),
  ]);
}

async function seedOffer(database: D1Database, owner: InterviewPrincipal, workspaceId: string, companyId: string, profileId: string, commandId: string) {
  await database.batch([
    database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES ('c4-offer-item',?,?,?,1,?,'profile',?,'fit','offer',NULL)").bind(workspaceId,NOW,NOW,companyId,profileId),
    database.prepare("INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,state,active_question_id) VALUES ('c4-offer-session',?,?,?,1,'profile',?,'complete',NULL)").bind(workspaceId,NOW,NOW,profileId),
    database.prepare("INSERT INTO interview_questions (id,workspace_id,created_at,updated_at,revision,session_id,version,prompt,research_json,recommendation,status) VALUES ('c4-offer-question',?,?,?,1,'c4-offer-session',1,'Synthetic offer','{}',NULL,'answered')").bind(workspaceId,NOW,NOW),
    database.prepare("INSERT INTO interview_answers (id,workspace_id,session_id,question_id,question_revision,choice,correction_json,idempotency_key,created_at,proposal_json,proposal_digest,operation_digest) VALUES ('c4-offer-answer',?,'c4-offer-session','c4-offer-question',1,'accept',NULL,'c4-offer-answer-key',?,'{}',?,?)").bind(workspaceId,NOW,"6".repeat(64),"7".repeat(64)),
    database.prepare("INSERT INTO knowledge_proposals (id,workspace_id,created_at,updated_at,revision,company_id,source_id,excerpt_id,destination_scope_type,destination_scope_id,kind,value_json,provenance_json,proposal_digest,origin,status) VALUES ('c4-offer-proposal',?,?,?,1,?,NULL,NULL,'profile',?,'fit','{}','{}',?,'c4.synthetic','accepted')").bind(workspaceId,NOW,NOW,companyId,profileId,"8".repeat(64)),
    database.prepare("INSERT INTO proposal_decisions (id,workspace_id,created_at,updated_at,revision,proposal_id,answer_id,authority_command_id,decision,reviewed_snapshot_digest,operation_digest,idempotency_key) VALUES ('c4-offer-decision',?,?,?,1,'c4-offer-proposal','c4-offer-answer',?,'accept',?,?,'c4-offer-decision-key')").bind(workspaceId,NOW,NOW,commandId,"9".repeat(64),"b".repeat(64)),
    database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES ('c4-offer-version',?,?,?,1,'profile',?,'fit','{}','confirmed',?,'c4-offer-item','c4-offer-proposal','c4-offer-decision',?,?,NULL)").bind(workspaceId,NOW,NOW,profileId,"c".repeat(64),commandId,"d".repeat(64)),
    database.prepare("UPDATE knowledge_items SET current_version_id='c4-offer-version' WHERE id='c4-offer-item'"),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('c4-offer-audit',?,'owner',?,'c4.synthetic.offer','offer','c4-offer','{\"synthetic\":true}',?)").bind(workspaceId,owner.subject,NOW),
    database.prepare("INSERT INTO offers (id,workspace_id,created_at,updated_at,revision,profile_id,name,value_json,question_id,answer_id,proposal_id,decision_id,knowledge_version_id,authority_command_id,audit_event_id) VALUES ('c4-offer',?,?,?,1,?,'Synthetic Offer','{}','c4-offer-question','c4-offer-answer','c4-offer-proposal','c4-offer-decision','c4-offer-version',?,'c4-offer-audit')").bind(workspaceId,NOW,NOW,profileId,commandId),
  ]);
}

async function seedApprovedProspect(database: D1Database, owner: InterviewPrincipal, workspaceId: string, profileId: string, runId: string, configurationId: string, configurationDigest: string) {
  await database.batch([
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('c4-run-command',?,?,?,1,'c4.synthetic.prospecting_run','c4-run-key',?,1,'prospecting_run',?,'accepted')").bind(workspaceId,NOW,NOW,"3".repeat(64),runId),
    database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) VALUES (?,?,?,?,1,?,?,NULL,?,'synthetic','c4:explicit-approved-prospect',NULL,?,NULL,NULL,'{\"synthetic\":true}',?,'assigned','c4-run-command',?,'c4-run-key',?,NULL)").bind(runId,workspaceId,NOW,NOW,profileId,configurationId,configurationDigest,NOW,"4".repeat(64),"5".repeat(64),NOW),
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('c4-assignment-command',?,?,?,1,'c4.synthetic.assignment','c4-assignment-key',?,1,'prospecting_run',?,'accepted')").bind(workspaceId,NOW,NOW,"6".repeat(64),runId),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('c4-assignment-audit',?,'system','synthetic','c4.synthetic.assignment','prospecting_run',?,'{\"synthetic\":true}',?)").bind(workspaceId,runId,NOW),
    database.prepare("INSERT INTO runner_assignments (id,workspace_id,created_at,updated_at,revision,run_id,profile_id,configuration_id,configuration_digest,audience,token_hash,nonce_hash,instruction_version,tool_configuration_digest,quota_json,quota_digest,expires_at,status,authority_command_id,audit_event_id) VALUES ('c4-assignment',?,?,?,1,?,?,?,?,'synthetic',?,?,'v1',?,'{}',?,?,'issued','c4-assignment-command','c4-assignment-audit')").bind(workspaceId,NOW,NOW,runId,profileId,configurationId,configurationDigest,"4".repeat(64),"5".repeat(64),"6".repeat(64),"7".repeat(64),NOW+100000),
    database.prepare("INSERT INTO runner_submissions (id,workspace_id,run_id,assignment_id,configuration_id,submission_json,submission_digest,provenance_json,provenance_digest,status,operation_digest,idempotency_key,created_at) VALUES ('c4-submission',?,?,'c4-assignment',?,'{}',?,'{}',?,'accepted',?,'c4-submission-key',?)").bind(workspaceId,runId,configurationId,"8".repeat(64),"9".repeat(64),"b".repeat(64),NOW),
    database.prepare("INSERT INTO prospecting_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,run_id,submission_id,configuration_id,fingerprint,candidate_json,candidate_digest,status) VALUES ('c4-company-candidate',?,?,?,1,?,'c4-offer',?,'c4-submission',?,?,'{}',?,'observed')").bind(workspaceId,NOW,NOW,profileId,runId,configurationId,"c".repeat(64),"d".repeat(64)),
    database.prepare("INSERT INTO qualification_assessments (id,workspace_id,candidate_id,configuration_id,configuration_digest,input_json,input_digest,anchor_json,evidence_json,gate_json,score_json,score,outcome,tie_order,assessment_digest,predecessor_assessment_id,created_at) VALUES ('c4-assessment',?,'c4-company-candidate',?,?,'{}',?,'{}','{}','{}','{}',9,'Passed','[]',?,NULL,?)").bind(workspaceId,configurationId,configurationDigest,"e".repeat(64),"f".repeat(64),NOW),
    database.prepare("INSERT INTO profile_prospects (id,workspace_id,created_at,updated_at,revision,profile_id,offer_id,candidate_id,assessment_id,fingerprint,state,active) VALUES (?,?,?, ?,1,?,'c4-offer','c4-company-candidate','c4-assessment',?,'approved',1)").bind(PERSON_DISCOVERY_C4_PROSPECT_ID,workspaceId,NOW,NOW,profileId,"1".repeat(64)),
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES ('c4-review-command',?,?,?,1,'c4.synthetic.prospect.review','c4-review-key',?,1,'profile_prospect',?,'accepted')").bind(workspaceId,NOW,NOW,"7".repeat(64),PERSON_DISCOVERY_C4_PROSPECT_ID),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES ('c4-review-audit',?,'owner',?,'c4.synthetic.prospect.reviewed','profile_prospect',?,'{\"synthetic\":true}',?)").bind(workspaceId,owner.subject,PERSON_DISCOVERY_C4_PROSPECT_ID,NOW),
    database.prepare("INSERT INTO prospect_review_decisions (id,workspace_id,prospect_id,assessment_id,decision,reason,review_at,expected_prospect_revision,authority_command_id,audit_event_id,decision_digest,operation_digest,idempotency_key,created_at) VALUES ('c4-review',? ,?,'c4-assessment','approve','explicit_synthetic_approval',NULL,1,'c4-review-command','c4-review-audit',?,?,'c4-review-key',?)").bind(workspaceId,PERSON_DISCOVERY_C4_PROSPECT_ID,"3".repeat(64),"4".repeat(64),NOW),
  ]);
}
