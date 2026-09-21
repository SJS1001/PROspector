import { qualifyCandidate } from "@/lib/domain/qualify";
import { mergeJevQualification } from "@/lib/domain/qualify-jev";
import type { ProfileSnapshot } from "@/lib/domain/types";
import { completeJson } from "@/lib/server/llm";
import { jevQualifyPage } from "@/lib/server/jev-tasks";
import { profileText } from "@/lib/server/profile";
import { retrieveHttps } from "@/lib/server/retrieve";
import { resolveJev } from "@/lib/server/secrets";
import { idFor } from "@/lib/server/seed";
import type { Sql } from "@/lib/db";

const MAX_CANDIDATES = 12;

type RunnerCandidate = {
  accountName: string;
  targetName: string;
  url: string;
  excerpt?: string;
  notes?: Record<string, string>;
};

type HuntInsert = {
  accountName: string;
  targetName: string;
  url: string;
  title: string;
  excerpt: string;
  hash: string;
  retrievedAt: string;
  outcome: string;
  score: number;
  assessment: unknown;
  evidenceTier: number;
  evidenceDate: string;
  fingerprint: string;
};

function extractJson(text: string): { candidates?: RunnerCandidate[] } {
  const fenced = text.match(/```json([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!fenced) return {};
  try {
    return JSON.parse(fenced) as { candidates?: RunnerCandidate[] };
  } catch {
    return {};
  }
}

async function proposeCandidates(
  sql: Sql,
  userId: string,
  snapshot: ProfileSnapshot,
  limit: number,
): Promise<RunnerCandidate[]> {
  const prompt = `You are an untrusted research runner for a private GTM workspace.
Do not qualify, score, approve, or invent contact emails.
Return JSON only: {"candidates":[{"accountName":"","targetName":"","url":"https://...","excerpt":"","notes":{"account_fit":"","pain_strength":"","timing":"","data_readiness":"","commercial":""}}]}
Propose at most ${limit} currently operating accounts that match this profile.
Each url must be a real public HTTPS page on the company or a regulator/trade publisher.
Prefer named plants/sites, not conglomerate homepages. Do not use IP addresses or localhost.

Company: ${snapshot.company}
Product: ${snapshot.product}
Promise: ${snapshot.promise}
Play: ${snapshot.play}
Fit: ${snapshot.fit}
Offer: ${snapshot.offerId}`;

  const text = await completeJson(sql, userId, prompt);
  const parsed = extractJson(text).candidates ?? [];
  return parsed
    .filter((item) => item?.accountName && item?.url?.startsWith("https://"))
    .slice(0, limit)
    .map((item) => ({
      accountName: String(item.accountName).slice(0, 120),
      targetName: String(item.targetName || item.accountName).slice(0, 160),
      url: String(item.url).slice(0, 500),
      excerpt: item.excerpt ? String(item.excerpt).slice(0, 400) : undefined,
      notes: item.notes,
    }));
}

export async function executeHunt(opts: {
  sql: Sql;
  userId: string;
  runId: string;
  digest: string;
  snapshot: ProfileSnapshot;
  knownFingerprints: Set<string>;
  maxCandidates?: number;
}) {
  const limit = Math.min(20, Math.max(4, opts.maxCandidates ?? MAX_CANDIDATES));
  const proposed = await proposeCandidates(opts.sql, opts.userId, opts.snapshot, limit);
  const profile = profileText(opts.snapshot);
  const jev = await resolveJev(opts.sql, opts.userId);
  const accepted: HuntInsert[] = [];
  const reasons: string[] = [];

  for (let i = 0; i < proposed.length; i += 4) {
    const batch = proposed.slice(i, i + 4);
    const pages = await Promise.all(
      batch.map(async (candidate) => {
        try {
          return { candidate, page: await retrieveHttps(candidate.url) };
        } catch (error) {
          return { candidate, error };
        }
      }),
    );
    for (const item of pages) {
      if ("error" in item && item.error) {
        reasons.push(
          `${item.candidate.accountName}: ${item.error instanceof Error ? item.error.message : "retrieval failed"}`,
        );
        continue;
      }
      if (!("page" in item) || !item.page) continue;
      let qualified = qualifyCandidate({
        accountName: item.candidate.accountName,
        targetName: item.candidate.targetName,
        source: {
          url: item.page.url,
          title: item.page.title,
          text: item.page.text || item.candidate.excerpt || "",
          retrievedAt: item.page.retrievedAt,
        },
        profileText: profile,
        runnerNotes: item.candidate.notes,
      });
      if (jev.apiKey) {
        try {
          const judged = await jevQualifyPage({
            apiKey: jev.apiKey,
            baseUrl: jev.baseUrl,
            accountName: item.candidate.accountName,
            targetName: item.candidate.targetName,
            url: item.page.url,
            title: item.page.title,
            pageText: item.page.text,
            profileText: profile,
          });
          qualified = mergeJevQualification(qualified, judged);
        } catch {
          // Keyword rubric remains the fail-closed path.
        }
      }
      if (opts.knownFingerprints.has(qualified.fingerprint)) {
        reasons.push(`${item.candidate.accountName}: already in this workspace.`);
        continue;
      }
      opts.knownFingerprints.add(qualified.fingerprint);
      accepted.push({
        accountName: item.candidate.accountName,
        targetName: item.candidate.targetName,
        url: item.page.url,
        title: item.page.title,
        excerpt: qualified.evidenceExcerpt,
        hash: item.page.hash,
        retrievedAt: item.page.retrievedAt,
        outcome: qualified.outcome,
        score: qualified.score,
        assessment: qualified.assessment,
        evidenceTier: qualified.evidenceTier,
        evidenceDate: qualified.evidenceDate,
        fingerprint: qualified.fingerprint,
      });
    }
  }

  for (const item of accepted) {
    const prospectId = idFor(opts.userId, `hunt:${item.fingerprint}`);
    const assessmentId = idFor(opts.userId, `assess:${item.fingerprint}:${opts.runId}`);
    const state = item.outcome === "Passed" ? "qualified" : item.outcome === "Disqualified" ? "disqualified" : "assessed";
    await opts.sql`
      insert into prospects (
        id, user_id, account_name, account_id, target_name, target_id, offer_id,
        score, outcome, state, revision, configuration_digest, assessment_id,
        assessment_json, evidence_excerpt, evidence_url, evidence_tier, evidence_date,
        origin, run_id, fingerprint
      ) values (
        ${prospectId}, ${opts.userId}, ${item.accountName}, ${`org:${item.fingerprint}`},
        ${item.targetName}, ${`target:${item.fingerprint}`}, ${opts.snapshot.offerId},
        ${item.score}, ${item.outcome}, ${state}, ${1}, ${opts.digest}, ${assessmentId},
        ${JSON.stringify(item.assessment)}, ${item.excerpt}, ${item.url}, ${item.evidenceTier},
        ${item.evidenceDate}, ${"run"}, ${opts.runId}, ${item.fingerprint}
      )
    `;
    await opts.sql`
      insert into signals (
        id, user_id, run_id, prospect_id, url, title, excerpt, tier, content_hash,
        retrieved_at, publication_date, recency
      ) values (
        ${idFor(opts.userId, `sig:${opts.runId}:${item.fingerprint}`)}, ${opts.userId}, ${opts.runId},
        ${prospectId}, ${item.url}, ${item.title}, ${item.excerpt}, ${item.evidenceTier},
        ${item.hash}, ${item.retrievedAt}, ${item.evidenceDate}, ${"current"}
      )
    `;
  }

  const qualified = accepted.filter((item) => item.outcome === "Passed").length;
  const terminal =
    accepted.length === 0
      ? reasons[0] ?? "The scoped source window completed without a qualifying candidate."
      : `${accepted.length} retrieved · ${qualified} passed. ${reasons.slice(0, 2).join(" ")}`.trim();

  await opts.sql`
    update prospecting_runs
    set status = ${"succeeded"},
        candidate_count = ${accepted.length},
        qualified_count = ${qualified},
        terminal_reason = ${terminal},
        finished_at = ${new Date().toISOString()}
    where id = ${opts.runId} and user_id = ${opts.userId}
  `;
}
