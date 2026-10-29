import { llmProvider } from "@/lib/domain/llm";
import { isSensitiveSecret, openSecret, sealSecret } from "@/lib/server/vault";
import type { Sql } from "@/lib/db";
import type { ApolloCredits } from "@/lib/server/apollo";

export type SecretName =
  | "xai"
  | "apollo"
  | "gmail_user"
  | "gmail_pass"
  | "zoominfo"
  | "monthly_budget_cents"
  | "llm_provider"
  | "llm_model"
  | "llm_base_url"
  | "llm_key"
  | "llm_workspace_id"
  | "schedule_enabled"
  | "hunt_batch"
  | "inbox_scanned_at"
  | "apollo_credits"
  | "jev"
  | "jev_base_url";

export async function getSecret(sql: Sql, userId: string, name: SecretName) {
  const [row] = await sql<{ value: string }>`
    select value from operator_secrets where user_id = ${userId} and name = ${name}
  `;
  if (!row?.value) return "";
  return openSecret(row.value).trim();
}

export async function putSecret(sql: Sql, userId: string, name: SecretName, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    await sql`delete from operator_secrets where user_id = ${userId} and name = ${name}`;
    return;
  }
  const stored = isSensitiveSecret(name) ? sealSecret(trimmed) : trimmed;
  await sql`
    insert into operator_secrets (user_id, name, value, updated_at)
    values (${userId}, ${name}, ${stored}, ${new Date().toISOString()})
    on conflict (user_id, name) do update set value = excluded.value, updated_at = excluded.updated_at
  `;
}

function parseCredits(raw: string): ApolloCredits | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ApolloCredits;
    if (!parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function connectionFlags(sql: Sql, userId: string) {
  const rows = await sql<{ name: string; value: string }>`
    select name, value from operator_secrets where user_id = ${userId}
  `;
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.name] = openSecret(row.value);
  }
  const [state] = await sql<{ monthly_budget_cents: number; spend_month: string; spend_used_cents: number }>`
    select monthly_budget_cents, spend_month, spend_used_cents from operating_state where user_id = ${userId}
  `;
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(new Date());
  const spendMonth = state?.spend_month === month ? state.spend_month : month;
  const spendUsed = state?.spend_month === month ? Number(state.spend_used_cents) : 0;
  const provider = llmProvider(map.llm_provider || "xai");
  const hasLlm = Boolean(map.llm_key || map.xai || process.env.XAI_API_KEY);
  const batch = Number(map.hunt_batch || 12);
  const credits = parseCredits(map.apollo_credits || "");
  return {
    xai: hasLlm,
    llm: hasLlm,
    llmProvider: provider.id,
    llmProviderLabel: provider.label,
    llmModel: map.llm_model || provider.defaultModel,
    llmSearch: provider.search,
    llmWorkspaceId: map.llm_workspace_id || "",
    llmBaseUrl: provider.id === "custom" ? map.llm_base_url || "" : provider.baseUrl,
    scheduleEnabled: map.schedule_enabled === "1",
    huntBatch: Number.isFinite(batch) ? Math.min(20, Math.max(4, Math.round(batch))) : 12,
    apollo: Boolean(map.apollo),
    apolloLeadLeft: credits?.leadLeft ?? null,
    apolloLeadLimit: credits?.leadLimit ?? null,
    apolloCreditsAt: credits?.fetchedAt ?? null,
    gmail: Boolean(map.gmail_user && map.gmail_pass),
    gmailUser: map.gmail_user ? String(map.gmail_user) : null,
    zoominfo: Boolean(map.zoominfo),
    jev: Boolean(map.jev || process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY),
    secretsEncrypted: true,
    inboxScannedAt: map.inbox_scanned_at || null,
    monthlyBudgetCents: Number(state?.monthly_budget_cents ?? map.monthly_budget_cents ?? 5000),
    spendUsedCents: spendUsed,
    spendMonth,
  };
}

export async function resolveXaiKey(sql: Sql, userId: string) {
  return (
    (await getSecret(sql, userId, "llm_key")) ||
    (await getSecret(sql, userId, "xai")) ||
    process.env.XAI_API_KEY ||
    ""
  );
}

export async function resolveJev(sql: Sql, userId: string) {
  const apiKey =
    (await getSecret(sql, userId, "jev")) ||
    process.env.TYPESAFE_API_KEY ||
    process.env.JEV_API_KEY ||
    "";
  const baseUrl = (await getSecret(sql, userId, "jev_base_url")) || undefined;
  return { apiKey, baseUrl };
}
