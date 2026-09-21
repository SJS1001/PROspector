import { qualifyCandidate } from "@/lib/domain/qualify";
import type { ProfileSnapshot } from "@/lib/domain/types";
import { profileText } from "@/lib/server/profile";
import { retrieveHttps } from "@/lib/server/retrieve";
import { idFor } from "@/lib/server/seed";
import { resolveXaiKey } from "@/lib/server/secrets";
import type { Sql } from "@/lib/db";

const MAX_CANDIDATES = 4;

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

function outputText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: string; content?: unknown };
    if (!Array.isArray(row.content)) continue;
    for (const part of row.content) {
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  if (chunks.length) return chunks.join("\n");
  const choices = body.choices as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content ?? "";
}

async function proposeFromXai(snapshot: ProfileSnapshot, apiKey: string): Promise<RunnerCandidate[]> {
  if (!apiKey) throw new Error("Add an xAI key in Connections before hunting.");

  const prompt = `You are an untrusted research runner for a private GTM workspace.
Do not qualify, score, approve, or invent contact emails.
Return JSON only: {"candidates":[{"accountName":"","targetName":"","url":"https://...","excerpt":"","notes":{"account_fit":"","pain_strength":"","timing":"","data_readiness":"","commercial":""}}]}
Propose at most ${MAX_CANDIDATES} currently operating accounts that match this profile.
Each url must be a real public HTTPS page on the company or a regulator/trade publisher.
Prefer named plants/sites, not conglomerate homepages.

Company: ${snapshot.company}
Product: ${snapshot.product}
Promise: ${snapshot.promise}
Play: ${snapshot.play}
Fit: ${snapshot.fit}
Offer: ${snapshot.offerId}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const responses = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "grok-4.5",
      input: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search" }],
      max_output_tokens: 2200,
    }),
  });

  let text = "";
  if (responses.ok) {
    text = outputText((await responses.json()) as Record<string, unknown>);
  } else {
    const chat = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: "grok-4.5",
        messages: [{ role: "user", content: prompt }],
        search_parameters: { mode: "on", return_citations: true, max_search_results: 8 },
        max_tokens: 2200,
      }),
    });
    if (!chat.ok) throw new Error(`Prospecting search failed (${chat.status}).`);
    text = outputText((await chat.json()) as Record<string, unknown>);
  }

  const parsed = extractJson(text).candidates ?? [];
  return parsed
    .filter((item) => item?.accountName && item?.url?.startsWith("https://"))
    .slice(0, MAX_CANDIDATES)
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
}) {
  const apiKey = await resolveXaiKey(opts.sql, opts.userId);
  const proposed = await proposeFromXai(opts.snapshot, apiKey);
  const profile = profileText(opts.snapshot);
  const accepted: HuntInsert[] = [];
  const reasons: string[] = [];

  for (const candidate of proposed) {
    try {
      const page = await retrieveHttps(candidate.url);
      const qualified = qualifyCandidate({
        accountName: candidate.accountName,
        targetName: candidate.targetName,
        source: {
          url: page.url,
          title: page.title,
          text: page.text || candidate.excerpt || "",
          retrievedAt: page.retrievedAt,
        },
        profileText: profile,
        runnerNotes: candidate.notes,
      });
      if (opts.knownFingerprints.has(qualified.fingerprint)) {
        reasons.push(`${candidate.accountName}: already in this workspace.`);
        continue;
      }
      opts.knownFingerprints.add(qualified.fingerprint);
      accepted.push({
        accountName: candidate.accountName,
        targetName: candidate.targetName,
        url: page.url,
        title: page.title,
        excerpt: qualified.evidenceExcerpt,
        hash: page.hash,
        retrievedAt: page.retrievedAt,
        outcome: qualified.outcome,
        score: qualified.score,
        assessment: qualified.assessment,
        evidenceTier: qualified.evidenceTier,
        evidenceDate: qualified.evidenceDate,
        fingerprint: qualified.fingerprint,
      });
    } catch (error) {
      reasons.push(
        `${candidate.accountName}: ${error instanceof Error ? error.message : "retrieval failed"}`,
      );
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
