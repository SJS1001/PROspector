export type ZoomHit = {
  providerId: string;
  fullName: string;
  title: string;
  email: string | null;
  phone: string | null;
};

async function post(path: string, key: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.zoominfo.com${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof json.message === "string" ? json.message : `ZoomInfo ${response.status}`;
    throw new Error(message);
  }
  return json;
}

async function authenticate(key: string) {
  const response = await fetch("https://api.zoominfo.com/authenticate", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: key }),
  });
  const json = (await response.json().catch(() => ({}))) as { jwt?: string };
  if (!response.ok || !json.jwt) {
    const fallback = await fetch("https://api.zoominfo.com/authenticate", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: key }),
    });
    const alt = (await fallback.json().catch(() => ({}))) as { jwt?: string };
    if (!fallback.ok || !alt.jwt) throw new Error("ZoomInfo authentication failed.");
    return alt.jwt;
  }
  return json.jwt;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function fromRecord(row: Record<string, unknown>): ZoomHit | null {
  const first = String(row.firstName ?? row.first_name ?? "");
  const last = String(row.lastName ?? row.last_name ?? "");
  const name = String(row.fullName ?? row.name ?? `${first} ${last}`).trim();
  if (!name) return null;
  const email = String(row.email ?? row.emailAddress ?? "") || null;
  const phone = String(row.phone ?? row.phoneNumber ?? row.directPhoneDoNotCall ?? "") || null;
  return {
    providerId: String(row.id ?? row.zoominfoId ?? name),
    fullName: name,
    title: String(row.jobTitle ?? row.title ?? ""),
    email,
    phone,
  };
}

export async function searchZoomInfoPeople(opts: {
  key: string;
  accountName: string;
  titles: string[];
}): Promise<ZoomHit[]> {
  let token = opts.key;
  try {
    await post("/search/contact", token, {
      companyName: opts.accountName,
      jobTitle: opts.titles[0],
      rpp: 5,
      outputFields: ["id", "firstName", "lastName", "email", "phone", "jobTitle"],
    });
  } catch {
    token = await authenticate(opts.key);
  }
  const search = await post("/search/contact", token, {
    companyName: opts.accountName,
    jobTitle: opts.titles[0],
    rpp: 5,
    outputFields: ["id", "firstName", "lastName", "email", "phone", "jobTitle"],
  });
  const rows = asList(search.data ?? search.results ?? search);
  const hits: ZoomHit[] = [];
  for (const row of rows.slice(0, 3)) {
    const basic = fromRecord(row);
    if (!basic) continue;
    if (basic.email) {
      hits.push(basic);
      continue;
    }
    try {
      const enrich = await post("/enrich/contact", token, {
        matchPersonInput: [{ companyName: opts.accountName, firstName: row.firstName, lastName: row.lastName }],
        outputFields: ["id", "firstName", "lastName", "email", "phone", "jobTitle"],
      });
      const people = asList(enrich.data ?? enrich.result ?? enrich);
      hits.push(fromRecord(people[0] ?? row) ?? basic);
    } catch {
      hits.push(basic);
    }
  }
  return hits;
}
