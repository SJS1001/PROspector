import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { executeDiscovery } from "@/lib/server/discover";
import { executeHunt } from "@/lib/server/hunt";
import { revealFromPages } from "@/lib/server/reveal";
import { connectionFlags, putSecret } from "@/lib/server/secrets";
import { prepareManualMessage, approveManualMessage, handoffManualMessage, manualCrmCsv, eligibleCrmContacts, packageDigest } from "@/lib/server/manual-workflow";
import { WEEKLY_EXPORT_TARGET, isProductScope } from "@/lib/domain/catalog";
import { digestSnapshot, productReadinessFromKnowledge, readinessFromKnowledge, snapshotFromKnowledge } from "@/lib/server/profile";
import { torontoParts } from "@/lib/server/toronto";
import { ensureWorkspace, idFor, seedMiningSample } from "@/lib/server/seed";
import type {
  Assessment,
  BriefCounts,
  Capability,
  Contact,
  CrmPreview,
  DiscoveryRun,
  DeliveryEvent,
  DraftPlay,
  EvidenceSignal,
  KnowledgeItem,
  KnowledgeStatus,
  MarketProposal,
  OutreachMessage,
  OutreachPackage,
  ProfileState,
  Prospect,
  ProspectingRun,
  ProspectOutcome,
  ProspectState,
  ProposalDecision,
  ReviewDecision,
  Suppression,
  WorkspaceDTO,
} from "@/lib/domain/types";

type KnowledgeRow = {
  id: string;
  question_id: string;
  scope: string;
  question: string;
  proposed_answer: string | null;
  confirmed_answer: string | null;
  status: string;
  evidence: string;
  inference: string;
  recommendation: string;
  sort_order: number;
};

type ProposalRow = {
  id: string;
  title: string;
  problem_match: string;
  customer_type: string;
  examples: string;
  likely_buyer: string;
  risks: string;
  product_fit: string;
  evidence: string;
  decision: string;
  decision_reason: string | null;
};

type ProspectRow = {
  id: string;
  account_name: string;
  account_id: string;
  target_name: string;
  target_id: string;
  offer_id: string;
  score: number;
  outcome: string;
  state: string;
  revision: number;
  configuration_digest: string;
  assessment_id: string;
  assessment_json: string;
  evidence_excerpt: string;
  evidence_url: string;
  evidence_tier: number;
  evidence_date: string;
  cooldown_until: string | null;
  review_at: string | null;
  material_signal: boolean | string | number;
  last_reason: string | null;
  origin?: string | null;
  run_id?: string | null;
  lane?: string | null;
};

type ContactRow = {
  prospect_id: string;
  full_name: string;
  role: string;
  email_kind: string;
  email_display: string;
  source: string;
  confidence: string;
  account_name: string;
  prospect_state: string;
  id: string;
  published_url: string | null;
  phone_display: string | null;
};

type WorkspaceRow = { company_name: string; company_legal: string; interview_complete: boolean | string | number };

type ProfileRow = {
  digest: string;
  status: string;
  snapshot_json: string;
  activated_at: string | null;
};

type RunRow = {
  id: string;
  trigger: string;
  status: string;
  configuration_digest: string;
  candidate_count: number;
  qualified_count: number;
  terminal_reason: string | null;
  started_at: string;
  finished_at: string | null;
};

type SignalRow = {
  id: string;
  run_id: string;
  prospect_id: string | null;
  url: string;
  title: string;
  excerpt: string;
  tier: number;
  retrieved_at: string;
  recency: string;
};

