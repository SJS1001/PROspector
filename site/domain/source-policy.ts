import { v7 } from "uuid";

export class SourcePolicyError extends Error { readonly code="source_policy_rejected"; }
export type TrustedSourcePolicy=Readonly<{tier1Origins:readonly string[];tier2Origins:readonly string[];materialSignalKinds:readonly string[];publisherAliases?:Readonly<Record<string,string>>;underlyingOriginAliases?:Readonly<Record<string,string>>;independenceGroups?:Readonly<Record<string,string>>}>;
export type TrustedSourceObservation=Readonly<{url:string;retrievedAt:number;observedAt:number;excerpt:string;declaredPublisher?:string;kind:string;transformations?:readonly string[]}>;
export type ValidatedSignal=Readonly<{url:string;publisherIdentity:string;underlyingOriginIdentity:string;independenceGroup:string;tier:1|2|3;excerpt:string;retrievedAt:number;observedAt:number;kind:string;material:boolean;recency:"current"|"account_context_reconfirmation_required";fingerprint:string;transformations:readonly string[]}>;
export type SourcedDisproofSelection=Readonly<{signalFingerprint:string;validationRule:"owner-rejection-material-evidence/v1"}>;

/** This pure helper only accepts application-owned policy. Runner-declared tier and publisher are never authoritative. */
export async function validateSourceObservation(policy:TrustedSourcePolicy,observation:TrustedSourceObservation,now:number):Promise<ValidatedSignal>{
  const parsed=parseHttps(observation.url),host=registrableDomain(parsed.hostname),publisher=identity(policy.publisherAliases,host),underlying=identity(policy.underlyingOriginAliases,host),independence=identity(policy.independenceGroups,underlying);
  const tier=includesOrigin(policy.tier1Origins,underlying)?1:includesOrigin(policy.tier2Origins,underlying)?2:3,kind=bounded(observation.kind,"Signal kind",128),excerpt=escapedExcerpt(observation.excerpt),transformations=normalizeTransformations(observation.transformations??[]);
  if(!Number.isSafeInteger(observation.retrievedAt)||!Number.isSafeInteger(observation.observedAt)||observation.retrievedAt<=0||observation.observedAt<=0||observation.observedAt>observation.retrievedAt||observation.retrievedAt>now+60_000)throw fail();
  const material=policy.materialSignalKinds.map(x=>bounded(x,"Material signal kind",128)).includes(kind),recency=material&&now-observation.observedAt>THIRTY_DAYS?"account_context_reconfirmation_required" as const:"current" as const;
  const fingerprint=await digest(canonical({url:parsed.toString(),publisher,underlying,independence,kind,excerpt,observedAt:observation.observedAt,transformations}));
  return Object.freeze({url:parsed.toString(),publisherIdentity:publisher,underlyingOriginIdentity:underlying,independenceGroup:`origin:${independence}`,tier,excerpt,retrievedAt:observation.retrievedAt,observedAt:observation.observedAt,kind,material,recency,fingerprint,transformations});
}

/** Loads the run-pinned immutable Profile configuration, including historical
 * configurations for already-issued in-flight submissions. Caller policy is
 * intentionally never an authority input. */
