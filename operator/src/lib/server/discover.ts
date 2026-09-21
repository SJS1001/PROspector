import type { ProfileSnapshot } from "@/lib/domain/types";
import { profileText } from "@/lib/server/profile";
import { idFor } from "@/lib/server/seed";
import { resolveXaiKey } from "@/lib/server/secrets";
import type { Sql } from "@/lib/db";

type ProposalDraft = {
  title: string;
  problemMatch: string;
  customerType: string;
  examples: string;
  likelyBuyer: string;
  risks: string;
  productFit: string;
  evidence: string;
};

function extractJson(text: string): { proposals?: ProposalDraft[] } {
  const fenced = text.match(/```json([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!fenced) return {};
  try {
    return JSON.parse(fenced) as { proposals?: ProposalDraft[] };
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
    const row = item as { content?: unknown };
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

async function proposeMarkets(snapshot: ProfileSnapshot, apiKey: string): Promise<ProposalDraft[]> {
  if (!apiKey) throw new Error("Add an xAI key in Connections before running discovery.");
  const prompt = `You are an untrusted research runner. Do not start prospecting or name individual sales targets.
Return JSON only: {"proposals":[{"title":"","problemMatch":"","customerType":"","examples":"","likelyBuyer":"","risks":"","productFit":"","evidence":""}]}
Produce at most 3 Market Play proposals for this product. Each is a market, not a company list.
${profileText(snapshot)}`;

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  const responses = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "grok-4.5",
      input: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search" }],
      max_output_tokens: 1800,
    }),
  });
  let text = "";
  if (responses.ok) text = outputText((await responses.json()) as Record<string, unknown>);
  else {
    const chat = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: "grok-4.5",
        messages: [{ role: "user", content: prompt }],
        search_parameters: { mode: "on", return_citations: true },
        max_tokens: 1800,
      }),
    });
    if (!chat.ok) throw new Error(`Market discovery failed (${chat.status}).`);
    text = outputText((await chat.json()) as Record<string, unknown>);
  }
  return (extractJson(text).proposals ?? [])
    .filter((item) => item?.title && item?.problemMatch)
    .slice(0, 3);
}

export async function executeDiscovery(opts: {
  sql: Sql;
  userId: string;
  runId: string;
  digest: string;
  snapshot: ProfileSnapshot;
}) {
  const proposals = await proposeMarkets(opts.snapshot, await resolveXaiKey(opts.sql, opts.userId));
  let n = 0;
  for (const item of proposals) {
    n += 1;
    const id = idFor(opts.userId, `disc:${opts.runId}:${n}`);
    await opts.sql`
      insert into market_proposals (
        id, user_id, title, problem_match, customer_type, examples, likely_buyer,
        risks, product_fit, evidence, decision
      ) values (
        ${id}, ${opts.userId}, ${item.title.slice(0, 160)}, ${item.problemMatch.slice(0, 800)},
        ${(item.customerType || "").slice(0, 240)}, ${(item.examples || "").slice(0, 240)},
        ${(item.likelyBuyer || "").slice(0, 240)}, ${(item.risks || "").slice(0, 400)},
        ${(item.productFit || "").slice(0, 400)}, ${(item.evidence || "").slice(0, 400)},
        ${"open"}
      )
    `;
  }
  await opts.sql`
    update discovery_runs
    set status = ${"succeeded"},
        proposal_count = ${n},
        terminal_reason = ${n ? `${n} proposals in this run. Explore does not start prospecting.` : "No proposals in this source window."},
        finished_at = ${new Date().toISOString()}
    where id = ${opts.runId} and user_id = ${opts.userId}
  `;
}
