import { createHash } from "node:crypto";
import { CONFIGURATION_DIGEST, INTERVIEW, PASS_RULE } from "@/lib/domain/catalog";
import type { Assessment } from "@/lib/domain/types";
import type { Sql } from "@/lib/db";

export function idFor(userId: string, slug: string) {
  return createHash("sha256").update(`prospector:${userId}:${slug}`).digest("hex").slice(0, 24);
}

function dimensions(
  fit: number,
  pain: number,
  timing: number,
  data: number,
  commercial: number,
  notes: [string, string, string, string, string],
): Assessment["dimensions"] {
  return [
    { id: "account_fit", label: "Account fit", score: fit, max: 2, note: notes[0] },
    { id: "pain_strength", label: "Pain strength", score: pain, max: 2, note: notes[1] },
    { id: "timing", label: "Timing / urgency", score: timing, max: 2, note: notes[2] },
    { id: "data_readiness", label: "Data readiness", score: data, max: 2, note: notes[3] },
    {
      id: "commercial",
      label: "Commercial viability",
      score: commercial,
      max: 2,
      note: notes[4],
    },
  ];
}

type SeedProspect = {
  slug: string;
  account: string;
  target: string;
  score: number;
  outcome: "Passed" | "Failed";
  state: "qualified" | "approved" | "rejected" | "deferred";
  excerpt: string;
  url: string;
  tier: number;
  date: string;
  assessment: Assessment;
  cooldownDays?: number;
  reviewDays?: number;
  lane?: "operating" | "greenfield";
};

