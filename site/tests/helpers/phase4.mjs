/** Build the smallest persisted Phase 2/3-shaped authority that Phase 4 may
 * consume.  This deliberately never accepts a client-shaped authority object. */
export async function seedProfileAuthority(fixture, owner, now = 1_780_000_000_000) {
  const commercial = await fixture.vite.ssrLoadModule(new URL("../../domain/commercial-model.ts", import.meta.url).pathname);
  const model = await commercial.initializeCommercialModel(fixture.database, owner, { idempotencyKey: "0198f400-0000-7000-8000-000000000001" });
  const product = model.products.find((entry) => entry.name === "ONE");
  const profile = model.profiles.find((entry) => entry.name === "Operating");
  const workspace = await fixture.database.prepare("SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1").bind(owner.subject).first();
  const company = await fixture.database.prepare("SELECT id FROM companies WHERE workspace_id=?").bind(workspace.id).first();
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO typed_configurations (id, workspace_id, created_at, updated_at, revision, company_id, owner_type, owner_id, kind, digest, manifest_json, active) VALUES ('phase4-product-config', ?, ?, ?, 1, NULL, 'product', ?, 'product_discovery', ?, ?, 1)").bind(workspace.id, now, now, product.id, "a".repeat(64), JSON.stringify({ policySnapshot: { sourcePolicy: { id: "phase4-source-policy", versionId: "phase4-version-3", digest: "a".repeat(64), value: { tier1Origins: ["example.invalid"], tier2Origins: [], materialSignalKinds: ["operating-signal"] } }, runnerPolicy: { id: "phase4-runner-policy", versionId: "phase4-version-3", digest: "a".repeat(64), value: { allowedTools: [] } } }, replacementDirectives: { id: "phase4-replacement-directives", digest: "a".repeat(64) } })),
    fixture.database.prepare("UPDATE customer_profiles SET timezone = 'America/Toronto', weekly_target = 1 WHERE id = ?").bind(profile.id),
  ]);
  const row = await fixture.database.prepare("SELECT revision FROM customer_profiles WHERE id = ?").bind(profile.id).first();
  const profileRow = await fixture.database.prepare("SELECT play_id FROM customer_profiles WHERE id=?").bind(profile.id).first();
  await fixture.database.prepare("UPDATE market_plays SET lifecycle = 'active' WHERE id = ?").bind(profileRow.play_id).run();
  const commandId = "phase4-authority-command";
  await fixture.database.prepare("INSERT INTO authority_commands (id,workspace_id,created_at,updated_at,revision,command_type,idempotency_key,operation_digest,expected_revision,subject_type,subject_id,status) VALUES (?,?,?,?,1,'test.profile.authority',?,?,1,'profile',?,'accepted')").bind(commandId, workspace.id, now, now, "0198f400-0000-7000-8000-000000000099", "1".repeat(64), profile.id).run();
  const categories = ["fit", "disqualifier", "roles", "signals", "timezone", "rubric", "proof_policy", "contact_policy", "outreach_policy", "schedule", "output_target"];
  for (const [index, kind] of categories.entries()) {
    const itemId = `phase4-item-${index}`, versionId = `phase4-version-${index}`;
    await fixture.database.batch([
      fixture.database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES (?,?,?,?,1,?,'profile',?,?, 'default',NULL)").bind(itemId,workspace.id,now,now,company.id,profile.id,kind),
      fixture.database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES (?,?,?,?,1,'profile',?,?, '{}','confirmed',?,?,?,?,?,?,NULL)").bind(versionId,workspace.id,now,now,profile.id,kind,"a".repeat(64),itemId,null,null,commandId,"a".repeat(64)),
      fixture.database.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=?").bind(versionId,itemId),
    ]);
  }
  const offerVersion = "phase4-offer-version", offerItem = "phase4-offer-item", proposalId = "phase4-offer-proposal", decisionId = "phase4-offer-decision", questionId = "phase4-offer-question", answerId = "phase4-offer-answer", sessionId = "phase4-offer-session", auditId = "phase4-offer-audit";
  await fixture.database.prepare("INSERT INTO knowledge_items (id,workspace_id,created_at,updated_at,revision,company_id,scope_type,scope_id,kind,slot,current_version_id) VALUES (?,?,?,?,1,?,'profile',?,'fit','offer',NULL)").bind(offerItem, workspace.id, now, now, company.id, profile.id).run();
  await fixture.database.batch([
    fixture.database.prepare("INSERT INTO interview_sessions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,state,active_question_id) VALUES (?,?,?,?,1,'profile',?,'complete',NULL)").bind(sessionId,workspace.id,now,now,profile.id),
    fixture.database.prepare("INSERT INTO interview_questions (id,workspace_id,created_at,updated_at,revision,session_id,version,prompt,research_json,recommendation,status) VALUES (?,?,?,?,1,?,1,'offer','{}',NULL,'answered')").bind(questionId,workspace.id,now,now,sessionId),
    fixture.database.prepare("INSERT INTO interview_answers (id,workspace_id,session_id,question_id,question_revision,choice,correction_json,idempotency_key,created_at,proposal_json,proposal_digest,operation_digest) VALUES (?,?,?,?,1,'accept',NULL,?,?, '{}',?,?)").bind(answerId,workspace.id,sessionId,questionId,"0198f400-0000-7000-8000-000000000098",now,"b".repeat(64),"c".repeat(64)),
    fixture.database.prepare("INSERT INTO knowledge_proposals (id,workspace_id,created_at,updated_at,revision,company_id,source_id,excerpt_id,destination_scope_type,destination_scope_id,kind,value_json,provenance_json,proposal_digest,origin,status) VALUES (?,?,?,?,1,?,NULL,NULL,'profile',?,'fit','{}','{}',?,'test','accepted')").bind(proposalId,workspace.id,now,now,company.id,profile.id,"d".repeat(64)),
    fixture.database.prepare("INSERT INTO proposal_decisions (id,workspace_id,created_at,updated_at,revision,proposal_id,answer_id,authority_command_id,decision,reviewed_snapshot_digest,operation_digest,idempotency_key) VALUES (?,?,?,?,1,?,?,?,'accept',?,?,?)").bind(decisionId,workspace.id,now,now,proposalId,answerId,commandId,"e".repeat(64),"f".repeat(64),"0198f400-0000-7000-8000-000000000097"),
    fixture.database.prepare("INSERT INTO knowledge_versions (id,workspace_id,created_at,updated_at,revision,scope_type,scope_id,kind,value_json,status,source_digest,knowledge_item_id,proposal_id,decision_id,authority_command_id,value_digest,predecessor_version_id) VALUES (?,?,?,?,1,'profile',?,?, '{}','confirmed',?,?,?,?,?,?,NULL)").bind(offerVersion,workspace.id,now,now,profile.id,"fit","a".repeat(64),offerItem,proposalId,decisionId,commandId,"a".repeat(64)),
    fixture.database.prepare("UPDATE knowledge_items SET current_version_id=? WHERE id=?").bind(offerVersion,offerItem),
    fixture.database.prepare("INSERT INTO audit_events (id,workspace_id,actor_type,actor_id,action,subject_type,subject_id,detail_json,created_at) VALUES (?,?,'owner',?,'test.offer','offer',?,'{}',?)").bind(auditId,workspace.id,owner.subject,profile.id,now),
    fixture.database.prepare("INSERT INTO offers (id,workspace_id,created_at,updated_at,revision,profile_id,name,value_json,question_id,answer_id,proposal_id,decision_id,knowledge_version_id,authority_command_id,audit_event_id) VALUES ('phase4-offer',?,?,?,1,?,'Offer','{}',?,?,?,?,?,?,?)").bind(workspace.id,now,now,profile.id,questionId,answerId,proposalId,decisionId,offerVersion,commandId,auditId),
  ]);
  return { profileId: profile.id, revision: Number(row.revision), workspaceId: workspace.id };
}