// PostgreSQL drivers return timestamp columns as Date objects; DTOs expose ISO text.
function timestamp(value: string | Date): string;
function timestamp(value: string | Date | null): string | null;
function timestamp(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function asBool(value: boolean | string | number) {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

function digestOf(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function mintSuggestionContacts(sql: Sql, userId: string, prospectId: string, accountName: string) {
  const existing = await sql<{ id: string }>`
    select id from contacts where user_id = ${userId} and prospect_id = ${prospectId} limit 1
  `;
  if (existing.length > 0) return;
  const slug = accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "account";
  const roles = [
    { role: "champion", label: "champion" },
    { role: "economic_buyer", label: "economic buyer" },
  ] as const;
  for (const item of roles) {
    await sql`
      insert into contacts (
        id, user_id, prospect_id, full_name, role, email_kind, email_display, source, confidence
      ) values (
        ${idFor(userId, `contact:${prospectId}:${item.role}`)}, ${userId}, ${prospectId},
        ${`${accountName} ${item.label} (suggestion)`}, ${item.role}, ${"suggestion"},
        ${`${item.role}.${slug}@suggestion.invalid`},
        ${"Generated Contact Suggestion. Not a mailbox. Not verified. Cannot enter send or CRM export."},
        ${"low"}
      )
      on conflict (id) do nothing
    `;
  }
}

function mapKnowledge(row: KnowledgeRow): KnowledgeItem {
  return {
    id: row.id,
    questionId: row.question_id,
    scope: row.scope,
    question: row.question,
    proposedAnswer: row.proposed_answer,
    confirmedAnswer: row.confirmed_answer,
    status: row.status as KnowledgeStatus,
    evidence: row.evidence,
    inference: row.inference,
    recommendation: row.recommendation,
    sortOrder: Number(row.sort_order),
  };
}

function mapProposal(row: ProposalRow): MarketProposal {
  return {
    id: row.id,
    title: row.title,
    problemMatch: row.problem_match,
    customerType: row.customer_type,
    examples: row.examples,
    likelyBuyer: row.likely_buyer,
    risks: row.risks,
    productFit: row.product_fit,
    evidence: row.evidence,
    decision: row.decision as ProposalDecision,
    decisionReason: row.decision_reason,
  };
}

function mapOutcome(value: string): ProspectOutcome {
  if (value === "Passed") return "Passed";
  if (value === "NotQualified") return "NotQualified";
  if (value === "InsufficientEvidence") return "InsufficientEvidence";
  if (value === "Disqualified") return "Disqualified";
  return "Failed";
}

function mapProspect(row: ProspectRow): Prospect {
  let assessment: Assessment = {
    passRule: "",
    hardDisqualifier: null,
    dimensions: [],
  };
  try {
    assessment = JSON.parse(row.assessment_json) as Assessment;
  } catch {
    assessment = { passRule: "", hardDisqualifier: null, dimensions: [] };
  }
  return {
    id: row.id,
    accountName: row.account_name,
    accountId: row.account_id,
    targetName: row.target_name,
    targetId: row.target_id,
    offerId: row.offer_id,
    score: Number(row.score),
    outcome: mapOutcome(row.outcome),
    state: row.state as ProspectState,
    revision: Number(row.revision),
    configurationDigest: row.configuration_digest,
    assessmentId: row.assessment_id,
    assessment,
    evidenceExcerpt: row.evidence_excerpt,
    evidenceUrl: row.evidence_url,
    evidenceTier: Number(row.evidence_tier),
    evidenceDate: row.evidence_date,
    cooldownUntil: timestamp(row.cooldown_until),
    reviewAt: timestamp(row.review_at),
    materialSignal: asBool(row.material_signal),
    lastReason: row.last_reason,
    origin: row.origin === "run" ? "run" : "seed",
    runId: row.run_id ?? null,
    lane: row.lane === "greenfield" ? "greenfield" : "operating",
  };
}

function mapEmailKind(value: string): Contact["emailKind"] {
  if (value === "verified") return "verified";
  if (value === "public_source") return "public_source";
  return "suggestion";
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    accountName: row.account_name,
    fullName: row.full_name,
    role: row.role as Contact["role"],
    emailKind: mapEmailKind(row.email_kind),
    emailDisplay: row.email_display,
    source: row.source,
    confidence: row.confidence,
    prospectState: row.prospect_state as ProspectState,
    publishedUrl: row.published_url,
    phoneDisplay: row.phone_display,
  };
}

function mapRun(row: RunRow): ProspectingRun {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status as ProspectingRun["status"],
    configurationDigest: row.configuration_digest,
    candidateCount: Number(row.candidate_count),
    qualifiedCount: Number(row.qualified_count),
    terminalReason: row.terminal_reason,
    startedAt: timestamp(row.started_at),
    finishedAt: timestamp(row.finished_at),
  };
}

function mapSignal(row: SignalRow): EvidenceSignal {
  return {
    id: row.id,
    runId: row.run_id,
    prospectId: row.prospect_id,
    url: row.url,
    title: row.title,
    excerpt: row.excerpt,
    tier: Number(row.tier),
    retrievedAt: timestamp(row.retrieved_at),
    recency: row.recency,
  };
}

function capabilitiesFrom(
  prospects: Prospect[],
  profile: ProfileState,
  runs: ProspectingRun[],
  flags: { publicContacts: number; handedGmail: boolean; apollo: boolean; gmail: boolean },
): Capability[] {
  const hasApproved = prospects.some((item) => item.state === "approved");
  const huntSucceeded = runs.some((item) => item.status === "succeeded");
  return [
    {
      id: "owner_admission",
      name: "Owner admission",
      status: "proven",
      reason: "This private workspace is bound to the signed-in owner. Other visitors are held at the door.",
    },
    {
      id: "durable_storage",
      name: "Durable operator state",
      status: "proven",
      reason: "Review decisions, knowledge, and proposals persist in this owner workspace.",
    },
    {
      id: "human_review",
      name: "Human prospect review",
      status: "proven",
      reason: "Approve, reject, and defer require a reason and bind to the exact assessment revision.",
    },
    {
      id: "evidence_prospecting",
      name: "Evidence-based prospecting",
      status: huntSucceeded ? "proven" : profile.status === "active" ? "unproven" : "blocked",
      reason: huntSucceeded
        ? "A prospecting run retrieved public pages and application code scored them."
        : profile.status === "active"
          ? "The profile is active. Find Prospects to run the first live retrieval."
          : "Activate a Profile configuration before any prospecting run can start.",
    },
    {
      id: "paid_enrichment",
      name: "Paid enrichment",
      status: "blocked",
      reason: "Paid reveal is disabled in this local release. Public-source lookup requires an explicit action.",
    },
    {
      id: "gmail_dispatch",
      name: "Gmail compose handoff",
      status: flags.handedGmail ? "proven" : "unproven",
      reason: flags.handedGmail
        ? "A message was handed to Gmail. Delivery confirmation still belongs to Gmail."
        : "Approve the exact message, then explicitly open Gmail compose. Delivery remains unconfirmed.",
    },
    {
      id: "crm_export",
      name: "CRM handoff and export",
      status: hasApproved ? "unproven" : "blocked",
      reason: hasApproved
        ? "Download the CRM CSV from Connections or Outreach. Workspace archive is also available."
        : "Approve a prospect before a handoff file can be built.",
    },
  ];
}

function briefFrom(prospects: Prospect[], contacts: Contact[]): BriefCounts {
  const operating = prospects.filter((item) => item.lane !== "greenfield");
  const eligibleIds = new Set(
    contacts.filter((item) => item.emailKind !== "suggestion").map((item) => item.prospectId),
  );
  const week = torontoParts();
  return {
    qualified: operating.filter((item) => item.state === "qualified" && item.outcome === "Passed").length,
    approved: operating.filter((item) => item.state === "approved").length,
    rejected: operating.filter((item) => item.state === "rejected").length,
    deferred: operating.filter((item) => item.state === "deferred").length,
    reviewed: operating.filter((item) => item.state !== "qualified" && item.state !== "assessed" && item.state !== "disqualified").length,
    weekExportReady: operating.filter(
      (item) => item.state === "approved" && eligibleIds.has(item.id),
    ).length,
    weekTarget: WEEKLY_EXPORT_TARGET,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    greenfield: prospects.filter((item) => item.lane === "greenfield").length,
  };
}

function mapProfile(
  knowledge: KnowledgeItem[],
  row: ProfileRow | undefined,
  kind: "product" | "profile",
): ProfileState {
  const readiness =
    kind === "product" ? productReadinessFromKnowledge(knowledge) : readinessFromKnowledge(knowledge);
  const snapshot = snapshotFromKnowledge(knowledge);
  const currentDigest = digestSnapshot(snapshot);
  if (!row) {
    return { status: "draft", digest: null, snapshot, activatedAt: null, readiness };
  }
  let stored = snapshot;
  if (row.snapshot_json) {
    try {
      stored = JSON.parse(row.snapshot_json) as typeof snapshot;
    } catch {
      stored = snapshot;
    }
  }
  const stale = row.digest !== currentDigest || knowledge.some((item) => item.status !== "confirmed");
  return {
    status: stale ? "stale" : row.status === "active" ? "active" : "draft",
    digest: row.digest,
    snapshot: stored,
    activatedAt: timestamp(row.activated_at),
    readiness,
  };
}

async function loadWorkspace(userId: string): Promise<WorkspaceDTO> {
  const sql = await getSql();
  await ensureWorkspace(sql, userId);

  const [workspace] = await sql<WorkspaceRow>`
    select company_name, company_legal, interview_complete from workspaces where user_id = ${userId}
  `;
  const knowledgeRows = await sql<KnowledgeRow>`
    select id, question_id, scope, question, proposed_answer, confirmed_answer, status,
           evidence, inference, recommendation, sort_order
    from knowledge_items where user_id = ${userId} order by sort_order asc
  `;
  const proposalRows = await sql<ProposalRow>`
    select id, title, problem_match, customer_type, examples, likely_buyer, risks,
           product_fit, evidence, decision, decision_reason
    from market_proposals where user_id = ${userId}
  `;
  const prospectRows = await sql<ProspectRow>`
    select id, account_name, account_id, target_name, target_id, offer_id, score, outcome,
           state, revision, configuration_digest, assessment_id, assessment_json, evidence_excerpt,
           evidence_url, evidence_tier, evidence_date, cooldown_until, review_at, material_signal, last_reason,
           origin, run_id, lane
    from prospects where user_id = ${userId}
    order by score desc, account_name asc
  `;
  const contactRows = await sql<ContactRow>`
    select c.id, c.prospect_id, c.full_name, c.role, c.email_kind, c.email_display, c.source,
           c.confidence, c.published_url, c.phone_display, p.account_name, p.state as prospect_state
    from contacts c
    join prospects p on p.id = c.prospect_id
    where c.user_id = ${userId}
    order by p.account_name, c.role
  `;
  const [profileRow] = await sql<ProfileRow>`
    select digest, status, snapshot_json, activated_at from profile_configurations where user_id = ${userId}
  `;
  const runRows = await sql<RunRow>`
    select id, trigger, status, configuration_digest, candidate_count, qualified_count,
           terminal_reason, started_at, finished_at
    from prospecting_runs where user_id = ${userId}
    order by started_at desc
    limit 12
  `;
  const signalRows = await sql<SignalRow>`
    select id, run_id, prospect_id, url, title, excerpt, tier, retrieved_at, recency
    from signals where user_id = ${userId}
    order by retrieved_at desc
    limit 40
  `;

  const [productRow] = await sql<ProfileRow>`
    select digest, status, snapshot_json, activated_at from product_configurations where user_id = ${userId}
  `;
  const discoveryRows = await sql<{
    id: string;
    trigger: string;
    status: string;
    proposal_count: number;
    terminal_reason: string | null;
    started_at: string;
    finished_at: string | null;
  }>`
    select id, trigger, status, proposal_count, terminal_reason, started_at, finished_at
    from discovery_runs where user_id = ${userId}
    order by started_at desc
    limit 8
  `;
  const draftRows = await sql<{
    id: string;
    proposal_id: string;
    title: string;
    status: string;
    notes: string | null;
    audience: string | null;
    likely_buyer: string | null;
    offer: string | null;
  }>`
    select id, proposal_id, title, status, notes, audience, likely_buyer, offer
    from draft_plays where user_id = ${userId}
  `;
  const packageRows = await sql<{
    id: string;
    prospect_id: string;
    status: string;
    subject: string;
    body: string;
    digest: string;
    approved_at: string | null;
    account_name: string;
  }>`
    select o.id, o.prospect_id, o.status, o.subject, o.body, o.digest, o.approved_at, p.account_name
    from outreach_packages o
    join prospects p on p.id = o.prospect_id
    where o.user_id = ${userId}
  `;
  const suppressionRows = await sql<{ id: string; kind: string; value: string; reason: string }>`
    select id, kind, value, reason from suppressions where user_id = ${userId}
  `;
  const messageRows = await sql<{
    id: string;
    package_id: string;
    prospect_id: string;
    contact_id: string;
    to_email: string;
    subject: string;
    body: string;
    digest: string;
    status: string;
    acknowledged: boolean | string | number;
    gmail_url: string | null;
    blocked_reason: string | null;
    approved_at: string | null;
    dispatched_at: string | null;
    account_name: string;
  }>`
    select m.id, m.package_id, m.prospect_id, m.contact_id, m.to_email, m.subject, m.body, m.digest,
           m.status, m.acknowledged, m.gmail_url, m.blocked_reason, m.approved_at, m.dispatched_at,
           p.account_name
    from outreach_messages m
    join prospects p on p.id = m.prospect_id
    where m.user_id = ${userId}
    order by m.created_at desc
  `;
  const eventRows = await sql<{ id: string; message_id: string; kind: string; note: string; created_at: string }>`
    select id, message_id, kind, note, created_at from delivery_events
    where user_id = ${userId}
    order by created_at desc
  `;

  const knowledge = knowledgeRows.map(mapKnowledge);
  const prospects = prospectRows.map(mapProspect);
  const profile = mapProfile(knowledge, profileRow, "profile");
  const product = mapProfile(knowledge, productRow, "product");
  const runs = runRows.map(mapRun);
  const currentQuestion =
    knowledge.find((item) => item.status !== "confirmed") ?? null;
  const contacts = contactRows.map(mapContact);
  const packages: OutreachPackage[] = packageRows.map((row) => ({
    id: row.id,
    prospectId: row.prospect_id,
    accountName: row.account_name,
    status: row.status === "approved" ? "approved" : "draft",
    subject: row.subject,
    body: row.body,
    digest: row.digest,
    approvedAt: timestamp(row.approved_at),
  }));
  const suppressions: Suppression[] = suppressionRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    value: row.value,
    reason: row.reason,
  }));
  const deliveryEvents: DeliveryEvent[] = eventRows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    kind: row.kind,
    note: row.note,
    createdAt: timestamp(row.created_at),
  }));
  const messages: OutreachMessage[] = messageRows.map((row) => ({
    id: row.id,
    packageId: row.package_id,
    prospectId: row.prospect_id,
    accountName: row.account_name,
    contactId: row.contact_id,
    toEmail: row.to_email,
    subject: row.subject,
    body: row.body,
    digest: row.digest,
    status: row.status,
    acknowledged: asBool(row.acknowledged),
    gmailUrl: null,
    blockedReason: row.blocked_reason,
    approvedAt: timestamp(row.approved_at),
    dispatchedAt: timestamp(row.dispatched_at),
  }));
  const publicContacts = contacts.filter((item) => item.emailKind !== "suggestion").length;
  const handed = messages.some((item) => item.status === "handed_off" || item.status === "handed_to_gmail" || item.status === "sent");
  const links = await connectionFlags(sql, userId);
  const eligibleIds = new Set((await eligibleCrmContacts(sql, userId)).map((item) => item.contact_id));
  const eligible = contacts.filter((item) => eligibleIds.has(item.id));
  const crm: CrmPreview = {
    authorized: eligible.length > 0,
    eligibleCount: eligible.length,
    excludedCount: contacts.length - eligible.length,
    rows: prospects
      .filter((item) => item.state === "approved")
      .map((item) => ({
        accountName: item.accountName,
        reason: eligible.some((contact) => contact.prospectId === item.id)
          ? "Eligible contact present — download CRM CSV when ready."
          : "Approved prospect without an eligible mailbox.",
      })),
  };
  const toronto = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => toronto.find((item) => item.type === type)?.value ?? "";
  const weekday = part("weekday");
  const hour = Number(part("hour"));
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const ranToday = runs.some((item) => torontoParts(new Date(item.startedAt)).isoDate === today && item.status === "succeeded");
  const morningDue =
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday) && hour >= 6 && profile.status === "active" && !ranToday;

  return {
    companyName: workspace?.company_name ?? "Company setup",
    companyLegal: workspace?.company_legal ?? "Company setup",
    interviewComplete: knowledge.filter((item) => isProductScope(item.scope)).every((item) => item.status === "confirmed"),
    sampleAvailable: knowledge.every((item) => item.status !== "confirmed"),
    knowledge,
    currentQuestion,
    proposals: proposalRows.map(mapProposal),
    prospects,
    contacts,
    brief: briefFrom(prospects, contacts),
    capabilities: capabilitiesFrom(prospects, profile, runs, {
      publicContacts,
      handedGmail: handed,
      apollo: links.apollo,
      gmail: links.gmail,
    }),
    product,
    profile,
    runs,
    discoveryRuns: discoveryRows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      status: row.status as DiscoveryRun["status"],
      proposalCount: Number(row.proposal_count),
      terminalReason: row.terminal_reason,
      startedAt: timestamp(row.started_at),
      finishedAt: timestamp(row.finished_at),
    })),
    draftPlays: draftRows.map((row) => ({
      id: row.id,
      proposalId: row.proposal_id,
      title: row.title,
      status: row.status,
      notes: row.notes,
      audience: row.audience,
      likelyBuyer: row.likely_buyer,
      offer: row.offer,
    })),
    runner: {
      provider: links.llmProviderLabel,
      model: links.llmModel,
      tools: links.llmSearch === "none" ? ["https_retrieve"] : ["web_search", "https_retrieve"],
      credentialsStored: links.llm,
      assignment: "Bounded public HTTPS pages for the active profile. The runner cannot qualify, approve, or send.",
    },
    signals: signalRows.map(mapSignal),
    packages,
    messages,
    suppressions,
    deliveryEvents,
    crm,
    connections: links,
    morningDue,
    generatedAt: new Date().toISOString(),
  };
}

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadWorkspace(context.userId));

