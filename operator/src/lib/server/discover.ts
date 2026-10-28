import type { ProfileSnapshot } from "@/lib/domain/types";
import { completeJson } from "@/lib/server/llm";
import { profileText } from "@/lib/server/profile";
import { idFor } from "@/lib/server/seed";
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

async function proposeMarkets(sql: Sql, userId: string, snapshot: ProfileSnapshot): Promise<ProposalDraft[]> {
  const prompt = `You are an untrusted research runner. Do not start prospecting or name individual sales targets.
Return JSON only: {"proposals":[{"title":"","problemMatch":"","customerType":"","examples":"","likelyBuyer":"","risks":"","productFit":"","evidence":""}]}
Produce at most 3 Market Play proposals for this product. Each is a market, not a company list.
${profileText(snapshot)}`;
  const text = await completeJson(sql, userId, prompt);
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
  const proposals = await proposeMarkets(opts.sql, opts.userId, opts.snapshot);
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
