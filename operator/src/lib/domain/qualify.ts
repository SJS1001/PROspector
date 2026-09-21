import { createHash } from "node:crypto";
import { PASS_RULE } from "./catalog.ts";
import type { Assessment, ProspectOutcome, ScoreDimension } from "@/lib/domain/types";

export const RUBRIC_DIGEST = "sha256:mining-operating-rubric-v2";

const DIMENSIONS = [
  { id: "account_fit", label: "Account fit", keys: ["plant", "mill", "concentrator", "processing", "operating", "mine", "smelter"] },
  { id: "pain_strength", label: "Pain strength", keys: ["recovery", "throughput", "downtime", "latency", "trapped", "constraint", "loss"] },
  { id: "timing", label: "Timing / urgency", keys: ["expansion", "ramp", "outage", "2025", "2026", "priority", "commission", "restart"] },
  { id: "data_readiness", label: "Data readiness", keys: ["historian", "scada", "oem", "ot/it", "sensor", "digital", "lab"] },
  { id: "commercial", label: "Commercial viability", keys: ["gm", "director", "vice president", "owner", "budget", "diagnostic", "nda"] },
] as const;

const T2_HOSTS = [
  "reuters.com",
  "mining.com",
  "northernminer.com",
  "sec.gov",
  "sedarplus.ca",
  "asx.com.au",
  "londonstockexchange.com",
  "kitco.com",
  "miningweekly.com",
];

const HARD_NO = ["no solicitation", "do not contact", "opt-out", "greenfield only", "exploration only"];

export type RetrievedSource = {
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
};

export type QualificationInput = {
  accountName: string;
  targetName: string;
  source: RetrievedSource;
  profileText: string;
  runnerNotes?: Partial<Record<(typeof DIMENSIONS)[number]["id"], string>>;
};

export type QualificationResult = {
  outcome: ProspectOutcome;
  score: number;
  assessment: Assessment;
  evidenceExcerpt: string;
  evidenceTier: number;
  evidenceDate: string;
  fingerprint: string;
};

function clip(text: string, max = 360) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function assignTier(accountName: string, url: string): 1 | 2 | 3 {
  const host = hostOf(url);
  const slug = accountName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  if (slug && host.replace(/[^a-z0-9]/g, "").includes(slug.slice(0, 8))) return 1;
  if (T2_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))) return 2;
  return 3;
}

function sentencesOf(text: string) {
  return text
    .split(/[.!?;\n]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0);
}

function scoreHits(text: string, keys: readonly string[]) {
  const sentences = sentencesOf(text);
  const found = new Set<string>();
  let sentenceHits = 0;
  for (const sentence of sentences) {
    const hay = sentence.toLowerCase();
    const matched = keys.filter((term) => hay.includes(term.toLowerCase()));
    if (matched.length === 0) continue;
    sentenceHits += 1;
    for (const term of matched) found.add(term);
  }
  if (found.size >= 3) return 2;
  if (found.size >= 1) return 1;
  return 0;
}

function timingScore(text: string) {
  const keys = DIMENSIONS.find((item) => item.id === "timing")!.keys.filter((item) => !/^\d{4}$/.test(item));
  const years = ["2025", "2026", "2027"];
  const sentences = sentencesOf(text);
  const found = new Set<string>();
  let sentenceHits = 0;
  for (const sentence of sentences) {
    const hay = sentence.toLowerCase();
    const verb = keys.filter((term) => hay.includes(term));
    const year = years.filter((term) => hay.includes(term));
    if (verb.length === 0 && year.length === 0) continue;
    if (year.length && verb.length === 0) continue;
    sentenceHits += 1;
    for (const term of [...verb, ...year]) found.add(term);
  }
  if (found.size >= 3) return 2;
  if (found.size >= 1) return 1;
  return 0;
}

function stuffedPage(text: string) {
  const words = text.toLowerCase().split(/[^a-z0-9+/]+/).filter((word) => word.length > 2);
  if (words.length === 0) return true;
  const keys = new Set<string>(DIMENSIONS.flatMap((item) => [...item.keys]));
  const hits = words.filter((word) => keys.has(word)).length;
  const density = hits / words.length;
  return words.length < 16 && density > 0.6;
}

export function fingerprintOf(accountName: string, targetName: string) {
  return createHash("sha256")
    .update(`${accountName.trim().toLowerCase()}|${targetName.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

export function qualifyCandidate(input: QualificationInput): QualificationResult {
  const pageText = `${input.source.title} ${input.source.text}`;
  const stuffed = stuffedPage(pageText);
  const dimensions: ScoreDimension[] = DIMENSIONS.map((dim) => {
    const score = stuffed ? 0 : dim.id === "timing" ? timingScore(pageText) : scoreHits(pageText, dim.keys);
    return {
      id: dim.id,
      label: dim.label,
      score,
      max: 2,
      note: stuffed
        ? "Keyword dump on a short page — not counted."
        : `Distinct terms on the retrieved page (${score}/2). Profile extras and runner notes are ignored.`,
    };
  });

  const score = dimensions.reduce((sum, item) => sum + item.score, 0);
  const pain = dimensions.find((item) => item.id === "pain_strength")?.score ?? 0;
  const timing = dimensions.find((item) => item.id === "timing")?.score ?? 0;
  const hay = pageText.toLowerCase();
  const hard = HARD_NO.find((item) => hay.includes(item)) ?? null;
  const tier = assignTier(input.accountName, input.source.url);
  const qualifyingSources = tier === 1;
  const excerpt = clip(input.source.text || input.source.title);

  let outcome: ProspectOutcome = "Passed";
  if (hard) outcome = "Disqualified";
  else if (stuffed || !input.source.text.trim() || !qualifyingSources && tier === 3) outcome = "InsufficientEvidence";
  else if (score < 7 || pain < 1 || timing < 1) outcome = "NotQualified";

  return {
    outcome,
    score,
    assessment: {
      passRule: PASS_RULE,
      hardDisqualifier: hard,
      dimensions,
    },
    evidenceExcerpt: excerpt,
    evidenceTier: tier,
    evidenceDate: input.source.retrievedAt.slice(0, 10),
    fingerprint: fingerprintOf(input.accountName, input.targetName),
  };
}