export async function appendValidatedSignals(database:D1Database,input:{workspaceId:string;submissionId:string;now:number;policy?:TrustedSourcePolicy}){
  const submission=await database.prepare("SELECT s.id,s.run_id,s.assignment_id,s.configuration_id,s.submission_json,s.provenance_json,r.profile_id,r.configuration_digest,r.window_lower_exclusive,r.window_upper_inclusive FROM runner_submissions s JOIN prospecting_runs r ON r.id=s.run_id AND r.workspace_id=s.workspace_id WHERE s.id=? AND s.workspace_id=? LIMIT 1").bind(input.submissionId,input.workspaceId).first<{id:string;run_id:string;assignment_id:string;configuration_id:string;submission_json:string;provenance_json:string;profile_id:string;configuration_digest:string;window_lower_exclusive:number|null;window_upper_inclusive:number}>();
  if(!submission)throw fail(); const policy=await loadPinnedPolicy(database,input.workspaceId,submission.configuration_id,submission.profile_id,submission.configuration_digest);
  let payload:Record<string,unknown>,provenance:Record<string,unknown>;try{payload=parseObject(JSON.parse(submission.submission_json));provenance=parseObject(JSON.parse(submission.provenance_json));}catch{throw fail();}const findings=array(payload.findings),sources=array(payload.sources); const sourceByUrl=new Map<string,Record<string,unknown>>();
  for(const candidate of sources){const source=parseObject(candidate);const url=canonicalUrl(source.url);if(sourceByUrl.has(url))throw fail();sourceByUrl.set(url,source);}
  const inherited=normalizeTransformations(array(provenance.transformations).map(x=>bounded(x,"Transformation",128)));
  const lower=submission.window_lower_exclusive===null?null:Number(submission.window_lower_exclusive),upper=Number(submission.window_upper_inclusive);if(lower!==null&&!Number.isSafeInteger(lower)||!Number.isSafeInteger(upper)||lower!==null&&lower>=upper)throw fail();
  const validated=await Promise.all(findings.map(async finding=>{const item=parseObject(finding),source=sourceByUrl.get(canonicalUrl(item.sourceUrl)),observedAt=integer(item.observedAt);if(!source||observedAt<=Number(lower??Number.NEGATIVE_INFINITY)||observedAt>upper)throw fail();return validateSourceObservation(policy,{url:canonicalUrl(item.sourceUrl),retrievedAt:integer(source.retrievedAt),observedAt,excerpt:bounded(item.excerpt,"Runner source field",8192),kind:bounded(item.kind,"Runner source field",128),transformations:inherited},input.now);}));
  const sorted=[...validated].sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint)); if(new Set(sorted.map(x=>x.fingerprint)).size!==sorted.length)throw fail();
  /* A submission is one atomic evidence contribution.  Multiple material facts
   * for the same identity would otherwise require an intra-batch predecessor. */
  const materialIdentities=sorted.filter(x=>x.material).map(x=>`${x.kind}\u0000${x.underlyingOriginIdentity}`);if(new Set(materialIdentities).size!==materialIdentities.length)throw fail();
  /* Signal facts are immutable.  The separately appended chain relation below is
   * canonical, so an earlier arrival never needs to rewrite a later fact. */
  for(let attempt=0;attempt<4;attempt++){
    const already=await database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE submission_id=? AND workspace_id=?").bind(submission.id,input.workspaceId).first<{count:number}>();
    if(Number(already?.count??0)===sorted.length){let complete=true;for(const signal of sorted)if(signal.material&&!await appendCanonicalMaterialChain(database,input,submission,signal))complete=false;if(complete)return sorted;continue;}
    if(Number(already?.count??0)!==0)throw fail();
    const statements:D1PreparedStatement[]=[];
    for(const signal of sorted){const lineageId=v7(),signalId=v7();
      const lineageJson=canonical({schema:"prospecting-source-lineage/v3",observationFingerprint:signal.fingerprint,url:signal.url,publisherIdentity:signal.publisherIdentity,underlyingOriginIdentity:signal.underlyingOriginIdentity,independenceGroup:signal.independenceGroup,tier:signal.tier,retrievedAt:signal.retrievedAt,occurredAt:signal.observedAt,transformations:signal.transformations,assignmentId:submission.assignment_id,configurationId:submission.configuration_id,configurationDigest:submission.configuration_digest,submissionId:submission.id,successorPolicy:"canonical_append_only_relation/v1"});const lineageDigest=await digest(lineageJson);
      const signalJson=canonical({schema:"prospecting-signal/v3",kind:signal.kind,excerpt:signal.excerpt,occurredAt:signal.observedAt,material:signal.material,recency:signal.recency,rawSubmissionId:submission.id,sourceLineageId:lineageId,sourceLineageDigest:lineageDigest,successorPolicy:"canonical_append_only_relation/v1"});const signalDigest=await digest(signalJson);
      statements.push(database.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) SELECT ?,?,?,?,NULL,?,?,?,?,?,NULL,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM prospecting_signals WHERE submission_id=? AND workspace_id=?)").bind(lineageId,input.workspaceId,submission.run_id,submission.id,signal.url,signal.publisherIdentity,signal.underlyingOriginIdentity,signal.independenceGroup,signal.tier,signal.observedAt,signal.retrievedAt,signal.excerpt,lineageJson,lineageDigest,input.now,submission.id,input.workspaceId),database.prepare("INSERT INTO prospecting_signals (id,workspace_id,run_id,submission_id,source_lineage_id,profile_id,signal_kind,signal_json,signal_digest,material,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM prospecting_source_lineage WHERE id=? AND workspace_id=?) AND NOT EXISTS (SELECT 1 FROM prospecting_signals WHERE submission_id=? AND workspace_id=?)").bind(signalId,input.workspaceId,submission.run_id,submission.id,lineageId,submission.profile_id,signal.kind,signalJson,signalDigest,signal.material?1:0,input.now,lineageId,input.workspaceId,submission.id,input.workspaceId));
    }
    try{await database.batch(statements);}catch{/* Re-read: another writer may have won this submission. */}
    const winner=await database.prepare("SELECT COUNT(*) count FROM prospecting_signals WHERE submission_id=? AND workspace_id=?").bind(submission.id,input.workspaceId).first<{count:number}>();
    if(Number(winner?.count??0)!==sorted.length)continue;
    let complete=true;for(const signal of sorted)if(signal.material&&!await appendCanonicalMaterialChain(database,input,submission,signal))complete=false;
    if(complete)return sorted;
  } throw fail();
}