const PROSPECTS: SeedProspect[] = [
  {
    slug: "nordic-engebø",
    account: "Nordic Mining",
    target: "Engebø rutile and garnet plant",
    score: 9,
    outcome: "Passed",
    state: "qualified",
    excerpt:
      "ONE is already in live production at Engebø on real plant data. The site remains the reference operating plant for an eight-week diagnostic on one trapped decision.",
    url: "https://www.nordicmining.com/operations/engebo/",
    tier: 1,
    date: "2026-08-12",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: null,
      dimensions: dimensions(2, 2, 2, 2, 1, [
        "Operating mineral processing plant with a named site.",
        "Decision latency on recovery and throughput is the stated constraint.",
        "Live production already proves the window is open.",
        "Historian and plant data are in production use.",
        "Reference call available under NDA; commercial expansion is plausible.",
      ]),
    },
  },
  {
    slug: "lundin-candelaria",
    account: "Lundin Mining",
    target: "Candelaria concentrator",
    score: 8,
    outcome: "Passed",
    state: "qualified",
    excerpt:
      "Public technical reporting describes concentrator recovery and throughput as a managed constraint, with mill data held in site historians rather than a decision layer.",
    url: "https://lundinmining.com/operations/candelaria/",
    tier: 1,
    date: "2026-07-28",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: null,
      dimensions: dimensions(2, 2, 1, 2, 1, [
        "Large operating concentrator, mineral processing fit.",
        "Recovery variability is a published operating concern.",
        "No public RFP; timing inferred from current operating reports.",
        "Site historians and mill data exist; access is unproven.",
        "Budget owner exists; no commercial conversation yet.",
      ]),
    },
  },
  {
    slug: "teck-hvc",
    account: "Teck Resources",
    target: "Highland Valley Copper mill",
    score: 7,
    outcome: "Passed",
    state: "qualified",
    excerpt:
      "Highland Valley is an operating copper mill with long-running process data. Public materials emphasise mill reliability and recovery, not a decision layer on top of the historian.",
    url: "https://www.teck.com/operations/canada/operations/highland-valley-copper/",
    tier: 1,
    date: "2026-06-30",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: null,
      dimensions: dimensions(2, 1, 1, 2, 1, [
        "Canadian operating mill, in-profile geography.",
        "Reliability and recovery are discussed; pain is moderate.",
        "No dated buying window; treat as current operating context.",
        "Mature process data environment.",
        "Large operator; diagnostic entry is commercially viable.",
      ]),
    },
  },
  {
    slug: "vale-voiseys",
    account: "Vale",
    target: "Voisey's Bay mill",
    score: 8,
    outcome: "Passed",
    state: "qualified",
    excerpt:
      "Voisey's Bay is an operating mill with concentrator and underground data silos. Public updates describe production, not a unified decision layer.",
    url: "https://www.vale.com/canada",
    tier: 1,
    date: "2026-07-02",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: null,
      dimensions: dimensions(2, 2, 1, 2, 1, [
        "Operating mill and mine, clear mineral-processing fit.",
        "Siloed OEM and mill data matches the ONE problem statement.",
        "Ongoing operations, no explicit RFP.",
        "Historian-class data is implied by mill operations.",
        "Enterprise operator; eight-week diagnostic is in range.",
      ]),
    },
  },
  {
    slug: "boliden-aitik",
    account: "Boliden",
    target: "Aitik concentrator",
    score: 6,
    outcome: "Failed",
    state: "qualified",
    excerpt:
      "Aitik is an operating concentrator, but no current-year source confirms a buying window or a trapped decision owner. Timing scores zero, so the prospect fails the pass rule.",
    url: "https://www.boliden.com/operations/mines/boliden-aitik",
    tier: 2,
    date: "2025-11-18",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: null,
      dimensions: dimensions(2, 1, 0, 2, 1, [
        "Operating concentrator in profile.",
        "Throughput is discussed historically.",
        "No source inside 30 days confirms urgency.",
        "Process data environment is mature.",
        "Commercial path exists later; not now.",
      ]),
    },
  },
  {
    slug: "newmont-boddington",
    account: "Newmont",
    target: "Boddington processing plant",
    score: 7,
    outcome: "Passed",
    state: "deferred",
    excerpt:
      "Boddington is an operating plant with a plausible diagnostic. The operator deferred pending a named champion at the site.",
    url: "https://www.newmont.com/operations-and-projects/global-presence/australia/boddington-australia/default.aspx",
    tier: 1,
    date: "2026-05-22",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: null,
      dimensions: dimensions(2, 1, 1, 2, 1, [
        "Operating gold processing plant.",
        "Plant reliability is a standing concern.",
        "No dated event; treated as current operations.",
        "Site data systems exist.",
        "Global operator; diagnostic is viable once a champion is named.",
      ]),
    },
    reviewDays: 21,
    lane: "operating",
  },
  {
    slug: "greenfield-draft",
    account: "Greenfield Draft",
    target: "Projects-stage mill (nurture)",
    score: 4,
    outcome: "Failed",
    state: "deferred",
    excerpt:
      "Projects-stage mills are kept in Greenfield Draft. They are not an operating profile, get no morning run, and do not count toward the weekly export-ready target.",
    url: "https://www.nordicmining.com/operations/engebo/",
    tier: 3,
    date: "2026-01-15",
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: "No live historian — greenfield nurture only.",
      dimensions: dimensions(1, 0, 0, 0, 1, [
        "No operating plant yet.",
        "No trapped live decision.",
        "First ore is not current.",
        "No historian.",
        "Projects director is a later buyer.",
      ]),
    },
    lane: "greenfield",
  },
];

const PROPOSALS = [
  {
    slug: "play-operating-plants",
    title: "ONE for Mining — operating plants",
    problemMatch:
      "The data to run a processing plant well already exists in OEM systems, historians and vendor portals. Failures surface late and decisions run hours behind the process.",
    customerType: "Operating mineral processing plants with a live historian.",
    examples: "Engebø, Highland Valley Copper, Candelaria, Voisey's Bay mill.",
    likelyBuyer: "VP Processing / General Manager, with a plant champion.",
    risks: "OT/IT access, named decision owner, and a single-decision diagnostic scope.",
    productFit:
      "Direct fit for ONE’s read-only decision layer. This is the first play that may become Ready.",
    evidence:
      "Tier 1: Nordic Mining Engebø production reference. Tier 1: operator technical reports on mill recovery.",
  },
  {
    slug: "play-projects",
    title: "ONE for Mining — projects and ramp-up",
    problemMatch:
      "Projects-stage mills must pick a decision layer before first ore, but they do not yet have a live historian or a settled operating model.",
    customerType: "Projects and ramp-up mills 12–24 months from first production.",
    examples: "Greenfield concentrators and brownfield expansions still in commissioning.",
    likelyBuyer: "Projects director and future GM.",
    risks: "No live data, no eight-week diagnostic on real plant feed, longer sales cycle.",
    productFit:
      "Shares ONE’s core capability, but must not activate prospecting from the operating profile.",
    evidence:
      "Inference from ONE’s product promise. No independent projects-stage win is confirmed.",
  },
  {
    slug: "play-marine",
    title: "ONE for Marine — fleet uptime",
    problemMatch:
      "Marine operators also trap OEM and sensor data, but the delivery model, claims and buyers diverge from mining.",
    customerType: "Fleet operators with condition data siloed in OEM portals.",
    examples: "Not confirmed in this workspace.",
    likelyBuyer: "Fleet technical superintendent.",
    risks:
      "Different buyers, proof, and claim guardrails. Treat as a separate product if they diverge.",
    productFit:
      "Possible later play only if capability, delivery and commercial identity stay with ONE.",
    evidence:
      "Direction record: Marine becomes a play when it shares ONE’s core capability; a product only when it diverges.",
  },
] as const;

