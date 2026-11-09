import { llmProvider, responseSpendCents, spendCents, spendDollars, type SpendRateId, type SpendUsage } from "@/lib/domain/llm";
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
  const month = currentSpendMonth();
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
      spend: spendMeter(sql, userId),
    };
  }
  const apiKey =
    (await getSecret(sql, userId, "jev")) ||
    process.env.TYPESAFE_API_KEY ||
    process.env.JEV_API_KEY ||
    "";
  const baseUrl = (await getSecret(sql, userId, "jev_base_url")) || undefined;
  return { apiKey, baseUrl, transport: plan.transport, model: plan.model, spend: spendMeter(sql, userId) };
}

/** The spend month, "YYYY-MM" in Toronto time. The used count restarts when it changes. */
export function currentSpendMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(now);
}

/** An AI request refused because of the monthly spend cap. Its message is shown as is. */
export class SpendCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapError";
  }
}

async function spendRefusal(sql: Sql, userId: string, month: string) {
  const [state] = await sql<{ monthly_budget_cents: number; spend_month: string; spend_used_cents: number }>`
    select monthly_budget_cents, spend_month, spend_used_cents from operating_state where user_id = ${userId}
  `;
  const cap = Number(state?.monthly_budget_cents ?? 0);
  const used = state?.spend_month === month ? Number(state.spend_used_cents) : 0;
  if (cap > used) return null;
  return new SpendCapError(
    cap <= 0
      ? "AI is turned off because the monthly AI spend cap is 0 USD. Raise the cap in Settings → Connections & search settings → Monthly spend cap to use AI again."
      : `This month's AI spend cap is reached (${spendDollars(used)} of ${spendDollars(cap)} USD used). Raise the cap in Settings → Connections & search settings → Monthly spend cap, or wait until next month.`,
  );
}

async function ensureOperatingState(sql: Sql, userId: string, month: string) {
  // A missing row gets the column default cap, the same as a new workspace.
  await sql`
    insert into operating_state (user_id, spend_month) values (${userId}, ${month})
    on conflict (user_id) do nothing
  `;
}

/** Throws SpendCapError when no AI request may start now. Sends nothing. */
export async function assertAiSpendAllowed(sql: Sql, userId: string) {
  const month = currentSpendMonth();
  await ensureOperatingState(sql, userId, month);
  const refusal = await spendRefusal(sql, userId, month);
  if (refusal) throw refusal;
}

/** What one AI request may cost: the provider rate and the most it can use. */
export type SpendCharge = SpendUsage & { rate: SpendRateId };

/**
 * Runs one AI request against the monthly cap. `send` must perform the only
 * network request; it is never called once used >= cap (or the cap is 0).
 */
export type SpendMeter = (charge: SpendCharge, send: () => Promise<Response>) => Promise<Response>;

export function spendMeter(sql: Sql, userId: string): SpendMeter {
  return async (charge, send) => {
    const month = currentSpendMonth();
    const estimate = spendCents(charge.rate, charge);
    await ensureOperatingState(sql, userId, month);
    // One statement checks the cap, restarts a new month and reserves the estimate.
    const reserved = await sql<{ spend_used_cents: number }>`
      update operating_state set
        spend_used_cents = (case when spend_month = ${month} then spend_used_cents else 0 end) + ${estimate},
        spend_month = ${month}
      where user_id = ${userId}
        and (case when spend_month = ${month} then spend_used_cents else 0 end) < monthly_budget_cents
      returning spend_used_cents
    `;
    if (!reserved.length) throw (await spendRefusal(sql, userId, month)) ?? new SpendCapError("The monthly AI spend cap could not be checked. Try again.");
    const settle = async (actual: number) => {
      if (actual === estimate) return;
      await sql`
        update operating_state set spend_used_cents = greatest(0, spend_used_cents + ${actual - estimate})
        where user_id = ${userId} and spend_month = ${month}
      `;
    };
    // If send throws (timeout or network), the provider may still bill, so the estimate stays.
    const response = await send();
    if (!response.ok) {
      // A refused request is not billed.
      await settle(0);
      return response;
    }
    const body = await response.clone().json().catch(() => null);
    await settle(responseSpendCents(charge.rate, body, charge.searches ?? 0) ?? estimate);
    return response;
  };
}