type DisproofCandidate=Readonly<{id:string;workspace_id:string;profile_id:string;offer_id:string;run_id:string;submission_id:string;candidate_digest:string;fingerprint:string;candidate_json:string}>;
type ProspectIdentity=Readonly<{workspaceId:string;profileId:string;offerId:string;accountId:string;targetId:string;fingerprint:string}>;
type RejectedProspect=Readonly<{id:string;assessment_id:string;decision_id:string;decision_digest:string;decision_at:number}>;
type DisproofSignal=Readonly<{id:string;run_id:string;submission_id:string;source_lineage_id:string;signal_json:string;signal_digest:string;material:number;lineage_json:string;lineage_digest:string;source_url:string;publisher_identity:string;underlying_origin_identity:string;independence_group:string;source_tier:number;occurred_at:number;retrieved_at:number;fingerprint:string}>;

/**
 * Append an application-owned disproof marker after source-policy validation and
 * candidate materialization. The runner can submit observations, but it cannot
 * select this marker: the selection is emitted only by the trusted candidate
 * materializer and every persisted fact is revalidated here.
 */
export async function appendSourcedDisproofValidationMarker(database:D1Database,input:{
  workspaceId:string; profileId:string; candidateId:string; runId:string; submissionId:string;
  selection:SourcedDisproofSelection; now:number;
}){
  if(!validId(input.workspaceId)||!validId(input.profileId)||!validId(input.candidateId)||!validId(input.runId)||!validId(input.submissionId)||!Number.isSafeInteger(input.now)||input.now<=0||!input.selection||input.selection.validationRule!=="owner-rejection-material-evidence/v1"||!validDigest(input.selection.signalFingerprint))throw fail();
  const candidate=await database.prepare("SELECT id,workspace_id,profile_id,offer_id,run_id,submission_id,candidate_digest,fingerprint,candidate_json FROM prospecting_candidates WHERE id=? AND workspace_id=? AND profile_id=? LIMIT 1").bind(input.candidateId,input.workspaceId,input.profileId).first<DisproofCandidate>();
  if(!candidate||!validDigest(candidate.candidate_digest)||!validDigest(candidate.fingerprint))throw fail();
  const identity=await prospectIdentity(candidate);
  if(!identity)throw fail();
  const prior=await latestRejectedProspect(database,identity);
  if(!prior)throw fail();
  const signal=await database.prepare("SELECT ps.id,ps.run_id,ps.submission_id,ps.source_lineage_id,ps.signal_json,ps.signal_digest,ps.material,pl.lineage_json,pl.lineage_digest,pl.source_url,pl.publisher_identity,pl.underlying_origin_identity,pl.independence_group,pl.source_tier,pl.occurred_at,pl.retrieved_at,json_extract(pl.lineage_json,'$.observationFingerprint') fingerprint FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id AND pl.workspace_id=ps.workspace_id WHERE ps.workspace_id=? AND ps.profile_id=? AND ps.run_id=? AND ps.submission_id=? AND ps.material=1 AND json_extract(pl.lineage_json,'$.observationFingerprint')=? LIMIT 1").bind(input.workspaceId,input.profileId,input.runId,input.submissionId,input.selection.signalFingerprint).first<DisproofSignal>();
  if(!signal||!await validDisproofSourceFact(signal)||Number(signal.occurred_at)<=prior.decision_at||Number(signal.retrieved_at)<=prior.decision_at)throw fail();
  const validation={
    schema:"prospect-reentry-disproof-validation/v1",verdict:"sourced_disproof",validatedBy:"application",
    validationRule:input.selection.validationRule,workspaceId:input.workspaceId,profileId:input.profileId,
    candidateId:candidate.id,candidateDigest:candidate.candidate_digest,prospectFingerprint:identity.fingerprint,priorProspectId:prior.id,
    priorAssessmentId:prior.assessment_id,reviewDecisionId:prior.decision_id,reviewDecisionDigest:prior.decision_digest,
    decisionAt:prior.decision_at,sourceLineageId:signal.source_lineage_id,sourceLineageDigest:signal.lineage_digest,
    signalId:signal.id,signalDigest:signal.signal_digest,observedAt:Number(signal.occurred_at),retrievedAt:Number(signal.retrieved_at),
  };
  const validationDigest=await digest(canonical(validation)),markerJson=canonical({...validation,validationDigest}),markerDigest=await digest(markerJson),markerId=v7();
  try{
    await database.prepare("INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) SELECT ?,?,?,?,NULL,?,?,?,?,?,NULL,?,?,?, ?,?,? WHERE EXISTS (SELECT 1 FROM prospecting_candidates c WHERE c.id=? AND c.workspace_id=? AND c.profile_id=? AND c.candidate_digest=? AND c.fingerprint=?) AND EXISTS (SELECT 1 FROM profile_prospects p JOIN prospecting_candidates prior_candidate ON prior_candidate.id=p.candidate_id AND prior_candidate.workspace_id=p.workspace_id JOIN prospect_review_decisions d ON d.prospect_id=p.id AND d.workspace_id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND p.profile_id=? AND p.offer_id=? AND (p.fingerprint=? OR (json_extract(prior_candidate.candidate_json,'$.accountId')=? AND json_extract(prior_candidate.candidate_json,'$.targetId')=?)) AND p.state='rejected' AND p.active=0 AND p.assessment_id=? AND d.id=? AND d.assessment_id=p.assessment_id AND d.decision='reject' AND d.decision_digest=? AND d.created_at=?) AND EXISTS (SELECT 1 FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id AND pl.workspace_id=ps.workspace_id WHERE ps.id=? AND ps.workspace_id=? AND ps.profile_id=? AND ps.run_id=? AND ps.submission_id=? AND ps.signal_digest=? AND ps.material=1 AND pl.id=? AND pl.lineage_digest=? AND pl.occurred_at=? AND pl.retrieved_at=?) AND NOT EXISTS (SELECT 1 FROM prospecting_source_lineage WHERE run_id=? AND lineage_digest=?)")
      .bind(markerId,input.workspaceId,input.runId,input.submissionId,signal.source_url,signal.publisher_identity,signal.underlying_origin_identity,signal.independence_group,signal.source_tier,signal.occurred_at,signal.retrieved_at,"Application-validated sourced disproof",markerJson,markerDigest,input.now,candidate.id,input.workspaceId,input.profileId,candidate.candidate_digest,candidate.fingerprint,prior.id,input.workspaceId,identity.profileId,identity.offerId,identity.fingerprint,identity.accountId,identity.targetId,prior.assessment_id,prior.decision_id,prior.decision_digest,prior.decision_at,signal.id,input.workspaceId,input.profileId,input.runId,input.submissionId,signal.signal_digest,signal.source_lineage_id,signal.lineage_digest,signal.occurred_at,signal.retrieved_at,input.runId,markerDigest).run();
  }catch{/* A deterministic concurrent producer may have appended the same marker. */}
  const saved=await database.prepare("SELECT id FROM prospecting_source_lineage WHERE run_id=? AND lineage_digest=? LIMIT 1").bind(input.runId,markerDigest).first<{id:string}>();
  if(!saved)throw fail();
  return Object.freeze({markerId:saved.id,markerDigest,signalId:signal.id,validationDigest});
}