export async function ensureWorkspace(sql: Sql, userId: string) {
  const existing = await sql<{ user_id: string }>`
    select user_id from workspaces where user_id = ${userId}
  `;
  if (existing.length === 0) {
    await sql`
      insert into workspaces (user_id, company_name, company_legal, interview_complete)
      values (${userId}, ${"Company setup"}, ${"Company setup"}, ${false})
    `;
  }

  for (const item of INTERVIEW) {
    await sql`
      insert into knowledge_items (
        id, user_id, question_id, scope, question, proposed_answer, confirmed_answer,
        status, evidence, inference, recommendation, sort_order
      ) values (
        ${idFor(userId, item.questionId)}, ${userId}, ${item.questionId}, ${item.scope},
        ${item.question}, ${null}, ${null}, ${"pending"},
        ${item.evidence}, ${item.inference}, ${item.recommendation}, ${item.sortOrder}
      )
      on conflict (user_id, question_id) do nothing
    `;
  }
}

const MINING_ANSWERS: Record<string, string> = {
  "company.legal_name": "Digitalrain",
  "product.name": "ONE",
  "product.capability":
    "ONE is a read-only decision layer that uses existing plant, historian, OEM and lab data to shorten one trapped operating decision.",
  "product.limitations":
    "ONE does not replace the historian, run the plant, place control writes, or invent unproven savings.",
  "product.delivery":
    "Eight-week diagnostic on one named operating plant, delivered with the owner’s existing data access. Digitalrain implements; the plant owns the decision.",
  "product.proof":
    "Live production at Engebø may be cited as a reference under NDA. Site-specific savings for a new plant are unproven until measured there.",
  "product.promise":
    "ONE is a decision layer for mine uptime, recovery and throughput. It does not replace the historian, run the plant, or invent unproven savings.",
  "product.ownership":
    "The signed-in owner is the only person who may confirm commercial knowledge in this workspace.",
  "product.runner":
    "xAI web search + HTTPS retrieve. The runner cannot qualify, approve, spend, or send. No silent failover.",
  "play.market":
    "ONE for Mining — operating mineral processing plants with trapped historian, OEM and lab data.",
  "profile.fit":
    "Operating mineral processing plants with a live historian and an eight-week diagnostic offer. Hard disqualify: no operating plant, no decision owner, or an explicit opt-out.",
  "profile.roles":
    "Plant champion and economic buyer (GM / VP Processing). Validator optional. Roles stay suggestions until revealed.",
  "profile.signals":
    "Company site, regulator, and named trade press. Public HTTPS only. Tier 3 cannot qualify alone.",
  "profile.geo": "English-language operating plants. Other languages need a later play.",
  "profile.schedule":
    "Weekdays 06:00 America/Toronto. Greenfield Draft is excluded from the morning run.",
  "profile.compliance":
    "I acknowledge guidance is advisory. Suppression, digest, and sender checks still apply at send time.",
};

