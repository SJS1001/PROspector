/* The D1 row shape is intentionally structural: migrations are additive. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { v7 } from "uuid";
import { isSupportedProfileTimezone, nextProfileWeekdaySlot } from "./prospecting-schedule";
import type { InterviewPrincipal } from "./interview";

/** These are the owner-visible readiness decisions.  They are deliberately not
 * inferred from a browser payload or from a runner submission. */
export const PROFILE_READINESS_CATEGORIES = ["fit_target", "disqualifier", "roles", "signals", "geography_language", "rubric", "proof_guardrail", "contact_strategy", "outreach_strategy", "schedule_timezone", "compliance", "output_policy"] as const;
type Category = (typeof PROFILE_READINESS_CATEGORIES)[number];
const PROFILE_KNOWLEDGE: Record<Category, string[]> = {
  fit_target: ["fit"], disqualifier: ["disqualifier"], roles: ["roles"], signals: ["signals"],
  geography_language: ["timezone"], rubric: ["rubric"], proof_guardrail: ["proof_policy"],
  contact_strategy: ["contact_policy"], outreach_strategy: ["outreach_policy"], schedule_timezone: ["schedule", "timezone"],
  compliance: ["proof_policy"], output_policy: ["output_target"],
};
export class ProfileReadinessConflictError extends Error { readonly code = "profile_readiness_conflict"; }
type Workspace = { id: string; companyId: string };
type Profile = {
  id: string;
  name: string;
  play_id: string;
  play_name: string;
  product_id: string;
  product_name: string;
  product_lifecycle: string;
  company_id: string;
  company_name: string;
  lifecycle: string;
  revision: number;
  play_lifecycle: string;
};
type Version = { id: string; digest: string; kind: string; scope_type: string; scope_id: string; status: string; value_json?: string };
type PinnedReference = { id:string; digest:string; versionId?:string; value?:unknown };
type Authority = { productConfiguration: { id: string; digest: string; manifest: unknown }; acceptedPlay: { id: string; revision: number }; offer: { id: string; knowledgeVersionId: string; digest: string; questionId:string; answerId:string; proposalId:string; decisionId:string; authorityCommandId:string; auditEventId:string }; sourcePolicy:PinnedReference; runnerPolicy:PinnedReference; scheduleSemantics:PinnedReference; replacementDirectives:PinnedReference; versions: Version[]; categoryInputs: Record<Category,readonly PinnedReference[]>; timezone: string; replacementPolicy: { mode: "immutable_replacement" } };

export function evaluateProfileReadiness(input: { profile: { id: string; lifecycle: string }; authority?: Partial<Authority>; versions?: Version[] }) {
  const versions = input.versions ?? input.authority?.versions ?? [];
  const items = PROFILE_READINESS_CATEGORIES.map((category) => {
    const wanted = PROFILE_KNOWLEDGE[category];
    const scoped = versions.filter((v) => wanted.includes(v.kind));
    const exact = scoped.filter((v) => v.scope_type === "profile" && v.scope_id === input.profile.id && v.status === "confirmed" && validDigest(v.digest));
    let status: "complete" | "missing" | "stale" | "wrong-scoped" = "complete";
    if (!scoped.length) status = "missing";
    else if (!exact.length) status = scoped.some((v) => v.status !== "confirmed" || !validDigest(v.digest)) ? "stale" : "wrong-scoped";
    return { category, status, versionIds: exact.map((v) => v.id).sort() };
  });
  const prerequisites = [
    ...(!["draft", "ready"].includes(input.profile.lifecycle) ? ["profile_lifecycle"] : []),
    ...(!validConfigurationReference(input.authority?.productConfiguration) ? ["product_configuration"] : []),
    ...(!validPlayReference(input.authority?.acceptedPlay) ? ["accepted_play"] : []),
    ...(!validOfferReference(input.authority?.offer) ? ["confirmed_offer_lineage"] : []),
  ];
  return { items, complete: prerequisites.length === 0 && items.every((item) => item.status === "complete"), missing: [...prerequisites, ...items.filter((x) => x.status !== "complete").map((x) => x.category)] };
}