/** Revalidate an immutable application marker against its exact candidate,
 * rejected owner decision, signal, lineage, workspace, and timestamps. */
export async function readValidatedSourcedDisproofSignalId(database:D1Database,input:{
  workspaceId:string; profileId:string; candidateId:string; candidateDigest:string; fingerprint:string;
  priorProspectId:string; priorAssessmentId:string; decisionAt:number;
}):Promise<string|null>{
  if(!validId(input.workspaceId)||!validId(input.profileId)||!validId(input.candidateId)||!validDigest(input.candidateDigest)||!validDigest(input.fingerprint)||!validId(input.priorProspectId)||!validId(input.priorAssessmentId)||!Number.isSafeInteger(input.decisionAt)||input.decisionAt<=0)return null;
  const candidate=await database.prepare("SELECT id,workspace_id,profile_id,offer_id,run_id,submission_id,candidate_digest,fingerprint,candidate_json FROM prospecting_candidates WHERE id=? AND workspace_id=? AND profile_id=? LIMIT 1").bind(input.candidateId,input.workspaceId,input.profileId).first<DisproofCandidate>();
  const identity=candidate&&await prospectIdentity(candidate);
  if(!candidate||candidate.candidate_digest!==input.candidateDigest||!identity||identity.fingerprint!==input.fingerprint)return null;
  const rows=(await database.prepare("SELECT id,lineage_json,lineage_digest FROM prospecting_source_lineage WHERE workspace_id=? AND json_extract(lineage_json,'$.schema')='prospect-reentry-disproof-validation/v1' ORDER BY created_at DESC,id DESC").bind(input.workspaceId).all<{id:string;lineage_json:string;lineage_digest:string}>()).results;
  for(const row of rows){
    try{
      if(!validDigest(row.lineage_digest)||await digest(row.lineage_json)!==row.lineage_digest)continue;
      const marker=parseObject(JSON.parse(row.lineage_json)),validationDigest=marker.validationDigest;
      if(!validDigest(validationDigest))continue;const bound={...marker};delete bound.validationDigest;
      if(await digest(canonical(bound))!==validationDigest||canonical({...bound,validationDigest})!==row.lineage_json)continue;
      if(marker.schema!=="prospect-reentry-disproof-validation/v1"||marker.verdict!=="sourced_disproof"||marker.validatedBy!=="application"||marker.validationRule!=="owner-rejection-material-evidence/v1"||marker.workspaceId!==input.workspaceId||marker.profileId!==input.profileId||marker.candidateId!==input.candidateId||marker.candidateDigest!==input.candidateDigest||marker.prospectFingerprint!==input.fingerprint||marker.priorProspectId!==input.priorProspectId||marker.priorAssessmentId!==input.priorAssessmentId||marker.decisionAt!==input.decisionAt)continue;
      const prior=await latestRejectedProspect(database,identity);if(!prior||prior.id!==marker.priorProspectId||prior.assessment_id!==marker.priorAssessmentId||prior.decision_id!==marker.reviewDecisionId||prior.decision_digest!==marker.reviewDecisionDigest||prior.decision_at!==marker.decisionAt)continue;
      const signal=await database.prepare("SELECT ps.id,ps.run_id,ps.submission_id,ps.source_lineage_id,ps.signal_json,ps.signal_digest,ps.material,pl.lineage_json,pl.lineage_digest,pl.source_url,pl.publisher_identity,pl.underlying_origin_identity,pl.independence_group,pl.source_tier,pl.occurred_at,pl.retrieved_at,json_extract(pl.lineage_json,'$.observationFingerprint') fingerprint FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id AND pl.workspace_id=ps.workspace_id WHERE ps.id=? AND ps.workspace_id=? AND ps.profile_id=? AND ps.source_lineage_id=? LIMIT 1").bind(marker.signalId,input.workspaceId,input.profileId,marker.sourceLineageId).first<DisproofSignal>();
      if(!signal||!await validDisproofSourceFact(signal)||signal.signal_digest!==marker.signalDigest||signal.lineage_digest!==marker.sourceLineageDigest||Number(signal.occurred_at)!==marker.observedAt||Number(signal.retrieved_at)!==marker.retrievedAt||Number(signal.occurred_at)<=prior.decision_at||Number(signal.retrieved_at)<=prior.decision_at)continue;
      return signal.id;
    }catch{continue;}
  }
  return null;
}