export async function seedMiningSample(sql: Sql, userId: string) {
  await ensureWorkspace(sql, userId);
  const confirmed = await sql<{ n: number }>`
    select count(*)::int as n from knowledge_items
    where user_id = ${userId} and status = ${"confirmed"}
  `;
  if (Number(confirmed[0]?.n ?? 0) > 0) {
    throw new Error(
      "A company is already confirmed in this workspace. Start a corrected review instead of loading the sample.",
    );
  }

  await sql`
    update workspaces
    set company_name = ${"Digitalrain"}, company_legal = ${"Digitalrain"}, interview_complete = ${true}
    where user_id = ${userId}
  `;

  for (const item of INTERVIEW) {
    const answer = MINING_ANSWERS[item.questionId] ?? item.recommendation;
    await sql`
      update knowledge_items
      set proposed_answer = ${answer},
          confirmed_answer = ${answer},
          status = ${"confirmed"},
          recommendation = ${answer}
      where user_id = ${userId} and question_id = ${item.questionId}
    `;
  }

  for (const proposal of PROPOSALS) {
    await sql`
      insert into market_proposals (
        id, user_id, title, problem_match, customer_type, examples, likely_buyer,
        risks, product_fit, evidence, decision
      ) values (
        ${idFor(userId, proposal.slug)}, ${userId}, ${proposal.title}, ${proposal.problemMatch},
        ${proposal.customerType}, ${proposal.examples}, ${proposal.likelyBuyer},
        ${proposal.risks}, ${proposal.productFit}, ${proposal.evidence}, ${"open"}
      )
      on conflict (id) do nothing
    `;
  }

  const now = Date.now();
  for (const prospect of PROSPECTS) {
    const pid = idFor(userId, prospect.slug);
    const aid = idFor(userId, `assess:${prospect.slug}`);
    const cooldown =
      prospect.cooldownDays != null
        ? new Date(now + prospect.cooldownDays * 86400000).toISOString()
        : null;
    const reviewAt =
      prospect.reviewDays != null
        ? new Date(now + prospect.reviewDays * 86400000).toISOString()
        : null;
    await sql`
      insert into prospects (
        id, user_id, account_name, account_id, target_name, target_id, offer_id,
        score, outcome, state, revision, configuration_digest, assessment_id,
        assessment_json, evidence_excerpt, evidence_url, evidence_tier, evidence_date,
        cooldown_until, review_at, material_signal, last_reason, origin, lane
      ) values (
        ${pid}, ${userId}, ${prospect.account}, ${`org:${prospect.slug}`},
        ${prospect.target}, ${`target:${prospect.slug}`},
        ${"eight-week-diagnostic"}, ${prospect.score}, ${prospect.outcome},
        ${prospect.state}, ${1}, ${CONFIGURATION_DIGEST}, ${aid},
        ${JSON.stringify(prospect.assessment)}, ${prospect.excerpt}, ${prospect.url},
        ${prospect.tier}, ${prospect.date}, ${cooldown}, ${reviewAt}, ${false},
        ${prospect.lane === "greenfield" ? "Greenfield Draft — nurture only. Not in the weekly operating target." : prospect.state === "deferred" ? "Named champion not yet confirmed." : null},
        ${"seed"}, ${prospect.lane ?? "operating"}
      )
      on conflict (id) do nothing
    `;

    const contacts = contactsFor(prospect.slug, prospect.account);
    for (const contact of contacts) {
      await sql`
        insert into contacts (
          id, user_id, prospect_id, full_name, role, email_kind, email_display, source, confidence
        ) values (
          ${idFor(userId, `contact:${prospect.slug}:${contact.role}`)}, ${userId}, ${pid},
          ${contact.fullName}, ${contact.role}, ${contact.emailKind}, ${contact.emailDisplay},
          ${contact.source}, ${contact.confidence}
        )
        on conflict (id) do nothing
      `;
    }
  }
}

function contactsFor(slug: string, account: string) {
  return [
    {
      role: "champion",
      fullName: `${account} processing champion (synthetic)`,
      emailKind: slug === "nordic-engebø" ? "verified" : "suggestion",
      emailDisplay:
        slug === "nordic-engebø"
          ? "champion.engebø@synthetic.prospector"
          : `champion.${slug}@synthetic.prospector`,
      source:
        slug === "nordic-engebø"
          ? "Provider-verified business mailbox (synthetic fixture)"
          : "Pattern-guessed mailbox — Contact Suggestion only",
      confidence: slug === "nordic-engebø" ? "high" : "low",
    },
    {
      role: "economic_buyer",
      fullName: `${account} economic buyer (synthetic)`,
      emailKind: "suggestion",
      emailDisplay: `buyer.${slug}@synthetic.prospector`,
      source: "Pattern-guessed mailbox — Contact Suggestion only",
      confidence: "low",
    },
  ] as const;
}