export async function readProfileReadiness(database: D1Database, principal: InterviewPrincipal, profileId: string) {
  const workspace = await ownedWorkspace(database, principal); const profile = await ownedProfile(database, workspace.id, profileId);
  const resolved = await resolveAuthority(database, workspace.id, profile, false);
  const [candidate, active] = await Promise.all([
    database.prepare("SELECT pc.id,pc.revision,pc.candidate_digest,pc.status,pc.created_at,pc.audit_event_id,pc.predecessor_configuration_id,tc.manifest_json FROM profile_configuration_candidates pc JOIN typed_configurations tc ON tc.id=pc.configuration_id AND tc.workspace_id=pc.workspace_id WHERE pc.workspace_id=? AND pc.profile_id=? ORDER BY pc.created_at DESC,pc.id DESC LIMIT 1").bind(workspace.id,profile.id).first<any>(),
    database.prepare("SELECT c.id candidate_id,c.candidate_digest,a.configuration_id,a.audit_event_id,tc.manifest_json,r.id run_id,r.execution_state run_state,r.successful_watermark,s.id schedule_id,s.timezone,s.intended_local_time,s.utc_offset_minutes,s.cadence,s.next_run_at,s.last_successful_watermark schedule_watermark,s.execution_state schedule_state FROM profile_configuration_activations a JOIN profile_configuration_candidates c ON c.id=a.candidate_id JOIN typed_configurations tc ON tc.id=a.configuration_id AND tc.workspace_id=a.workspace_id JOIN prospecting_runs r ON r.configuration_id=a.configuration_id AND r.trigger_kind='initial' JOIN prospecting_schedules s ON s.configuration_id=a.configuration_id AND s.active=1 WHERE a.workspace_id=? AND a.profile_id=? ORDER BY a.created_at DESC LIMIT 1").bind(workspace.id,profile.id).first<any>(),
  ]);
  const path = {
    company: { id: profile.company_id, name: profile.company_name },
    product: { id: profile.product_id, name: profile.product_name },
    marketPlay: { id: profile.play_id, name: profile.play_name },
    profile: { id: profile.id, name: profile.name },
  };
  return {
    profile: { id: profile.id, revision: profile.revision, lifecycle: profile.lifecycle, path },
    ...evaluateProfileReadiness({ profile, authority: resolved ?? undefined, versions: resolved?.versions }),
    candidate: candidate ? {
      id: candidate.id,
      revision: Number(candidate.revision),
      digest: candidate.candidate_digest,
      status: candidate.status,
      createdAt: Number(candidate.created_at),
      auditEventId: candidate.audit_event_id,
      predecessorConfigurationId: candidate.predecessor_configuration_id,
      frozenAuthority: parseManifest(candidate.manifest_json),
    } : null,
    activation: active ? {
      candidateId: active.candidate_id,
      configuration: {
        id: active.configuration_id,
        digest: active.candidate_digest,
        active: true,
        immutable: true,
        frozenAuthority: parseManifest(active.manifest_json),
      },
      initialRun: {
        id: active.run_id,
        executionState: active.run_state,
        successfulWatermark: active.successful_watermark === null ? null : Number(active.successful_watermark),
      },
      schedule: {
        id: active.schedule_id,
        timezone: active.timezone,
        localTime: active.intended_local_time,
        utcOffsetMinutes: Number(active.utc_offset_minutes),
        cadence: active.cadence,
        nextRunAt: Number(active.next_run_at),
        lastSuccessfulWatermark: active.schedule_watermark === null ? null : Number(active.schedule_watermark),
        executionState: active.schedule_state,
      },
      auditEventId: active.audit_event_id,
      profilePath: path,
    } : null,
  };
}