async function latestRejectedProspect(database:D1Database,identity:ProspectIdentity):Promise<RejectedProspect|null>{
  return database.prepare("SELECT p.id,p.assessment_id,d.id decision_id,d.decision_digest,d.created_at decision_at FROM profile_prospects p JOIN prospecting_candidates prior_candidate ON prior_candidate.id=p.candidate_id AND prior_candidate.workspace_id=p.workspace_id JOIN prospect_review_decisions d ON d.prospect_id=p.id AND d.workspace_id=p.workspace_id AND d.assessment_id=p.assessment_id WHERE p.workspace_id=? AND p.profile_id=? AND p.offer_id=? AND (p.fingerprint=? OR (json_extract(prior_candidate.candidate_json,'$.accountId')=? AND json_extract(prior_candidate.candidate_json,'$.targetId')=?)) AND p.state='rejected' AND p.active=0 AND d.decision='reject' ORDER BY d.created_at DESC,d.id DESC LIMIT 1").bind(identity.workspaceId,identity.profileId,identity.offerId,identity.fingerprint,identity.accountId,identity.targetId).first<RejectedProspect>();
}
async function prospectIdentity(candidate:DisproofCandidate):Promise<ProspectIdentity|null>{
  try{const value=parseObject(JSON.parse(candidate.candidate_json)),accountId=value.accountId,targetId=value.targetId;if(!validId(accountId)||!validId(targetId)||!validId(candidate.offer_id))return null;return{workspaceId:candidate.workspace_id,profileId:candidate.profile_id,offerId:candidate.offer_id,accountId,targetId,fingerprint:await digest(canonical({workspaceId:candidate.workspace_id,profileId:candidate.profile_id,accountId,targetId,offerId:candidate.offer_id}))};}catch{return null;}
}
async function validDisproofSourceFact(signal:DisproofSignal){
  if(!validId(signal.id)||!validId(signal.source_lineage_id)||!validDigest(signal.signal_digest)||!validDigest(signal.lineage_digest)||!validDigest(signal.fingerprint)||Number(signal.material)!==1||!Number.isSafeInteger(Number(signal.occurred_at))||!Number.isSafeInteger(Number(signal.retrieved_at)))return false;
  if(await digest(signal.signal_json)!==signal.signal_digest||await digest(signal.lineage_json)!==signal.lineage_digest)return false;
  const signalFact=parseObject(JSON.parse(signal.signal_json)),lineageFact=parseObject(JSON.parse(signal.lineage_json));
  return signalFact.schema==="prospecting-signal/v3"&&signalFact.sourceLineageId===signal.source_lineage_id&&signalFact.sourceLineageDigest===signal.lineage_digest&&signalFact.material===true&&lineageFact.schema==="prospecting-source-lineage/v3"&&lineageFact.observationFingerprint===signal.fingerprint&&lineageFact.occurredAt===Number(signal.occurred_at)&&lineageFact.retrievedAt===Number(signal.retrieved_at);
}

