import type { Sql } from "@/lib/db";

export type SecretName = "xai" | "apollo" | "gmail_user" | "gmail_pass" | "zoominfo" | "monthly_budget_cents";

export async function getSecret(sql: Sql, userId: string, name: SecretName) {
  const [row] = await sql<{ value: string }>`
    select value from operator_secrets where user_id = ${userId} and name = ${name}
  `;
  return row?.value?.trim() || "";
}

export async function putSecret(sql: Sql, userId: string, name: SecretName, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    await sql`delete from operator_secrets where user_id = ${userId} and name = ${name}`;
    return;
  }
  await sql`
    insert into operator_secrets (user_id, name, value, updated_at)
    values (${userId}, ${name}, ${trimmed}, ${new Date().toISOString()})
    on conflict (user_id, name) do update set value = excluded.value, updated_at = excluded.updated_at
  `;
}

export async function connectionFlags(sql: Sql, userId: string) {
  const rows = await sql<{ name: string; value: string }>`
    select name, value from operator_secrets where user_id = ${userId}
  `;
  const map = Object.fromEntries(rows.map((row) => [row.name, row.value]));
  const [state] = await sql<{ monthly_budget_cents: number; spend_month: string; spend_used_cents: number }>`
    select monthly_budget_cents, spend_month, spend_used_cents from operating_state where user_id = ${userId}
  `;
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(new Date());
  const spendMonth = state?.spend_month === month ? state.spend_month : month;
  const spendUsed = state?.spend_month === month ? Number(state.spend_used_cents) : 0;
  return {
    xai: Boolean(map.xai || process.env.XAI_API_KEY),
    apollo: Boolean(map.apollo),
    gmail: Boolean(map.gmail_user && map.gmail_pass),
    gmailUser: map.gmail_user ? String(map.gmail_user) : null,
    zoominfo: Boolean(map.zoominfo),
    monthlyBudgetCents: Number(state?.monthly_budget_cents ?? map.monthly_budget_cents ?? 5000),
    spendUsedCents: spendUsed,
    spendMonth,
  };
}

export async function resolveXaiKey(sql: Sql, userId: string) {
  return (await getSecret(sql, userId, "xai")) || process.env.XAI_API_KEY || "";
}
