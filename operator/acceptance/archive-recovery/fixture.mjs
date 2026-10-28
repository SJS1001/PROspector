/** Disposable fictional archive inventory. No provider is invoked or configured. */
export async function seed(sql, owner = "fictional-owner") {
  const snapshot = JSON.stringify({
    company: "Fictional Quarry",
    product: "Fictional Product",
    promise: "Fictional Promise",
    play: "Fictional Market",
    fit: "Fictional Fit",
    offerId: "offer",
    passRule: "Fictional Rule",
    configurationFamily: "family",
  });
  await sql.query(
    "insert into profile_configurations(id,user_id,digest,status,snapshot_json) values ('profile-row',$1,'digest','active',$2)",
    [owner, snapshot],
  );
  await sql.query(
    "insert into product_configurations(id,user_id,digest,status,snapshot_json) values ('product-row',$1,'digest','active',$2)",
    [owner, snapshot],
  );
  await sql.query(
    "insert into suppressions(id,user_id,kind,value,reason) values ('s',$1,'email','person@quarry.example','Fictional opt out')",
    [owner],
  );
  const statements = `
    insert into workspaces(user_id, company_name, company_legal) values ($1,'Fictional Quarry','Fictional Quarry Ltd');
    insert into prospects(id,user_id,account_name,account_id,target_name,target_id,offer_id,score,outcome,state,configuration_digest,assessment_id,assessment_json,evidence_excerpt,evidence_url,evidence_tier,evidence_date) values ('p',$1,'Fictional Quarry','account','Name','target','offer',1,'Passed','qualified','digest','assessment','{"passRule":"rule","hardDisqualifier":null,"dimensions":[]}','quote','https://quarry.example/fictional-evidence',1,'2026-01-01');
    insert into contacts(id,user_id,prospect_id,full_name,role,email_kind,email_display,source,confidence) values ('c',$1,'p','Fictional Person','champion','public_source','person@quarry.example','source','high');
    insert into outreach_packages(id,user_id,prospect_id,status,subject,body,digest,approved_at) values ('pack',$1,'p','approved','Subject','Body','d',now());
    insert into outreach_messages(id,user_id,package_id,prospect_id,contact_id,to_email,subject,body,digest,status,acknowledged,approved_at) values ('m',$1,'pack','p','c','person@quarry.example','Subject','Body','d','approved',true,now());
    insert into knowledge_items (id,user_id,question_id,scope,question,proposed_answer,confirmed_answer,status,evidence,inference,recommendation,sort_order) values ('k',$1,'q','company','Question','Proposed','Confirmed','confirmed','Evidence','Inference','Recommendation',1);
    insert into market_proposals (id,user_id,title,problem_match,customer_type,examples,likely_buyer,risks,product_fit,evidence,decision,decision_reason,decided_at) values ('proposal',$1,'Title','Problem','Customer','Examples','Buyer','Risks','Fit','Evidence','explore','Reason',now());
    insert into prospecting_runs (id,user_id,configuration_digest,trigger,status,candidate_count,qualified_count,terminal_reason,finished_at) values ('run',$1,'digest','manual','succeeded',5,1,'Complete',now());
    update prospects set run_id = 'run', origin = 'run', fingerprint = 'fingerprint', last_reason = 'approved history' where id = 'p';
    insert into review_commands (id,user_id,command_key,operation_digest,prospect_id,decision,reason) values ('review',$1,'key','digest','p','approve','Review reason');
    insert into signals (id,user_id,run_id,prospect_id,url,title,excerpt,tier,content_hash,publication_date,recency) values ('signal',$1,'run','p','https://quarry.example/fictional-evidence','Source','Excerpt',1,'hash','2026-01-01','recent');
    insert into discovery_runs (id,user_id,configuration_digest,trigger,status,proposal_count,terminal_reason,finished_at) values ('discovery',$1,'digest','manual','succeeded',1,'Complete',now());
    insert into draft_plays (id,user_id,proposal_id,title,status,notes,audience,likely_buyer,offer,confirmed_at) values ('draft',$1,'proposal','Draft','confirmed','Notes','Audience','Buyer','Offer',now());
    insert into delivery_events (id,user_id,message_id,kind,note) values ('delivery',$1,'m','reply','History');
    insert into identity_merges (id,user_id,keep_id,drop_id,reason) values ('merge',$1,'c','old-contact','Duplicate');
    insert into operating_state (user_id,monthly_budget_cents,spend_month,spend_used_cents) values ($1,5000,'2026-10',321);
    update outreach_messages set lease_token = 'excluded-active-lease', lease_until = now() + interval '1 hour' where id = 'm';
    insert into operator_secrets(user_id,name,value) values ($1,'api_key','fictional-excluded-secret'),($1,'schedule_enabled','1');
    insert into enrichment_grants(id,user_id,prospect_id,status,reason) values ('source-grant',$1,'p','active','excluded');
    insert into enrichment_grants(id,user_id,prospect_id,status,reason,provider,unit,cost_cents,expires_at,spent_at) values ('spent-grant',$1,'p','apollo','paid reveal','apollo','person',25,now() + interval '1 hour',now());
    insert into outreach_messages(id,user_id,package_id,prospect_id,contact_id,to_email,subject,body,digest,status,acknowledged,approved_at,dispatched_at) values ('consumed',$1,'pack','p','c','person@quarry.example','Fictional consumed subject','Fictional consumed body','consumed-digest','handed_off',true,now(),now());
    insert into delivery_events(id,user_id,message_id,kind,note) values ('manual-history',$1,'consumed','manual_handoff','Fictional manual handoff — delivery unconfirmed');
  `;
  for (const statement of statements
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await sql.query(statement, statement.includes("$1") ? [owner] : []);
  }
}