type Submission=Readonly<{id:string;run_id:string;assignment_id:string;configuration_id:string;profile_id:string;configuration_digest:string}>;
type MaterialMember=Readonly<{id:string;signal_digest:string;lineage_id:string;lineage_digest:string;occurred_at:number;fingerprint:string}>;
type CanonicalChainMember=Readonly<{signalId:string;signalDigest:string;lineageId:string;lineageDigest:string;occurredAt:number;observationFingerprint:string}>;
type SnapshotRow=Readonly<{id:string;lineage_json:string;lineage_digest:string;created_at:number}>;
/** A snapshot is only an index over immutable facts.  Its claimed digest is never
 * authority: scope, every member, adjacency, and both digests are revalidated. */
export async function readCanonicalMaterialLineage(database:D1Database,input:{workspaceId:string;profileId:string;kind:string;underlyingOriginIdentity:string}):Promise<readonly MaterialMember[]>{
  const members=await materialMembers(database,input);if(!await hasCanonicalMaterialSnapshot(database,input,members))throw fail();return members;
}
async function appendCanonicalMaterialChain(database:D1Database,input:{workspaceId:string;submissionId:string;now:number},submission:Submission,signal:ValidatedSignal):Promise<boolean>{
  const members=await materialMembers(database,{workspaceId:input.workspaceId,profileId:submission.profile_id,kind:signal.kind,underlyingOriginIdentity:signal.underlyingOriginIdentity});if(!members.length)throw fail();
  if(await hasCanonicalMaterialSnapshot(database,{workspaceId:input.workspaceId,profileId:submission.profile_id,kind:signal.kind,underlyingOriginIdentity:signal.underlyingOriginIdentity},members))return true;
  const chain=canonicalChain(members),chainDigest=await digest(canonical(chain));
  /* This exact-membership predicate is the write-time revalidation: it rejects a
   * snapshot if either immediate neighbour changed while this writer was racing. */
  const immediateSuccessors=chain.slice(1).map((successor,index)=>({predecessor:chain[index],successor}));
  const relationJson=canonical({schema:"prospecting-source-lineage-chain/v1",selectionRule:"members_exactly_match_current_material_facts/v1",profileId:submission.profile_id,signalKind:signal.kind,underlyingOriginIdentity:signal.underlyingOriginIdentity,chain,immediateSuccessors,chainDigest,reconciledBySubmissionId:submission.id});const relationDigest=await digest(relationJson),relationId=v7();
  const predicates=members.map(()=>"EXISTS (SELECT 1 FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.id=? AND ps.signal_digest=? AND pl.id=? AND pl.lineage_digest=? AND ps.workspace_id=? AND ps.profile_id=? AND ps.signal_kind=? AND ps.material=1 AND pl.underlying_origin_identity=?)").join(" AND ");
  const binds=members.flatMap(member=>[member.id,member.signal_digest,member.lineage_id,member.lineage_digest,input.workspaceId,submission.profile_id,signal.kind,signal.underlyingOriginIdentity]);
  const statement="INSERT INTO prospecting_source_lineage (id,workspace_id,run_id,submission_id,source_id,source_url,publisher_identity,underlying_origin_identity,independence_group,source_tier,published_at,occurred_at,retrieved_at,excerpt,lineage_json,lineage_digest,created_at) SELECT ?,?,?,?,NULL,?,?,?,?,?,NULL,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM prospecting_source_lineage WHERE workspace_id=? AND lineage_json=?) AND "+predicates+" AND NOT EXISTS (SELECT 1 FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.workspace_id=? AND ps.profile_id=? AND ps.signal_kind=? AND ps.material=1 AND pl.underlying_origin_identity=? AND ps.id NOT IN ("+members.map(()=>"?").join(",")+"))";
  await database.prepare(statement).bind(relationId,input.workspaceId,submission.run_id,submission.id,signal.url,signal.publisherIdentity,signal.underlyingOriginIdentity,signal.independenceGroup,signal.tier,signal.observedAt,signal.retrievedAt,"Canonical material successor chain relation",relationJson,relationDigest,input.now,input.workspaceId,relationJson,...binds,input.workspaceId,submission.profile_id,signal.kind,signal.underlyingOriginIdentity,...members.map(member=>member.id)).run();
  return hasCanonicalMaterialSnapshot(database,{workspaceId:input.workspaceId,profileId:submission.profile_id,kind:signal.kind,underlyingOriginIdentity:signal.underlyingOriginIdentity},members);
}
function canonicalChain(members:readonly MaterialMember[]):CanonicalChainMember[]{return members.map(member=>({signalId:member.id,signalDigest:member.signal_digest,lineageId:member.lineage_id,lineageDigest:member.lineage_digest,occurredAt:Number(member.occurred_at),observationFingerprint:member.fingerprint}));}
async function hasCanonicalMaterialSnapshot(database:D1Database,input:{workspaceId:string;profileId:string;kind:string;underlyingOriginIdentity:string},members:readonly MaterialMember[]):Promise<boolean>{
  const chain=canonicalChain(members),chainDigest=await digest(canonical(chain)),rows=(await database.prepare("SELECT id,lineage_json,lineage_digest,created_at FROM prospecting_source_lineage WHERE workspace_id=? ORDER BY created_at DESC,id DESC").bind(input.workspaceId).all<SnapshotRow>()).results;
  for(const row of rows)if(await validCanonicalSnapshot(row,input,chain,chainDigest))return true;
  return false;
}
async function validCanonicalSnapshot(row:SnapshotRow,input:{workspaceId:string;profileId:string;kind:string;underlyingOriginIdentity:string},chain:readonly CanonicalChainMember[],chainDigest:string):Promise<boolean>{
  try{if(!validDigest(row.lineage_digest))return false;const saved=parseObject(JSON.parse(row.lineage_json));
    if(saved.schema!=="prospecting-source-lineage-chain/v1"||saved.selectionRule!=="members_exactly_match_current_material_facts/v1"||saved.profileId!==input.profileId||saved.signalKind!==input.kind||saved.underlyingOriginIdentity!==input.underlyingOriginIdentity||saved.chainDigest!==chainDigest)return false;
    const savedChain=array(saved.chain),successors=array(saved.immediateSuccessors),expectedSuccessors=chain.slice(1).map((successor,index)=>({predecessor:chain[index],successor}));
    if(canonical(savedChain)!==canonical(chain)||canonical(successors)!==canonical(expectedSuccessors)||await digest(canonical(savedChain))!==chainDigest||await digest(canonical(saved))!==row.lineage_digest)return false;
    return true;
  }catch{return false;}
}
async function materialMembers(database:D1Database,input:{workspaceId:string;profileId:string;kind:string;underlyingOriginIdentity:string}):Promise<MaterialMember[]>{const rows=(await database.prepare("SELECT ps.id,ps.signal_digest,pl.id lineage_id,pl.lineage_digest,pl.occurred_at,json_extract(pl.lineage_json,'$.observationFingerprint') fingerprint FROM prospecting_signals ps JOIN prospecting_source_lineage pl ON pl.id=ps.source_lineage_id WHERE ps.workspace_id=? AND ps.profile_id=? AND ps.signal_kind=? AND ps.material=1 AND pl.underlying_origin_identity=? ORDER BY pl.occurred_at ASC,fingerprint ASC,ps.id ASC").bind(input.workspaceId,input.profileId,input.kind,input.underlyingOriginIdentity).all<MaterialMember>()).results;for(const row of rows)if(typeof row.id!=="string"||!validDigest(row.signal_digest)||typeof row.lineage_id!=="string"||!validDigest(row.lineage_digest)||!Number.isSafeInteger(Number(row.occurred_at))||typeof row.fingerprint!=="string"||!validDigest(row.fingerprint))throw fail();return rows;}

