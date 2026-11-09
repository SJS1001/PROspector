import { llmProvider } from "@/lib/domain/llm";
import { jevCredentialPlan, selectBoundLlmKey, staleLlmKeySecrets } from "@/lib/domain/openrouter-policy";
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
  | "llm_key_binding"
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
  if (name === "llm_provider" || name === "llm_base_url") await clearStaleLlmKey(sql, userId);
}

/** After a provider or base-URL change, delete a stored key that is bound elsewhere (fail closed). */
async function clearStaleLlmKey(sql: Sql, userId: string) {
  const state: Record<string, string> = {};
  for (const name of ["llm_provider", "llm_base_url", "llm_key", "llm_key_binding"] as const) {
    state[name] = await getSecret(sql, userId, name);
  }
  for (const name of staleLlmKeySecrets(state)) {
    await sql`delete from operator_secrets where user_id = ${userId} and name = ${name}`;
  }
}

/** The key the selected provider may use, or "" when none is bound to it. */
export async function boundLlmKey(sql: Sql, userId: string, providerId: string, baseUrl: string) {
  return selectBoundLlmKey({
    providerId,
    baseUrl,
    llmKey: await getSecret(sql, userId, "llm_key"),
    binding: await getSecret(sql, userId, "llm_key_binding"),
    xaiSecret: providerId === "xai" ? await getSecret(sql, userId, "xai") : "",
    envXaiKey: providerId === "xai" ? process.env.XAI_API_KEY || "" : "",
  });
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
  const hasLlm = Boolean(
    selectBoundLlmKey({
      providerId: provider.id,
      baseUrl: map.llm_base_url,
      llmKey: map.llm_key?.trim(),
      binding: map.llm_key_binding?.trim(),
      xaiSecret: map.xai?.trim(),
      envXaiKey: process.env.XAI_API_KEY || "",
    }),
  );
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

/** An xAI key only: llm_key when it is bound to xai, else the xAI row or XAI_API_KEY. */
export async function resolveXaiKey(sql: Sql, userId: string) {
  return boundLlmKey(sql, userId, "xai", "");
}

export async function resolveJev(sql: Sql, userId: string) {
  const providerId = (await getSecret(sql, userId, "llm_provider")) || "xai";
  const plan = jevCredentialPlan(providerId);
  if (plan.transport === "openrouter") {
    return {
      apiKey: await boundLlmKey(sql, userId, "openrouter", ""),
      baseUrl: undefined,
      transport: plan.transport,
      model: plan.model,
    };
  }
  const apiKey =
    (await getSecret(sql, userId, "jev")) ||
    process.env.TYPESAFE_API_KEY ||
    process.env.JEV_API_KEY ||
    "";
  const baseUrl = (await getSecret(sql, userId, "jev_base_url")) || undefined;
  return { apiKey, baseUrl, transport: plan.transport, model: plan.model };
}
