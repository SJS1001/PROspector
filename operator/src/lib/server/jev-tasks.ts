import type { ProspectOutcome } from "@/lib/domain/types";
import { asOutcome, type JevQualifyJudgment } from "@/lib/domain/qualify-jev";
import { jevDecide, parseChoice, parseNoul, parseScore } from "@/lib/server/jev";

const DIMS = [
  ["account_fit", "Score 0-2 account fit: currently operating plant/mill/mine matching the frozen profile. Retrieved page only."],
  ["pain_strength", "Score 0-2 pain: recovery, throughput, downtime, or constraint on the retrieved page."],
  ["timing", "Score 0-2 timing: expansion, ramp, outage, restart, or dated urgency on the retrieved page. A copyright year alone is 0."],
  ["data_readiness", "Score 0-2 data readiness: historian, SCADA, OT/IT, sensors on the retrieved page."],
  ["commercial", "Score 0-2 commercial path: named operator, GM/director, budget or diagnostic language on the retrieved page."],
] as const;

export async function jevQualifyPage(opts: {
  apiKey: string;
  baseUrl?: string;
  accountName: string;
  targetName: string;
  url: string;
  title: string;
  pageText: string;
  profileText: string;
}): Promise<JevQualifyJudgment> {
  const result = await jevDecide({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    state: {
      accountName: opts.accountName,
      targetName: opts.targetName,
      url: opts.url,
      title: opts.title.slice(0, 180),
      page: opts.pageText.slice(0, 6_000),
      profile: opts.profileText.slice(0, 1_800),
    },
    questions: {
      account_fit: {
        type: "score",
        instructions: DIMS[0][1],
        criteria: { "0": "No operating-site fit", "1": "Weak or implied", "2": "Clear operating site" },
      },
      pain_strength: {
        type: "score",
        instructions: DIMS[1][1],
        criteria: { "0": "No pain", "1": "Implied constraint", "2": "Named operating pain" },
      },
      timing: {
        type: "score",
        instructions: DIMS[2][1],
        criteria: { "0": "No urgency", "1": "Weak timing", "2": "Clear dated urgency" },
      },
      data_readiness: {
        type: "score",
        instructions: DIMS[3][1],
        criteria: { "0": "No data stack", "1": "Implied OT/IT", "2": "Named historian/SCADA/OT" },
      },
      commercial: {
        type: "score",
        instructions: DIMS[4][1],
        criteria: { "0": "No buyer path", "1": "Weak commercial", "2": "Named operator or budget path" },
      },
      outcome: {
        type: "choice",
        instructions: "Qualify from the retrieved page only. Do not invent facts. InsufficientEvidence if the page is thin or not the company site. Disqualified for do-not-contact or exploration-only.",
        criteria: {
          Passed: "Operating site, pain and timing present, enough evidence",
          NotQualified: "Real page but below pass rule",
          Disqualified: "Hard no or exploration/greenfield-only",
          InsufficientEvidence: "Thin, stuffed, or untrusted source",
        },
      },
      hard_no: {
        type: "noul",
        instructions: "Does the page say do not contact, no solicitation, opt-out, greenfield only, or exploration only?",
      },
      operating: {
        type: "noul",
        instructions: "Is this a currently operating plant/mill/site rather than a projects-stage or exploration story?",
      },
      stuffed: {
        type: "noul",
        instructions: "Is the page mostly a keyword dump with no real operating narrative?",
      },
    },
  });
  const answers = result.answers ?? {};
  const scores: JevQualifyJudgment["scores"] = {};
  for (const [id] of DIMS) {
    scores[id] = parseScore(answers[id]);
  }
  return {
    scores,
    outcome: asOutcome(parseChoice(answers.outcome)),
    outcomeConfidence: answers.outcome?.confidence ?? 0,
    hardNo: parseNoul(answers.hard_no),
    operating: parseNoul(answers.operating),
    stuffed: parseNoul(answers.stuffed),
  };
}

export async function jevClassifyInbox(opts: {
  apiKey: string;
  baseUrl?: string;
  from: string;
  subject: string;
  body: string;
}): Promise<{ kind: "bounce" | "unsubscribe" | "reply"; confidence: number } | null> {
  const result = await jevDecide({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    state: {
      from: opts.from.slice(0, 200),
      subject: opts.subject.slice(0, 200),
      body: opts.body.slice(0, 4_000),
    },
    questions: {
      kind: {
        type: "choice",
        instructions: "Classify this inbound mail about a prior outbound sales message.",
        criteria: {
          bounce: "Delivery failure, mailer-daemon, undeliverable",
          unsubscribe: "Stop, opt-out, remove me, do not contact",
          reply: "A human reply that is not an opt-out",
        },
      },
    },
  });
  const kind = parseChoice(result.answers?.kind);
  if (kind !== "bounce" && kind !== "unsubscribe" && kind !== "reply") return null;
  return { kind, confidence: result.answers?.kind?.confidence ?? 0 };
}

export async function jevGuardCopy(opts: {
  apiKey: string;
  baseUrl?: string;
  limitations: string;
  promise: string;
  body: string;
}): Promise<{ block: boolean; reason: string }> {
  const result = await jevDecide({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    state: {
      limitations: opts.limitations.slice(0, 1_200),
      promise: opts.promise.slice(0, 800),
      copy: opts.body.slice(0, 4_000),
    },
    questions: {
      violates_limitations: {
        type: "noul",
        instructions: "Does this copy claim something the product limitations forbid?",
      },
      invented_proof: {
        type: "noul",
        instructions: "Does this copy invent savings, results, or proof not in the confirmed promise?",
      },
      safe_to_approve: {
        type: "noul",
        instructions: "Is this copy inside confirmed claims and safe for a human to approve?",
      },
    },
  });
  const answers = result.answers ?? {};
  const violates = parseNoul(answers.violates_limitations);
  const invented = parseNoul(answers.invented_proof);
  const safe = parseNoul(answers.safe_to_approve);
  if (violates >= 0.7) return { block: true, reason: "Jev blocked this copy: it likely violates confirmed limitations." };
  if (invented >= 0.7) return { block: true, reason: "Jev blocked this copy: it likely invents proof or savings." };
  if (safe < 0.4) return { block: true, reason: "Jev is not confident this copy stays inside confirmed claims." };
  return { block: false, reason: "" };
}

export type { ProspectOutcome };