/** A successful window always overlaps its previous success watermark by exactly 24h. */
export function sourceWindow(watermark:number|null,upperInclusive:number){if(!Number.isSafeInteger(upperInclusive)||upperInclusive<=0||watermark!==null&&(!Number.isSafeInteger(watermark)||watermark>=upperInclusive))throw fail();return{lowerExclusive:watermark===null?null:watermark-TWENTY_FOUR_HOURS,upperInclusive};}
const TWENTY_FOUR_HOURS=24*60*60*1_000,THIRTY_DAYS=30*TWENTY_FOUR_HOURS;
async function loadPinnedPolicy(database:D1Database,workspaceId:string,configurationId:string,profileId:string,configurationDigest:string):Promise<TrustedSourcePolicy>{const row=await database.prepare("SELECT digest,manifest_json FROM typed_configurations WHERE id=? AND workspace_id=? AND owner_type='profile' AND owner_id=? AND kind='profile_effective' LIMIT 1").bind(configurationId,workspaceId,profileId).first<{digest:string;manifest_json:string}>();if(!row||row.digest!==configurationDigest)throw fail();let manifest:Record<string,unknown>;try{manifest=parseObject(JSON.parse(row.manifest_json));}catch{throw fail();}const candidate=manifest.sourcePolicy??parseObjectOrNull(manifest.policy)?.sourcePolicy??parseObjectOrNull(manifest.authority)?.sourcePolicy;const policy=parseObject(candidate);const rules=parseObjectOrNull(policy.rules)??policy;if(typeof policy.id!=="string"||!validDigest(policy.digest))throw fail();return normalizePolicy(rules);}
function normalizePolicy(value:Record<string,unknown>):TrustedSourcePolicy{return{tier1Origins:array(value.tier1Origins).map(x=>bounded(x,"Policy origin",253)),tier2Origins:array(value.tier2Origins).map(x=>bounded(x,"Policy origin",253)),materialSignalKinds:array(value.materialSignalKinds).map(x=>bounded(x,"Material signal kind",128)),publisherAliases:map(value.publisherAliases),underlyingOriginAliases:map(value.underlyingOriginAliases),independenceGroups:map(value.independenceGroups)};}
function map(v:unknown):Record<string,string>{if(v===undefined)return{};const o=parseObject(v);return Object.fromEntries(Object.entries(o).map(([k,val])=>[registrableDomain(k),bounded(val,"Policy identity",253)]));}
function parseHttps(value:unknown){let p:URL;try{p=new URL(bounded(value,"Source URL",2048));}catch{throw fail();}if(p.protocol!=="https:"||p.username||p.password||p.port||p.hostname==="localhost"||isIp(p.hostname))throw fail();p.hash="";return p;} function canonicalUrl(v:unknown){return parseHttps(v).toString();} function isIp(h:string){return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)||h.includes(":");}
/** Conservative PSL subset. Unknown ccTLD second-level conventions fail closed so
 * a host cannot borrow authority from an unrelated last-two-label domain. */