export async function createProfileConfigurationCandidate(database: D1Database, principal: InterviewPrincipal, input: { profileId: string; expectedProfileRevision: number; idempotencyKey: string; now?: number; [key: string]: unknown }) {
  key(input.idempotencyKey); revision(input.expectedProfileRevision);
  const workspace = await ownedWorkspace(database, principal); const profile = await ownedProfile(database, workspace.id, input.profileId);
  if (profile.revision !== input.expectedProfileRevision) throw new ProfileReadinessConflictError("Stale Profile revision; reload readiness");
  const authority = await resolveAuthority(database, workspace.id, profile, true);
  const readiness = evaluateProfileReadiness({ profile, authority, versions: authority.versions });
  if (!readiness.complete) throw new ProfileReadinessConflictError(`Complete Profile readiness is required: ${readiness.missing.join(", ")}`);
  const manifest = effectiveConfigurationManifest(profile, authority, readiness);
  const manifestJson = stable(manifest); const digest = await sha256(manifestJson);
  const prior = await database.prepare("SELECT id, revision, candidate_digest FROM profile_configuration_candidates WHERE workspace_id = ? AND profile_id = ? AND candidate_digest = ? LIMIT 1").bind(workspace.id, profile.id, digest).first<{id:string;revision:number;candidate_digest:string}>();
  if (prior) return candidateProjection(prior);
  const old = await command(database, workspace.id, input.idempotencyKey); if (old) throw new ProfileReadinessConflictError("Idempotency key was used for another Profile candidate");
  const now = input.now ?? Date.now(), commandId = v7(), configurationId = v7(), candidateId = v7(), auditId = v7();
  const operation = await sha256(stable({ action: "profile.configuration.candidate", profileId: profile.id, expectedRevision: profile.revision, digest }));
  const predecessor = await database.prepare("SELECT id FROM typed_configurations WHERE workspace_id = ? AND owner_type = 'profile' AND owner_id = ? AND kind = 'profile_effective' AND active = 1 LIMIT 1").bind(workspace.id, profile.id).first<{id:string}>();
  try { const results = await database.batch([
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) SELECT ?,?,?,?,1,'profile.configuration.candidate',?,?,?,'profile',?,'accepted' WHERE EXISTS (SELECT 1 FROM customer_profiles p JOIN market_plays mp ON mp.id=p.play_id AND mp.workspace_id=p.workspace_id JOIN products product ON product.id=mp.product_id AND product.workspace_id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND p.revision=? AND p.lifecycle IN ('draft','ready') AND product.lifecycle='ready')").bind(commandId,workspace.id,now,now,input.idempotencyKey,operation,profile.revision,profile.id,profile.id,workspace.id,profile.revision),
    database.prepare("INSERT INTO typed_configurations (id,workspace_id,created_at,updated_at,revision,company_id,owner_type,owner_id,kind,digest,manifest_json,active) SELECT ?,?,?,?,1,?,'profile',?,'profile_effective',?,?,0 WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(configurationId,workspace.id,now,now,workspace.companyId,profile.id,digest,manifestJson,commandId,workspace.id),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) SELECT ?,?,'owner',?,'profile.configuration.candidate_created','profile_configuration_candidate',?,?,? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(auditId,workspace.id,principal.subject,candidateId,stable({digest, authority}),now,commandId,workspace.id),
    database.prepare("INSERT INTO profile_configuration_candidates (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,predecessor_configuration_id,authority_command_id,audit_event_id,candidate_digest,status) SELECT ?,?,?,?,1,?,?,?,?,?,?,'candidate' WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(candidateId,workspace.id,now,now,profile.id,configurationId,predecessor?.id ?? null,commandId,auditId,digest,commandId,workspace.id),
  ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1 || Number(results[3]?.meta?.changes ?? 0) !== 1) throw new ProfileReadinessConflictError("Profile candidate lost its exact lifecycle authority guard");
  } catch (e) { throw e instanceof ProfileReadinessConflictError ? e : race(e, "Profile candidate") }
  return candidateProjection({id:candidateId,revision:1,candidate_digest:digest});
}

export async function activateProfileConfiguration(database: D1Database, principal: InterviewPrincipal, input: { candidateId: string; expectedRevision: number; expectedDigest: string; idempotencyKey: string; now?: number }) {
  key(input.idempotencyKey); revision(input.expectedRevision); if (!validDigest(input.expectedDigest)) throw new ProfileReadinessConflictError("Invalid candidate digest");
  const workspace = await ownedWorkspace(database, principal);
  const candidate = await database.prepare("SELECT c.*,tc.digest configuration_digest,tc.manifest_json configuration_manifest_json,p.name profile_name,p.revision profile_revision,p.lifecycle,p.play_id,mp.name play_name,mp.product_id,mp.lifecycle play_lifecycle,product.name product_name,product.lifecycle product_lifecycle,company.id company_id,company.name company_name FROM profile_configuration_candidates c JOIN typed_configurations tc ON tc.id=c.configuration_id AND tc.workspace_id=c.workspace_id JOIN customer_profiles p ON p.id=c.profile_id AND p.workspace_id=c.workspace_id JOIN market_plays mp ON mp.id=p.play_id AND mp.workspace_id=p.workspace_id JOIN products product ON product.id=mp.product_id AND product.workspace_id=p.workspace_id JOIN companies company ON company.workspace_id=p.workspace_id WHERE c.id=? AND c.workspace_id=? LIMIT 1").bind(input.candidateId,workspace.id).first<any>();
  if (!candidate) throw new ProfileReadinessConflictError("Profile configuration candidate is unavailable");
  const winner = await activationWinner(database, workspace.id, candidate, input);
  if (winner) return activationProjection(candidate,winner.configuration_id,winner.run_id,winner);
  if (candidate.status !== "candidate" || Number(candidate.revision) !== input.expectedRevision || candidate.candidate_digest !== input.expectedDigest) throw new ProfileReadinessConflictError("Stale Profile configuration candidate; reload readiness");
  const profile: Profile = { id:candidate.profile_id,name:candidate.profile_name,play_id:candidate.play_id,play_name:candidate.play_name,product_id:candidate.product_id,product_name:candidate.product_name,product_lifecycle:candidate.product_lifecycle,company_id:candidate.company_id,company_name:candidate.company_name,lifecycle:candidate.lifecycle,revision:Number(candidate.profile_revision),play_lifecycle:candidate.play_lifecycle };
  const authority = await resolveAuthority(database,workspace.id,profile,true); const readiness=evaluateProfileReadiness({profile,authority,versions:authority.versions}); if (!readiness.complete) throw new ProfileReadinessConflictError("Profile readiness changed; replacement candidate required");
  const currentManifest = stable(effectiveConfigurationManifest(profile, authority, readiness));
  const currentDigest = await sha256(currentManifest);
  const active = await database.prepare("SELECT id FROM typed_configurations WHERE workspace_id=? AND owner_type='profile' AND owner_id=? AND kind='profile_effective' AND active=1 LIMIT 1").bind(workspace.id,profile.id).first<{id:string}>();
  if (candidate.predecessor_configuration_id !== (active?.id ?? null) || candidate.candidate_digest !== currentDigest || candidate.configuration_digest !== currentDigest || candidate.configuration_manifest_json !== currentManifest) throw new ProfileReadinessConflictError("Profile authority changed; replacement candidate required");
  const old=await command(database,workspace.id,input.idempotencyKey); if(old) throw new ProfileReadinessConflictError("Idempotency key was used for another Profile activation");
  const now=input.now??Date.now(), commandId=v7(), activationId=v7(), auditId=v7(), scheduleId=v7(), runId=v7(); const operation=await sha256(stable({action:"profile.configuration.activate",candidateId:candidate.id,digest:candidate.candidate_digest,profileRevision:profile.revision}));
  const localTime="06:00", slot=nextProfileWeekdaySlot(profile.id,now,localTime,authority.timezone), scheduleKey=`${slot.scheduleKey}:configuration:${candidate.configuration_id}`, runKey=`initial:profile:${profile.id}:${candidate.configuration_id}`, manifest=stable({schema:"profile-prospecting-run/v1",configuration:candidate.candidate_digest,transport:"blocked_missing_capability",downstreamAuthority:false,window:{lowerExclusive:null,upperInclusive:now}}), manifestDigest=await sha256(manifest), eventJson=stable({trigger:"initial",key:runKey,state:"blocked_missing_capability"}), eventDigest=await sha256(eventJson);
  try { const results = await database.batch([
    database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) SELECT ?,?,?,?,1,'profile.configuration.activate',?,?,?,'profile_configuration_candidate',?,'accepted' WHERE EXISTS (SELECT 1 FROM profile_configuration_candidates c JOIN customer_profiles p ON p.id=c.profile_id AND p.workspace_id=c.workspace_id JOIN market_plays mp ON mp.id=p.play_id AND mp.workspace_id=p.workspace_id JOIN products product ON product.id=mp.product_id AND product.workspace_id=p.workspace_id WHERE c.id=? AND c.workspace_id=? AND c.status='candidate' AND c.revision=? AND c.candidate_digest=? AND p.revision=? AND p.lifecycle IN ('draft','ready') AND product.lifecycle='ready')").bind(commandId,workspace.id,now,now,input.idempotencyKey,operation,input.expectedRevision,candidate.id,candidate.id,workspace.id,input.expectedRevision,input.expectedDigest,profile.revision),
    database.prepare("UPDATE customer_profiles SET lifecycle='ready',updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND lifecycle='draft' AND revision=? AND EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(now,profile.id,workspace.id,profile.revision,commandId,workspace.id),
    database.prepare("UPDATE typed_configurations SET active=0,updated_at=?,revision=revision+1 WHERE workspace_id=? AND owner_type='profile' AND owner_id=? AND kind='profile_effective' AND active=1 AND EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(now,workspace.id,profile.id,commandId,workspace.id),
    database.prepare("UPDATE typed_configurations SET active=1,updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND active=0 AND EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(now,candidate.configuration_id,workspace.id,commandId,workspace.id),
    database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) SELECT ?,?,'owner',?,'profile.configuration.activated','profile_configuration_activation',?,?,? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(auditId,workspace.id,principal.subject,activationId,stable({candidateId:candidate.id,digest:candidate.candidate_digest,authority}),now,commandId,workspace.id),
    database.prepare("INSERT INTO profile_configuration_activations (id,workspace_id,profile_id,candidate_id,previous_configuration_id,configuration_id,authority_command_id,audit_event_id,operation_digest,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(activationId,workspace.id,profile.id,candidate.id,candidate.predecessor_configuration_id,candidate.configuration_id,commandId,auditId,operation,now,commandId,workspace.id),
    database.prepare("UPDATE profile_configuration_candidates SET status='activated',updated_at=?,revision=revision+1 WHERE id=? AND workspace_id=? AND status='candidate' AND EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(now,candidate.id,workspace.id,commandId,workspace.id),
    database.prepare("UPDATE prospecting_schedules SET active=0,updated_at=?,revision=revision+1 WHERE workspace_id=? AND profile_id=? AND active=1 AND EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(now,workspace.id,profile.id,commandId,workspace.id),
    database.prepare("INSERT INTO prospecting_schedules (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,configuration_digest,schedule_key,timezone,intended_local_time,utc_offset_minutes,cadence,next_run_at,last_successful_watermark,active,execution_state,authority_command_id,operation_digest,idempotency_key) SELECT ?,?,?,?,1,?,?,?,?,?, ?,?,'weekdays',?,NULL,1,'blocked_missing_capability',?,?,? WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(scheduleId,workspace.id,now,now,profile.id,candidate.configuration_id,candidate.candidate_digest,scheduleKey,authority.timezone,localTime,slot.utcOffsetMinutes,slot.nextRunAt,commandId,await sha256(`${operation}:schedule`),`${input.idempotencyKey}-schedule`,commandId,workspace.id),
    database.prepare("INSERT INTO prospecting_runs (id,workspace_id,created_at,updated_at,revision,profile_id,configuration_id,schedule_id,configuration_digest,trigger_kind,trigger_key,window_lower_exclusive,window_upper_inclusive,last_successful_watermark,successful_watermark,manifest_json,manifest_digest,execution_state,authority_command_id,operation_digest,idempotency_key,started_at,completed_at) SELECT ?,?,?,?,1,?,?,?,?,'initial',?,NULL,?,NULL,NULL,?,?,'blocked_missing_capability',?,?,?, ?,NULL WHERE EXISTS (SELECT 1 FROM authority_commands WHERE id=? AND workspace_id=?)").bind(runId,workspace.id,now,now,profile.id,candidate.configuration_id,scheduleId,candidate.candidate_digest,runKey,now,manifest,manifestDigest,commandId,await sha256(`${operation}:initial`),`${input.idempotencyKey}-initial`,now,commandId,workspace.id),
    database.prepare("INSERT INTO prospecting_run_events (id,workspace_id,run_id,event_type,event_json,event_digest,operation_digest,created_at) SELECT ?,?,?,'created',?,?,?,? WHERE EXISTS (SELECT 1 FROM prospecting_runs WHERE id=? AND workspace_id=?)").bind(v7(),workspace.id,runId,eventJson,eventDigest,await sha256(`${operation}:initial:created`),now,runId,workspace.id),
  ]);
    /* A guarded INSERT can legitimately return zero changes.  Never expose the
     * UUIDs generated above unless the authority command actually won. */
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw new ProfileReadinessConflictError("Profile activation lost its authority guard");
  } catch(e) {
    const won = await activationWinner(database, workspace.id, candidate, input);
    if (won) return activationProjection(candidate,won.configuration_id,won.run_id,won);
    throw e instanceof ProfileReadinessConflictError ? e : race(e,"Profile activation");
  }
  return activationProjection(candidate,candidate.configuration_id,runId,{schedule_id:scheduleId,timezone:authority.timezone,intended_local_time:localTime,utc_offset_minutes:slot.utcOffsetMinutes,next_run_at:slot.nextRunAt});
}

/** Only an already-persisted activation for this exact candidate command may be
 * returned to a concurrent caller.  In particular, a different candidate or a
 * stale digest is not an idempotent success. */
async function activationWinner(database:D1Database, workspaceId:string, candidate:any, input:{expectedRevision:number;expectedDigest:string}) {
  return database.prepare("SELECT a.configuration_id,r.id run_id,s.id schedule_id,s.timezone,s.intended_local_time,s.utc_offset_minutes,s.next_run_at FROM profile_configuration_activations a JOIN profile_configuration_candidates c ON c.id=a.candidate_id AND c.workspace_id=a.workspace_id JOIN prospecting_runs r ON r.configuration_id=a.configuration_id AND r.trigger_kind='initial' JOIN prospecting_schedules s ON s.configuration_id=a.configuration_id AND s.active=1 WHERE a.workspace_id=? AND a.candidate_id=? AND c.status='activated' AND c.revision=? AND c.candidate_digest=? AND a.configuration_id=? LIMIT 1").bind(workspaceId,candidate.id,input.expectedRevision + 1,input.expectedDigest,candidate.configuration_id).first<any>();
}

async function resolveAuthority(database:D1Database, workspaceId:string, profile:Profile, required:boolean):Promise<Authority|null> {
  const product=await database.prepare("SELECT c.id,c.digest,c.manifest_json,p.lifecycle product_lifecycle FROM typed_configurations c JOIN products p ON p.id=c.owner_id AND p.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.owner_type='product' AND c.owner_id=? AND c.kind='product_discovery' AND c.active=1 LIMIT 1").bind(workspaceId,profile.product_id).first<{id:string;digest:string;manifest_json:string;product_lifecycle:string}>();
  const play=await database.prepare("SELECT id,revision,lifecycle FROM market_plays WHERE id=? AND workspace_id=? AND product_id=? LIMIT 1").bind(profile.play_id,workspaceId,profile.product_id).first<{id:string;revision:number;lifecycle:string}>();
  const offer=await database.prepare("SELECT o.id,o.question_id,o.answer_id,o.proposal_id,o.decision_id,o.authority_command_id,o.audit_event_id,kv.id knowledge_version_id,COALESCE(kv.value_digest,kv.source_digest) digest FROM offers o JOIN knowledge_versions kv ON kv.id=o.knowledge_version_id AND kv.workspace_id=o.workspace_id WHERE o.workspace_id=? AND o.profile_id=? AND kv.status='confirmed' AND kv.scope_type IN ('profile','customer_profile') AND kv.scope_id=? AND o.question_id IS NOT NULL AND o.answer_id IS NOT NULL AND o.proposal_id IS NOT NULL AND o.decision_id IS NOT NULL AND o.authority_command_id IS NOT NULL AND o.audit_event_id IS NOT NULL LIMIT 1").bind(workspaceId,profile.id,profile.id).first<any>();
  const kinds=[...new Set(Object.values(PROFILE_KNOWLEDGE).flat())]; const qs=kinds.map(()=>"?").join(",");
  const rows=await database.prepare(`SELECT kv.id,COALESCE(kv.value_digest,kv.source_digest) digest,kv.kind,kv.scope_type,kv.scope_id,kv.status,kv.value_json FROM knowledge_versions kv JOIN knowledge_items ki ON ki.id=kv.knowledge_item_id AND ki.workspace_id=kv.workspace_id AND ki.current_version_id=kv.id WHERE kv.workspace_id=? AND kv.kind IN (${qs})`).bind(workspaceId,...kinds).all<Version>();
  const timezone=await database.prepare("SELECT timezone FROM customer_profiles WHERE id=? AND workspace_id=? LIMIT 1").bind(profile.id,workspaceId).first<{timezone:string}>();
  let productManifest:Record<string,unknown>|null=null;try{productManifest=product?JSON.parse(product.manifest_json) as Record<string,unknown>:null;}catch{productManifest=null;}
  const snapshot=productManifest&&typeof productManifest.policySnapshot==="object"&&productManifest.policySnapshot&&!Array.isArray(productManifest.policySnapshot)?productManifest.policySnapshot as Record<string,unknown>:null;
  const sourcePolicy=reference(snapshot?.sourcePolicy),runnerPolicy=reference(snapshot?.runnerPolicy),scheduleSemantics=reference(rows.results.find(x=>x.kind==="schedule")),replacementDirectives=reference(productManifest?.replacementDirectives??productManifest?.replacementPolicy??{id:product?.id,digest:product?.digest});
  const versions=rows.results.map((x)=>({...x,digest:String(x.digest)}));const categoryInputs=Object.fromEntries(PROFILE_READINESS_CATEGORIES.map(c=>[c,versions.filter(v=>PROFILE_KNOWLEDGE[c].includes(v.kind)&&v.scope_type==="profile"&&v.scope_id===profile.id&&v.status==="confirmed"&&validDigest(v.digest)).map(v=>({id:v.id,digest:v.digest,versionId:v.id,value:parseValue(v.value_json)}))])) as Record<Category,readonly PinnedReference[]>;
  const authority = product && product.product_lifecycle==="ready" && validDigest(product.digest) && productManifest && sourcePolicy && runnerPolicy && scheduleSemantics && replacementDirectives && offer && validDigest(offer.digest) && play&&["active","ready"].includes(play.lifecycle) && ["draft","ready"].includes(profile.lifecycle) && isSupportedProfileTimezone(timezone?.timezone)
    ? {productConfiguration:{id:product.id,digest:product.digest,manifest:productManifest},acceptedPlay:{id:play.id,revision:Number(play.revision)},offer:{id:offer.id,knowledgeVersionId:offer.knowledge_version_id,digest:offer.digest,questionId:offer.question_id,answerId:offer.answer_id,proposalId:offer.proposal_id,decisionId:offer.decision_id,authorityCommandId:offer.authority_command_id,auditEventId:offer.audit_event_id},sourcePolicy,runnerPolicy,scheduleSemantics,replacementDirectives,versions,categoryInputs,timezone:timezone.timezone,replacementPolicy:{mode:"immutable_replacement" as const}} : null;
  if(required && !authority) { if(!product||!productManifest||product.product_lifecycle!=="ready") throw new ProfileReadinessConflictError("Ready Product Discovery Configuration authority is unavailable"); if(!play||!["active","ready"].includes(play.lifecycle)) throw new ProfileReadinessConflictError("Accepted active Market Play authority is unavailable"); if(!offer) throw new ProfileReadinessConflictError("Confirmed Offer lineage authority is unavailable"); if(!sourcePolicy||!runnerPolicy||!scheduleSemantics||!replacementDirectives) throw new ProfileReadinessConflictError("Pinned source, runner, schedule, and replacement authority is unavailable"); if(!isSupportedProfileTimezone(timezone?.timezone))throw new ProfileReadinessConflictError("Pinned Profile timezone authority is unavailable"); throw new ProfileReadinessConflictError("Profile authority is unavailable"); }
  return authority;
}
async function ownedWorkspace(database:D1Database, principal:InterviewPrincipal):Promise<Workspace>{const legacy=principal.legacySubject??principal.subject;const r=await database.prepare("SELECT w.id,c.id company_id FROM workspaces w JOIN companies c ON c.workspace_id=w.id WHERE w.owner_subject IN (?,?) ORDER BY CASE w.owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1").bind(principal.subject,legacy,principal.subject).first<any>();if(!r)throw new ProfileReadinessConflictError("Commercial workspace authority is unavailable");return{id:r.id,companyId:r.company_id}}
async function ownedProfile(database:D1Database,w:string,id:string):Promise<Profile>{const r=await database.prepare("SELECT cp.id,cp.name,cp.play_id,cp.lifecycle,cp.revision,mp.name play_name,mp.product_id,mp.lifecycle play_lifecycle,p.name product_name,p.lifecycle product_lifecycle,c.id company_id,c.name company_name FROM customer_profiles cp JOIN market_plays mp ON mp.id=cp.play_id AND mp.workspace_id=cp.workspace_id JOIN products p ON p.id=mp.product_id AND p.workspace_id=cp.workspace_id JOIN companies c ON c.workspace_id=cp.workspace_id WHERE cp.id=? AND cp.workspace_id=? LIMIT 1").bind(id,w).first<any>();if(!r)throw new ProfileReadinessConflictError("Profile authority is unavailable");return{...r,revision:Number(r.revision)}}
async function command(d:D1Database,w:string,k:string){return d.prepare("SELECT id FROM authority_commands WHERE workspace_id=? AND idempotency_key=? LIMIT 1").bind(w,k).first()}
function candidateProjection(r:{id:string;revision:number;candidate_digest:string}){return{id:r.id,revision:Number(r.revision),digest:r.candidate_digest,status:"candidate_not_active" as const,immutable:true}}
function activationProjection(c:any,configurationId:string,runId:string,schedule:{schedule_id:string;timezone:string;intended_local_time:string;utc_offset_minutes:number;next_run_at:number}){return{configuration:{id:configurationId,digest:c.candidate_digest,active:true,immutable:true},initialRun:{id:runId,trigger:"initial",executionState:"blocked_missing_capability"},schedule:{id:schedule.schedule_id,timezone:schedule.timezone,localTime:schedule.intended_local_time,utcOffsetMinutes:Number(schedule.utc_offset_minutes),nextRunAt:Number(schedule.next_run_at),cadence:"weekdays",executionState:"blocked_missing_capability"}}}
function effectiveConfigurationManifest(profile:Profile,authority:Authority,readiness:ReturnType<typeof evaluateProfileReadiness>){const sourcePolicy={...authority.sourcePolicy,rules:authority.sourcePolicy.value};const runnerPolicy={...authority.runnerPolicy,rules:authority.runnerPolicy.value};return {schema:"profile-effective-configuration/v2",profile:{id:profile.id,revision:profile.revision,playId:profile.play_id,productId:profile.product_id},authority:{productConfiguration:authority.productConfiguration,acceptedPlay:authority.acceptedPlay,offer:authority.offer,sourcePolicy,runnerPolicy,scheduleSemantics:authority.scheduleSemantics,replacementDirectives:authority.replacementDirectives},confirmedCategoryInputs:authority.categoryInputs,readiness:readiness.items,policy:{sourcePolicy,runnerPolicy,scheduleSemantics:authority.scheduleSemantics,timezone:authority.timezone,cadence:"weekdays",localTime:"06:00",transport:"reject_only",replacement:authority.replacementPolicy}}}
function reference(v:unknown):PinnedReference|null{if(!v||typeof v!=="object"||Array.isArray(v))return null;const x=v as Record<string,unknown>;const id=typeof x.id==="string"?x.id:typeof x.versionId==="string"?x.versionId:null;const digest=typeof x.digest==="string"?x.digest:null;if(!id||!digest||!validDigest(digest))return null;const out:PinnedReference={id,digest};if(typeof x.versionId==="string")out.versionId=x.versionId;if("value" in x)out.value=x.value;return out}function parseValue(v:string|undefined){try{return v?JSON.parse(v):null}catch{return null}}
function parseManifest(v:string|undefined):Record<string,unknown>{try{const parsed=v?JSON.parse(v):null;return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};}catch{return{}}}
function validConfigurationReference(value:Partial<Authority>["productConfiguration"]|undefined){return Boolean(value&&typeof value.id==="string"&&value.id&&validDigest(value.digest))}
function validPlayReference(value:Partial<Authority>["acceptedPlay"]|undefined){return Boolean(value&&typeof value.id==="string"&&value.id&&Number.isInteger(value.revision)&&value.revision>0)}
function validOfferReference(value:Partial<Authority>["offer"]|undefined){return Boolean(value&&typeof value.id==="string"&&value.id&&typeof value.knowledgeVersionId==="string"&&value.knowledgeVersionId&&validDigest(value.digest))}
function key(v:string){if(!/^[a-f0-9-]{20,100}$/i.test(v))throw new ProfileReadinessConflictError("Invalid idempotency key")};function revision(v:number){if(!Number.isInteger(v)||v<1)throw new ProfileReadinessConflictError("Invalid expected revision")};function validDigest(v:unknown):v is string{return typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)};function race(e:unknown,label:string){return new ProfileReadinessConflictError(`${label} failed atomically: ${e instanceof Error?e.message:"conflict"}`)}
function stable(v:unknown):string{if(Array.isArray(v))return`[${v.map(stable).join(",")}]`;if(v&&typeof v==="object"){const r=v as Record<string,unknown>;return`{${Object.keys(r).sort().map(k=>`${JSON.stringify(k)}:${stable(r[k])}`).join(",")}}`}return JSON.stringify(v)};async function sha256(v:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("")}