export const proposeAnswer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { questionId: string; answer: string }) => ({
    questionId: input.questionId,
    answer: input.answer.normalize("NFC").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.answer) throw new Error("An answer is required before it can be submitted for confirmation.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const rows = await sql<{ id: string; status: string }>`
      update knowledge_items
      set proposed_answer = ${data.answer}, status = ${"proposed"}
      where user_id = ${context.userId} and question_id = ${data.questionId}
      returning id, status
    `;
    if (rows.length === 0) throw new Error("That question is not in this workspace.");
    return loadWorkspace(context.userId);
  });

export const confirmAnswer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { questionId: string }) => ({ questionId: input.questionId }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [item] = await sql<KnowledgeRow>`
      select id, question_id, scope, question, proposed_answer, confirmed_answer, status,
             evidence, inference, recommendation, sort_order
      from knowledge_items
      where user_id = ${context.userId} and question_id = ${data.questionId}
    `;
    if (!item) throw new Error("That question is not in this workspace.");
    if (item.status !== "proposed" || !item.proposed_answer) {
      throw new Error("Submit an answer for confirmation before confirming it.");
    }
    await sql`
      update knowledge_items
      set confirmed_answer = ${item.proposed_answer}, status = ${"confirmed"}
      where user_id = ${context.userId} and question_id = ${data.questionId}
    `;
    if (item.question_id === "company.legal_name") {
      await sql`
        update workspaces
        set company_name = ${item.proposed_answer}, company_legal = ${item.proposed_answer}
        where user_id = ${context.userId}
      `;
    }
    const remainingProduct = await sql<{ n: number }>`
      select count(*)::int as n from knowledge_items
      where user_id = ${context.userId} and status != ${"confirmed"} and scope in (${"company"}, ${"product"})
    `;
    if (Number(remainingProduct[0]?.n ?? 1) === 0) {
      await sql`
        update workspaces set interview_complete = ${true} where user_id = ${context.userId}
      `;
    }
    return loadWorkspace(context.userId);
  });

export const startCorrectedReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { questionId: string }) => ({ questionId: input.questionId }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const rows = await sql<{ id: string }>`
      update knowledge_items
      set status = ${"proposed"}, proposed_answer = coalesce(proposed_answer, confirmed_answer)
      where user_id = ${context.userId} and question_id = ${data.questionId} and status = ${"confirmed"}
      returning id
    `;
    if (rows.length === 0) throw new Error("Only confirmed knowledge can enter a corrected review.");
    await sql`
      update workspaces set interview_complete = ${false} where user_id = ${context.userId}
    `;
    return loadWorkspace(context.userId);
  });

export const decideProposal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { proposalId: string; decision: ProposalDecision; reason: string }) => ({
    proposalId: input.proposalId,
    decision: input.decision,
    reason: input.reason.normalize("NFC").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (data.decision === "open") throw new Error("Choose Explore, Defer, or Dismiss.");
    if (!data.reason) throw new Error("A reason is required.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const rows = await sql<{ id: string }>`
      update market_proposals
      set decision = ${data.decision}, decision_reason = ${data.reason}, decided_at = ${new Date().toISOString()}
      where user_id = ${context.userId} and id = ${data.proposalId} and decision = ${"open"}
      returning id
    `;
    if (rows.length === 0) throw new Error("That proposal is not open in this workspace.");
    if (data.decision === "explore") {
      const [proposal] = await sql<{ title: string }>`
        select title from market_proposals where id = ${data.proposalId} and user_id = ${context.userId}
      `;
      await sql`
        insert into draft_plays (id, user_id, proposal_id, title, status, notes)
        values (
          ${idFor(context.userId, `draft:${data.proposalId}`)}, ${context.userId}, ${data.proposalId},
          ${proposal?.title ?? "Draft play"}, ${"draft"}, ${data.reason}
        )
        on conflict (user_id, proposal_id) do nothing
      `;
    }
    return loadWorkspace(context.userId);
  });

export const confirmDraftPlay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { playId: string; audience: string; likelyBuyer: string; offer: string }) => ({
    playId: input.playId,
    audience: input.audience.normalize("NFC").trim(),
    likelyBuyer: input.likelyBuyer.normalize("NFC").trim(),
    offer: input.offer.normalize("NFC").trim() || "eight-week-diagnostic",
  }))
  .handler(async ({ context, data }) => {
    if (!data.audience || !data.likelyBuyer) {
      throw new Error("Audience and likely buyer are required to confirm a draft play.");
    }
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const rows = await sql<{ id: string }>`
      update draft_plays
      set status = ${"confirmed"},
          audience = ${data.audience},
          likely_buyer = ${data.likelyBuyer},
          offer = ${data.offer},
          confirmed_at = ${new Date().toISOString()}
      where user_id = ${context.userId} and id = ${data.playId}
      returning id
    `;
    if (rows.length === 0) throw new Error("That draft play is not in this workspace.");
    return loadWorkspace(context.userId);
  });

async function startHunt(userId: string, trigger: "initial" | "manual" | "scheduled") {
  const sql = await getSql();
  await ensureWorkspace(sql, userId);
  const knowledgeRows = await sql<KnowledgeRow>`
    select id, question_id, scope, question, proposed_answer, confirmed_answer, status,
           evidence, inference, recommendation, sort_order
    from knowledge_items where user_id = ${userId} order by sort_order asc
  `;
  const knowledge = knowledgeRows.map(mapKnowledge);
  if (knowledge.some((item) => item.status !== "confirmed")) {
    throw new Error("Confirm the Consensus Interview before activating prospecting.");
  }
  const [product] = await sql<ProfileRow>`
    select digest, status, snapshot_json, activated_at from product_configurations where user_id = ${userId}
  `;
  if (!product || product.status !== "active") {
    throw new Error("Activate the product and explore a market play before prospecting.");
  }
  const [play] = await sql<{ id: string }>`
    select id from draft_plays where user_id = ${userId} and status = ${"confirmed"} limit 1
  `;
  if (!play) {
    throw new Error("Confirm a Draft Market Play before activating prospecting. Explore does not start a hunt.");
  }
  const snapshot = snapshotFromKnowledge(knowledge);
  const digest = digestSnapshot(snapshot);
  const [active] = await sql<ProfileRow>`
    select digest, status, snapshot_json, activated_at from profile_configurations where user_id = ${userId}
  `;
  if (trigger === "manual" || trigger === "scheduled") {
    if (!active || active.status !== "active") {
      throw new Error("Activate a Profile configuration before finding prospects.");
    }
    if (active.digest !== digest) {
      throw new Error("The Product, Market Play, or Offer changed. Load the current authority before continuing.");
    }
  }

  const [busy] = await sql<{ id: string }>`
    select id from prospecting_runs
    where user_id = ${userId} and status in (${"queued"}, ${"running"})
    limit 1
  `;
  if (busy) throw new Error("A prospecting run is already active. Wait for it to finish.");

  if (trigger !== "initial") {
    const [recent] = await sql<{ started_at: string }>`
      select started_at from prospecting_runs where user_id = ${userId} order by started_at desc limit 1
    `;
    if (recent && Date.now() - new Date(recent.started_at).getTime() < 20_000) {
      throw new Error("Wait 20 seconds between hunts so a runner cannot be looped.");
    }
  }

  if (trigger === "initial") {
    const now = new Date().toISOString();
    await sql`
      insert into profile_configurations (id, user_id, digest, status, snapshot_json, created_at, activated_at)
      values (${idFor(userId, "profile")}, ${userId}, ${digest}, ${"active"}, ${JSON.stringify(snapshot)}, ${now}, ${now})
      on conflict (user_id) do update
      set digest = excluded.digest,
          status = ${"active"},
          snapshot_json = excluded.snapshot_json,
          activated_at = excluded.activated_at
    `;
  }

  const runId = idFor(userId, `run:${Date.now()}`);
  await sql`
    insert into prospecting_runs (
      id, user_id, configuration_digest, trigger, status, started_at
    ) values (
      ${runId}, ${userId}, ${digest}, ${trigger}, ${"running"}, ${new Date().toISOString()}
    )
  `;

  const existing = await sql<{ fingerprint: string | null }>`
    select fingerprint from prospects where user_id = ${userId}
  `;
  const known = new Set(
    existing
      .map((row) => row.fingerprint)
      .filter((value): value is string => Boolean(value)),
  );

  const flags = await connectionFlags(sql, userId);
  try {
    await executeHunt({
      sql,
      userId,
      runId,
      digest,
      snapshot,
      knownFingerprints: known,
      maxCandidates: flags.huntBatch,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Prospecting run failed.";
    await sql`
      update prospecting_runs
      set status = ${"failed"},
          terminal_reason = ${reason},
          finished_at = ${new Date().toISOString()}
      where id = ${runId} and user_id = ${userId}
    `;
    throw new Error(reason);
  }
  return loadWorkspace(userId);
}

export const activateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => startHunt(context.userId, "initial"));

export const findProspects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => startHunt(context.userId, "manual"));

export const reviewProspect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      prospectId: string;
      assessmentId: string;
      expectedRevision: number;
      decision: ReviewDecision;
      reason: string;
      reviewAt?: string;
    }) => ({
      prospectId: input.prospectId,
      assessmentId: input.assessmentId,
      expectedRevision: Number(input.expectedRevision),
      decision: input.decision,
      reason: input.reason.normalize("NFC").trim(),
      reviewAt: input.reviewAt,
    }),
  )
  .handler(async ({ context, data }) => {
    if (!data.reason) throw new Error("A reason is required for every review decision.");
    if (data.decision === "defer") {
      const when = data.reviewAt ? Date.parse(data.reviewAt) : NaN;
      if (!Number.isFinite(when)) throw new Error("Defer requires a review date.");
    }
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);

    const [prospect] = await sql<ProspectRow>`
      select id, account_name, account_id, target_name, target_id, offer_id, score, outcome,
             state, revision, configuration_digest, assessment_id, assessment_json, evidence_excerpt,
             evidence_url, evidence_tier, evidence_date, cooldown_until, review_at, material_signal, last_reason
      from prospects
      where user_id = ${context.userId} and id = ${data.prospectId}
    `;
    if (!prospect) throw new Error("That prospect is not in this workspace.");
    if (prospect.assessment_id !== data.assessmentId) {
      throw new Error("The assessment no longer matches this prospect.");
    }
    if (Number(prospect.revision) !== data.expectedRevision) {
      throw new Error("This prospect changed. Reload before deciding.");
    }
    if (prospect.outcome !== "Passed") {
      throw new Error("Only passed qualifications can be reviewed.");
    }
    if (prospect.state !== "qualified") {
      throw new Error("Only qualified prospects are in the review queue.");
    }

    const commandKey = `prospect.review:${data.prospectId}:${data.expectedRevision}`;
    const operation = digestOf({
      action: "prospect.review",
      prospectId: data.prospectId,
      assessmentId: data.assessmentId,
      decision: data.decision,
      reason: data.reason,
      reviewAt: data.decision === "defer" ? data.reviewAt : null,
      revision: data.expectedRevision,
    });

    const [prior] = await sql<{ operation_digest: string; decision: string }>`
      select operation_digest, decision from review_commands
      where user_id = ${context.userId} and command_key = ${commandKey}
    `;
    if (prior) {
      if (prior.operation_digest !== operation) {
        throw new Error("A different review is already bound to this revision.");
      }
      return loadWorkspace(context.userId);
    }

    const nextState =
      data.decision === "approve" ? "approved" : data.decision === "reject" ? "rejected" : "deferred";
    const cooldown =
      data.decision === "reject" ? new Date(Date.now() + 90 * 86400000).toISOString() : null;
    const reviewAt = data.decision === "defer" && data.reviewAt ? new Date(data.reviewAt).toISOString() : null;

    await sql`
      insert into review_commands (
        id, user_id, command_key, operation_digest, prospect_id, decision, reason
      ) values (
        ${idFor(context.userId, `cmd:${commandKey}`)}, ${context.userId}, ${commandKey},
        ${operation}, ${data.prospectId}, ${data.decision}, ${data.reason}
      )
    `;
    await sql`
      update prospects
      set state = ${nextState},
          revision = ${data.expectedRevision + 1},
          cooldown_until = ${cooldown},
          review_at = ${reviewAt},
          last_reason = ${data.reason},
          material_signal = ${false}
      where user_id = ${context.userId} and id = ${data.prospectId} and revision = ${data.expectedRevision}
    `;
    if (data.decision === "approve") {
      await mintSuggestionContacts(sql, context.userId, data.prospectId, prospect.account_name);
    }
    return loadWorkspace(context.userId);
  });

export const recordMaterialSignal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prospectId: string; expectedRevision: number; reason: string }) => ({
    prospectId: input.prospectId,
    expectedRevision: Number(input.expectedRevision),
    reason: input.reason.normalize("NFC").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.reason) throw new Error("Describe the material signal.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [prospect] = await sql<ProspectRow>`
      select id, state, revision, cooldown_until, review_at, material_signal, outcome,
             account_name, account_id, target_name, target_id, offer_id, score, configuration_digest,
             assessment_id, assessment_json, evidence_excerpt, evidence_url, evidence_tier, evidence_date,
             last_reason
      from prospects
      where user_id = ${context.userId} and id = ${data.prospectId}
    `;
    if (!prospect) throw new Error("That prospect is not in this workspace.");
    if (Number(prospect.revision) !== data.expectedRevision) {
      throw new Error("This prospect changed. Reload before recording a signal.");
    }
    if (prospect.state !== "rejected" && prospect.state !== "deferred") {
      throw new Error("Material signals re-enter rejected or deferred prospects only.");
    }
    await sql`
      update prospects
      set material_signal = ${true},
          state = ${"qualified"},
          revision = ${data.expectedRevision + 1},
          cooldown_until = ${null},
          last_reason = ${data.reason}
      where user_id = ${context.userId} and id = ${data.prospectId} and revision = ${data.expectedRevision}
    `;
    return loadWorkspace(context.userId);
  });

export const reenterDueProspect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prospectId: string; expectedRevision: number }) => ({
    prospectId: input.prospectId,
    expectedRevision: Number(input.expectedRevision),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [prospect] = await sql<ProspectRow>`
      select id, state, revision, cooldown_until, review_at, material_signal, outcome,
             account_name, account_id, target_name, target_id, offer_id, score, configuration_digest,
             assessment_id, assessment_json, evidence_excerpt, evidence_url, evidence_tier, evidence_date,
             last_reason
      from prospects
      where user_id = ${context.userId} and id = ${data.prospectId}
    `;
    if (!prospect) throw new Error("That prospect is not in this workspace.");
    if (Number(prospect.revision) !== data.expectedRevision) {
      throw new Error("This prospect changed. Reload before re-entry.");
    }
    const now = Date.now();
    const cooldownExpired =
      prospect.state === "rejected" &&
      prospect.cooldown_until != null &&
      Date.parse(prospect.cooldown_until) <= now;
    const reviewDue =
      prospect.state === "deferred" &&
      prospect.review_at != null &&
      Date.parse(prospect.review_at) <= now;
    if (!cooldownExpired && !reviewDue && !asBool(prospect.material_signal)) {
      throw new Error("Re-entry needs a due review date, an expired 90-day cooldown, or a material signal.");
    }
    await sql`
      update prospects
      set state = ${"qualified"},
          revision = ${data.expectedRevision + 1},
          cooldown_until = ${null}
      where user_id = ${context.userId} and id = ${data.prospectId} and revision = ${data.expectedRevision}
    `;
    return loadWorkspace(context.userId);
  });

export const loadMiningSample = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await seedMiningSample(sql, context.userId);
    return loadWorkspace(context.userId);
  });

export const researchQuestion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { questionId: string }) => ({ questionId: input.questionId }))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("Research is unavailable in this environment.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [item] = await sql<KnowledgeRow>`
      select id, question_id, scope, question, proposed_answer, confirmed_answer, status,
             evidence, inference, recommendation, sort_order
      from knowledge_items
      where user_id = ${context.userId} and question_id = ${data.questionId}
    `;
    if (!item) throw new Error("That question is not in this workspace.");
    const priors = await sql<{ question: string; confirmed_answer: string | null }>`
      select question, confirmed_answer from knowledge_items
      where user_id = ${context.userId} and status = ${"confirmed"}
      order by sort_order
    `;
    const prompt = `Research-first Consensus Interview helper. Return JSON {"evidence":"","inference":"","recommendation":""}.
Question: ${item.question}
Already confirmed: ${priors.map((row) => `${row.question} => ${row.confirmed_answer}`).join(" | ") || "none"}
Keep recommendation short. Do not invent customers or emails.`;
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(40_000),
      body: JSON.stringify({
        model: "grok-4.5",
        messages: [{ role: "user", content: prompt }],
        search_parameters: { mode: "on" },
        max_tokens: 700,
      }),
    });
    if (!res.ok) throw new Error(`Research failed (${res.status}).`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    let evidence = item.evidence;
    let inference = item.inference;
    let recommendation = item.recommendation;
    if (json) {
      try {
        const parsed = JSON.parse(json) as { evidence?: string; inference?: string; recommendation?: string };
        evidence = parsed.evidence?.slice(0, 800) || evidence;
        inference = parsed.inference?.slice(0, 800) || inference;
        recommendation = parsed.recommendation?.slice(0, 400) || recommendation;
      } catch {
        /* keep prior research labels */
      }
    }
    await sql`
      update knowledge_items
      set evidence = ${evidence}, inference = ${inference}, recommendation = ${recommendation}
      where user_id = ${context.userId} and question_id = ${data.questionId}
    `;
    return loadWorkspace(context.userId);
  });

export const activateProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const knowledgeRows = await sql<KnowledgeRow>`
      select id, question_id, scope, question, proposed_answer, confirmed_answer, status,
             evidence, inference, recommendation, sort_order
      from knowledge_items where user_id = ${context.userId} order by sort_order
    `;
    const knowledge = knowledgeRows.map(mapKnowledge);
    if (knowledge.filter((item) => isProductScope(item.scope)).some((item) => item.status !== "confirmed")) {
      throw new Error("Confirm company and product knowledge before activating the product.");
    }
    const snapshot = snapshotFromKnowledge(knowledge);
    const digest = digestSnapshot(snapshot);
    const now = new Date().toISOString();
    await sql`
      insert into product_configurations (id, user_id, digest, status, snapshot_json, created_at, activated_at)
      values (${idFor(context.userId, "product")}, ${context.userId}, ${digest}, ${"active"}, ${JSON.stringify(snapshot)}, ${now}, ${now})
      on conflict (user_id) do update
      set digest = excluded.digest, status = ${"active"}, snapshot_json = excluded.snapshot_json, activated_at = excluded.activated_at
    `;
    const [busy] = await sql<{ id: string }>`
      select id from discovery_runs where user_id = ${context.userId} and status in (${"queued"}, ${"running"}) limit 1
    `;
    if (busy) return loadWorkspace(context.userId);
    const runId = idFor(context.userId, `disc:${Date.now()}`);
    await sql`
      insert into discovery_runs (id, user_id, configuration_digest, trigger, status, started_at)
      values (${runId}, ${context.userId}, ${digest}, ${"initial"}, ${"running"}, ${now})
    `;
    try {
      await executeDiscovery({ sql, userId: context.userId, runId, digest, snapshot });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Discovery failed.";
      await sql`
        update discovery_runs set status = ${"failed"}, terminal_reason = ${reason}, finished_at = ${new Date().toISOString()}
        where id = ${runId}
      `;
      throw new Error(reason);
    }
    return loadWorkspace(context.userId);
  });

export const runDiscovery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [product] = await sql<ProfileRow>`
      select digest, status, snapshot_json, activated_at from product_configurations where user_id = ${context.userId}
    `;
    if (!product || product.status !== "active") {
      throw new Error("Activate the product before running discovery.");
    }
    const [busy] = await sql<{ id: string }>`
      select id from discovery_runs where user_id = ${context.userId} and status in (${"queued"}, ${"running"}) limit 1
    `;
    if (busy) throw new Error("A discovery run is already active.");
    const snapshot = JSON.parse(product.snapshot_json) as ReturnType<typeof snapshotFromKnowledge>;
    const runId = idFor(context.userId, `disc:${Date.now()}`);
    await sql`
      insert into discovery_runs (id, user_id, configuration_digest, trigger, status, started_at)
      values (${runId}, ${context.userId}, ${product.digest}, ${"manual"}, ${"running"}, ${new Date().toISOString()})
    `;
    try {
      await executeDiscovery({ sql, userId: context.userId, runId, digest: product.digest, snapshot });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Discovery failed.";
      await sql`
        update discovery_runs set status = ${"failed"}, terminal_reason = ${reason}, finished_at = ${new Date().toISOString()}
        where id = ${runId}
      `;
      throw new Error(reason);
    }
    return loadWorkspace(context.userId);
  });

export const requestEnrichmentGrant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prospectId: string; reason: string }) => ({
    prospectId: input.prospectId,
    reason: input.reason.normalize("NFC").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.reason) throw new Error("A reason is required.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [prospect] = await sql<{ id: string; state: string; account_name: string; evidence_url: string }>`
      select id, state, account_name, evidence_url from prospects
      where user_id = ${context.userId} and id = ${data.prospectId}
    `;
    if (!prospect || prospect.state !== "approved") {
      throw new Error("Only approved prospects can be considered for enrichment.");
    }
    // Local release: a saved paid key or restored grant never selects a paid route.
    const found = await revealFromPages([prospect.evidence_url]);
    const roles = ["champion", "economic_buyer", "validator"] as const;
    for (const [index, item] of found.entries()) {
      const role = roles[index] ?? "validator";
      await sql`
        insert into contacts (id, user_id, prospect_id, full_name, role, email_kind, email_display, source, confidence, published_url)
        select ${idFor(context.userId, `contact:${data.prospectId}:public:${item.email}`)},
          ${context.userId}, id, ${`${prospect.account_name} ${role} (public source)`}, ${role}, ${"public_source"},
          ${item.email}, ${`Published on ${item.url}. Not mailbox-verified. Not a paid vendor result.`}, ${"medium"}, ${item.url}
        from prospects where user_id = ${context.userId} and id = ${data.prospectId}
          and state = ${"approved"} and evidence_url = ${prospect.evidence_url}
        on conflict (id) do nothing
      `;
    }
    return loadWorkspace(context.userId);
  });

export const prepareMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { packageId: string; contactId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    await prepareManualMessage(sql, context.userId, data.packageId, data.contactId,
      idFor(context.userId, `msg:${data.packageId}:${data.contactId}`));
    return loadWorkspace(context.userId);
  });

export const approveMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; expectedDigest: string; acknowledged: boolean }) => input)
  .handler(async ({ context, data }) => {
    if (data.acknowledged !== true) throw new Error("Acknowledge that compliance guidance is advisory before approving this message.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    await approveManualMessage(sql, context.userId, data.messageId, data.expectedDigest);
    return loadWorkspace(context.userId);
  });

export const openInGmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; expectedDigest: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const url = await handoffManualMessage(sql, context.userId, data.messageId, data.expectedDigest);
    return { workspace: await loadWorkspace(context.userId), url };
  });

export const preparePackage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prospectId: string }) => ({ prospectId: input.prospectId }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [prospect] = await sql<{ account_name: string; target_name: string; state: string }>`
      select account_name, target_name, state from prospects
      where user_id = ${context.userId} and id = ${data.prospectId}
    `;
    if (!prospect || prospect.state !== "approved") {
      throw new Error("Prepare packages only after the prospect is approved.");
    }
    const knowledgeRows = await sql<KnowledgeRow>`
      select id, question_id, scope, question, proposed_answer, confirmed_answer, status,
             evidence, inference, recommendation, sort_order
      from knowledge_items where user_id = ${context.userId} order by sort_order
    `;
    const snapshot = snapshotFromKnowledge(knowledgeRows.map(mapKnowledge));
    const subject = `Diagnostic conversation — ${prospect.account_name}`;
    const body = [
      `Draft package for ${prospect.account_name} (${prospect.target_name}).`,
      `Product: ${snapshot.product}.`,
      `May claim: ${snapshot.promise}.`,
      `Play: ${snapshot.play}.`,
      `This is not a sendable message. Approving the package does not approve Gmail and does not dispatch.`,
      `Contact Suggestions in this account are not eligible for send or CRM export.`,
    ].join(" ");
    const digest = digestOf({ subject, body, prospectId: data.prospectId });
    await sql`
      insert into outreach_packages (id, user_id, prospect_id, status, subject, body, digest)
      values (${idFor(context.userId, `pkg:${data.prospectId}`)}, ${context.userId}, ${data.prospectId}, ${"draft"}, ${subject}, ${body}, ${digest})
      on conflict (user_id, prospect_id) do update
      set subject = excluded.subject, body = excluded.body, digest = excluded.digest, status = ${"draft"}, approved_at = null
    `;
    return loadWorkspace(context.userId);
  });

export const approvePackage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { packageId: string; expectedDigest: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [pack] = await sql<{ subject: string; body: string; prospect_id: string; digest: string }>`
      select subject, body, prospect_id, digest from outreach_packages
      where user_id = ${context.userId} and id = ${data.packageId}
    `;
    if (!pack || pack.digest !== data.expectedDigest || pack.digest !== packageDigest(pack.subject, pack.body, pack.prospect_id)) {
      throw new Error("The package changed. Review the current exact package before approval.");
    }
    const rows = await sql`
      update outreach_packages p set status = ${"approved"}, approved_at = coalesce(p.approved_at, now())
      where p.user_id = ${context.userId} and p.id = ${data.packageId} and p.digest = ${data.expectedDigest}
        and p.subject = ${pack.subject} and p.body = ${pack.body} and p.prospect_id = ${pack.prospect_id}
        and exists (select 1 from prospects r where r.user_id = p.user_id and r.id = p.prospect_id
          and r.state = ${"approved"} and r.outcome = ${"Passed"})
      returning p.id
    `;
    if (!rows.length) throw new Error("The prospect or package is no longer eligible.");
    return loadWorkspace(context.userId);
  });

export const addSuppression = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: string; value: string; reason: string }) => ({
    kind: ["email", "domain", "phone", "contact", "org", "all"].includes(input.kind) ? input.kind : "email",
    value: input.value.normalize("NFC").trim().toLowerCase(),
    reason: input.reason.normalize("NFC").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.value || !data.reason) throw new Error("Value and reason are required.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    await sql`
      insert into suppressions (id, user_id, kind, value, reason)
      values (${idFor(context.userId, `sup:${data.kind}:${data.value}`)}, ${context.userId}, ${data.kind}, ${data.value}, ${data.reason})
      on conflict (user_id, kind, value) do nothing
    `;
    return loadWorkspace(context.userId);
  });

export const saveConnections = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    xai?: string;
    apollo?: string;
    gmailUser?: string;
    gmailPass?: string;
    zoominfo?: string;
    monthlyBudgetCents?: number;
    llmProvider?: string;
    llmModel?: string;
    llmBaseUrl?: string;
    llmKey?: string;
    scheduleEnabled?: boolean;
    huntBatch?: number;
    jev?: string;
    jevBaseUrl?: string;
  }) => ({
    xai: input.xai ?? "",
    apollo: input.apollo ?? "",
    gmailUser: input.gmailUser ?? "",
    gmailPass: input.gmailPass ?? "",
    zoominfo: input.zoominfo ?? "",
    monthlyBudgetCents: input.monthlyBudgetCents,
    llmProvider: input.llmProvider ?? "",
    llmModel: input.llmModel ?? "",
    llmBaseUrl: input.llmBaseUrl ?? "",
    llmKey: input.llmKey ?? "",
    scheduleEnabled: input.scheduleEnabled,
    huntBatch: input.huntBatch,
    jev: input.jev ?? "",
    jevBaseUrl: input.jevBaseUrl ?? "",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    if (data.xai) await putSecret(sql, context.userId, "xai", data.xai);
    if (data.llmKey) {
      await putSecret(sql, context.userId, "llm_key", data.llmKey);
      await putSecret(sql, context.userId, "xai", data.llmKey);
    }
    if (data.llmProvider) await putSecret(sql, context.userId, "llm_provider", data.llmProvider);
    if (data.llmModel) await putSecret(sql, context.userId, "llm_model", data.llmModel);
    if (data.llmBaseUrl) await putSecret(sql, context.userId, "llm_base_url", data.llmBaseUrl);
    // A saved or restored setting cannot enable scheduled processing.
    if (data.scheduleEnabled !== undefined) await putSecret(sql, context.userId, "schedule_enabled", "0");
    if (data.apollo) await putSecret(sql, context.userId, "apollo", data.apollo);
    if (Number.isFinite(Number(data.huntBatch))) {
      const batch = Math.min(20, Math.max(4, Math.round(Number(data.huntBatch))));
      await putSecret(sql, context.userId, "hunt_batch", String(batch));
    }
    if (data.zoominfo) await putSecret(sql, context.userId, "zoominfo", data.zoominfo);
    if (data.jev) await putSecret(sql, context.userId, "jev", data.jev);
    if (data.jevBaseUrl) {
      if (!data.jevBaseUrl.startsWith("https://")) throw new Error("Jev base URL must be HTTPS.");
      await putSecret(sql, context.userId, "jev_base_url", data.jevBaseUrl.replace(/\/+$/, ""));
    }
    if (data.gmailUser) await putSecret(sql, context.userId, "gmail_user", data.gmailUser);
    if (data.gmailPass) await putSecret(sql, context.userId, "gmail_pass", data.gmailPass);
    const budget = Number(data.monthlyBudgetCents);
    if (Number.isFinite(budget) && budget >= 0) {
      const flags = await connectionFlags(sql, context.userId);
      await sql`
        insert into operating_state (user_id, monthly_budget_cents, spend_month, spend_used_cents)
        values (${context.userId}, ${Math.round(budget)}, ${flags.spendMonth}, ${flags.spendUsedCents})
        on conflict (user_id) do update set monthly_budget_cents = excluded.monthly_budget_cents
      `;
    }
    return loadWorkspace(context.userId);
  });

export const exportCrmCsv = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return { filename: "prospector-crm-handoff.csv", csv: await manualCrmCsv(sql, context.userId) };
  });

export const exportArchive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { assertArchiveRequest, MAX_ARCHIVE_BYTES } = await import("@/lib/server/archive-request");
    assertArchiveRequest(getRequest(), context.userId);
    const { exportWorkspaceArchive } = await import("@/lib/server/archive");
    const { getArchiveAdapter } = await import("@/lib/server/archive-db");
    const payload = await exportWorkspaceArchive(context.userId, await getArchiveAdapter());
    const json = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(json, "utf8") > MAX_ARCHIVE_BYTES) {
      throw new Error("This workspace exceeds the 20 MiB portable archive limit.");
    }
    return { filename: "prospector-workspace-v1.json", json };
  });

export const restoreArchive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { json: string }) => input)
  .handler(async ({ context, data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { assertArchiveRequest, parseArchiveInput } = await import("@/lib/server/archive-request");
    const request = getRequest();
    assertArchiveRequest(request, context.userId);
    const input = parseArchiveInput(data);
    const { restoreWorkspaceArchive } = await import("@/lib/server/archive");
    const { getArchiveAdapter } = await import("@/lib/server/archive-db");
    await restoreWorkspaceArchive(context.userId, input, await getArchiveAdapter(), { signal: request.signal });
    return { restored: true };
  });

// Kept for API compatibility. No scheduled work, inbox scan or credit refresh.
export const tickSchedule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { manual: true }) => {
    if (input?.manual !== true) throw new Error("Morning work requires an explicit manual action.");
    return input;
  })
  .handler(async ({ context }) => startHunt(context.userId, "manual"));

export const recordDeliveryEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { messageId: string; kind: string; note: string }) => ({
    messageId: input.messageId,
    kind: ["bounce", "reply", "unsubscribe"].includes(input.kind) ? input.kind : "reply",
    note: input.note.normalize("NFC").trim() || "Owner recorded delivery event.",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const [message] = await sql<{ id: string; to_email: string; prospect_id: string }>`
      select id, to_email, prospect_id from outreach_messages
      where user_id = ${context.userId} and id = ${data.messageId}
    `;
    if (!message) throw new Error("That message is not in this workspace.");
    await sql`
      insert into delivery_events (id, user_id, message_id, kind, note)
      values (${idFor(context.userId, `evt:${data.messageId}:${Date.now()}`)}, ${context.userId}, ${data.messageId}, ${data.kind}, ${data.note})
    `;
    if (data.kind === "unsubscribe" || data.kind === "bounce") {
      await sql`
        insert into suppressions (id, user_id, kind, value, reason)
        values (
          ${idFor(context.userId, `sup:email:${message.to_email}`)},
          ${context.userId}, ${"email"}, ${message.to_email.toLowerCase()},
          ${`${data.kind} recorded ${new Date().toISOString()}`}
        )
        on conflict (user_id, kind, value) do nothing
      `;
      await sql`
        update outreach_messages
        set status = ${"blocked"}, blocked_reason = ${`${data.kind} stopped follow-up.`}
        where user_id = ${context.userId} and prospect_id = ${message.prospect_id} and status in (${"draft"}, ${"approved"})
      `;
    }
    return loadWorkspace(context.userId);
  });

export const mergeContacts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { keepId: string; dropId: string; reason: string }) => ({
    keepId: input.keepId,
    dropId: input.dropId,
    reason: input.reason.normalize("NFC").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (data.keepId === data.dropId) throw new Error("Pick two different contacts.");
    if (!data.reason) throw new Error("A merge reason is required.");
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const rows = await sql<{ id: string; prospect_id: string; email_kind: string }>`
      select id, prospect_id, email_kind from contacts
      where user_id = ${context.userId} and id in (${data.keepId}, ${data.dropId})
    `;
    if (rows.length !== 2) throw new Error("Both contacts must belong to this workspace.");
    if (rows[0].prospect_id !== rows[1].prospect_id) throw new Error("Only merge contacts on the same prospect.");
    await sql`delete from contacts where user_id = ${context.userId} and id = ${data.dropId}`;
    await sql`
      insert into identity_merges (id, user_id, keep_id, drop_id, reason)
      values (${idFor(context.userId, `merge:${data.keepId}:${data.dropId}`)}, ${context.userId}, ${data.keepId}, ${data.dropId}, ${data.reason})
    `;
    return loadWorkspace(context.userId);
  });

export const parkGreenfield = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prospectId: string; expectedRevision: number }) => ({
    prospectId: input.prospectId,
    expectedRevision: input.expectedRevision,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureWorkspace(sql, context.userId);
    const rows = await sql<{ id: string }>`
      update prospects
      set state = ${"deferred"},
          lane = ${"greenfield"},
          last_reason = ${"Moved to Greenfield Draft. No morning run, no weekly export-ready count."},
          revision = revision + 1
      where user_id = ${context.userId} and id = ${data.prospectId} and revision = ${data.expectedRevision}
      returning id
    `;
    if (rows.length === 0) throw new Error("That revision is no longer current.");
    return loadWorkspace(context.userId);
  });