const MULTI_LABEL_SUFFIXES=new Set(["co.uk","org.uk","ac.uk","gov.uk","net.uk","com.au","net.au","org.au","edu.au","gov.au","co.nz","org.nz","govt.nz","com.br","com.mx","co.jp","ne.jp","or.jp","com.cn","net.cn","org.cn","com.sg","com.tr","co.in","firm.in","net.in","org.in"]);
const GENERIC_SUFFIXES=new Set(["com","net","org","edu","gov","io","ai","app","dev","info","biz","xyz","invalid","test","local"]);
function registrableDomain(host:string){const n=host.toLowerCase().replace(/\.$/,"");const labels=n.split(".");if(labels.length<2||labels.some(x=>!/^[a-z0-9-]{1,63}$/.test(x)))throw fail();const suffix2=labels.slice(-2).join(".");if(MULTI_LABEL_SUFFIXES.has(suffix2)){if(labels.length<3)throw fail();return labels.slice(-3).join(".");}const suffix=labels.at(-1)!;if(suffix.length===2){/* Bare ccTLD registries differ; only known explicit suffixes above are safe. */throw fail();}if(!GENERIC_SUFFIXES.has(suffix))throw fail();return suffix2;} function identity(m:Readonly<Record<string,string>>|undefined,fallback:string){return m?.[fallback]??fallback;} function includesOrigin(origins:readonly string[],origin:string){return origins.some(x=>registrableDomain(x)===origin);} function escapedExcerpt(v:unknown){return bounded(v,"Source excerpt",8192).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]!);} function normalizeTransformations(v:readonly string[]){if(v.length>16)throw fail();const x=v.map(a=>bounded(a,"Transformation",128)).sort();if(new Set(x).size!==x.length)throw fail();return x;} function bounded(v:unknown,_label:string,max:number){if(typeof v!=="string"||!(v=v.normalize("NFC").trim())||v.length>max)throw fail();return v;} function integer(v:unknown){if(!Number.isSafeInteger(v)||(v as number)<=0)throw fail();return v as number;} function array(v:unknown):unknown[]{if(!Array.isArray(v))throw fail();return v;} function parseObject(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))throw fail();return v as Record<string,unknown>;} function parseObjectOrNull(v:unknown){return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;} function validId(v:unknown):v is string{return typeof v==="string"&&v.length>0&&v.length<=160;} function validDigest(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);} function canonical(v:unknown):string{if(Array.isArray(v))return`[${v.map(canonical).join(",")}]`;if(v&&typeof v==="object"){const o=v as Record<string,unknown>;return`{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;}return JSON.stringify(v);} async function digest(v:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");} function fail():SourcePolicyError{return new SourcePolicyError("source_policy_rejected");}
