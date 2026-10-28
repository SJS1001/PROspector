type ApolloPerson = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string | null;
  email_status?: string | null;
  phone_numbers?: { sanitized_number?: string }[];
  organization?: { name?: string; primary_domain?: string };
};

export type ApolloHit = {
  providerId: string;
  fullName: string;
  title: string;
  email: string | null;
  emailStatus: string | null;
  phone: string | null;
};

async function apolloPost(path: string, key: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.apollo.io/api/v1${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof json.error === "string" ? json.error : `Apollo ${response.status}`;
    throw new Error(message);
  }
  return json;
}

function fromPerson(person: ApolloPerson | null | undefined): ApolloHit | null {
  if (!person?.name && !person?.first_name) return null;
  const phone = person.phone_numbers?.find((item) => item.sanitized_number)?.sanitized_number ?? null;
  return {
    providerId: person.id ?? "",
    fullName: person.name || `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
    title: person.title ?? "",
    email: person.email || null,
    emailStatus: person.email_status ?? null,
    phone,
  };
}

export async function searchApolloPeople(opts: {
  key: string;
  accountName: string;
  domain: string;
  titles: string[];
}): Promise<ApolloHit[]> {
  const search = await apolloPost("/mixed_people/api_search", opts.key, {
    q_organization_name: opts.accountName,
    q_organization_domains: opts.domain ? [opts.domain] : undefined,
    person_titles: opts.titles,
    per_page: 5,
  });
  const people = Array.isArray(search.people) ? (search.people as ApolloPerson[]) : [];
  const hits: ApolloHit[] = [];
  for (const person of people.slice(0, 3)) {
    const basic = fromPerson(person);
    if (!basic) continue;
    if (basic.email) {
      hits.push(basic);
      continue;
    }
    try {
      const match = await apolloPost("/people/match", opts.key, {
        first_name: person.first_name,
        last_name: person.last_name,
        organization_name: opts.accountName,
        domain: opts.domain || undefined,
        reveal_personal_emails: false,
        reveal_phone_number: Boolean(opts.key),
      });
      hits.push(fromPerson(match.person as ApolloPerson) ?? basic);
    } catch {
      hits.push(basic);
    }
  }
  return hits;
}

export type ApolloCredits = {
  leadLimit: number | null;
  leadConsumed: number | null;
  leadLeft: number | null;
  fetchedAt: string;
};

export async function fetchApolloCredits(key: string): Promise<ApolloCredits> {
  const response = await fetch("https://api.apollo.io/api/v1/usage_stats/credit_usage_stats", {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify({}),
  });
  const json = (await response.json().catch(() => ({}))) as {
    credit_usage_stats?: Record<string, { limit?: number; consumed?: number; left_over?: number }>;
  };
  if (!response.ok) throw new Error(`Apollo usage ${response.status}`);
  const lead = json.credit_usage_stats?.lead_credit ?? json.credit_usage_stats?.export_credit;
  return {
    leadLimit: lead?.limit ?? null,
    leadConsumed: lead?.consumed ?? null,
    leadLeft: lead?.left_over ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

