export class SourcePolicyError extends Error { readonly code = "source_policy_rejected"; }

export type TrustedSourcePolicy = Readonly<{
  tier1Origins: readonly string[];
  tier2Origins: readonly string[];
  materialSignalKinds: readonly string[];
}>;

export type TrustedSourceObservation = Readonly<{
  url: string; retrievedAt: number; observedAt: number; excerpt: string; declaredPublisher?: string; kind: string;
}>;

export type ValidatedSignal = Readonly<{
  url: string; publisherIdentity: string; underlyingOriginIdentity: string; independenceGroup: string;
  tier: 1 | 2 | 3; excerpt: string; retrievedAt: number; observedAt: number; kind: string;
  material: boolean; recency: "current" | "account_context_reconfirmation_required";
  fingerprint: string;
}>;

/** Application-owned tiering: a runner's claimed tier can never enter this API. */
export async function validateSourceObservation(policy: TrustedSourcePolicy, observation: TrustedSourceObservation, now: number): Promise<ValidatedSignal> {
  const parsed = parseHttps(observation.url); const origin = canonicalOrigin(parsed.hostname);
  const publisherIdentity = origin; // trust origin rather than a runner-provided publisher label
  const tier = includesOrigin(policy.tier1Origins, origin) ? 1 : includesOrigin(policy.tier2Origins, origin) ? 2 : 3;
  const kind = bounded(observation.kind, "Signal kind", 128); const excerpt = escapedExcerpt(observation.excerpt);
  if (!Number.isSafeInteger(observation.retrievedAt) || !Number.isSafeInteger(observation.observedAt) || observation.retrievedAt <= 0 || observation.observedAt <= 0 || observation.retrievedAt > now + 60_000) throw fail("Source dates are invalid");
  const material = policy.materialSignalKinds.map((item) => bounded(item, "Material signal kind", 128)).includes(kind);
  const recency = material && now - observation.observedAt > 30 * 24 * 60 * 60 * 1_000 ? "account_context_reconfirmation_required" as const : "current" as const;
  const fingerprint = await digest(canonical({ url: parsed.toString(), origin, kind, excerpt, observedAt: observation.observedAt }));
  return Object.freeze({ url: parsed.toString(), publisherIdentity, underlyingOriginIdentity: origin, independenceGroup: `origin:${origin}`, tier, excerpt, retrievedAt: observation.retrievedAt, observedAt: observation.observedAt, kind, material, recency, fingerprint });
}

/** Signals are append-only trusted projections over an immutable runner submission. */
export async function appendValidatedSignals(database: D1Database, input: { workspaceId: string; submissionId: string; policy: TrustedSourcePolicy; now: number }) {
  const submission = await database.prepare("SELECT s.id, s.run_id, s.assignment_id, s.configuration_id, s.submission_json, r.profile_id FROM runner_submissions s JOIN prospecting_runs r ON r.id = s.run_id WHERE s.id = ? AND s.workspace_id = ? LIMIT 1")
    .bind(input.submissionId, input.workspaceId).first<{ id: string; run_id: string; assignment_id: string; configuration_id: string; submission_json: string; profile_id: string }>();
  if (!submission) throw fail("Runner submission is unavailable");
  const payload = JSON.parse(submission.submission_json) as { findings?: unknown[] };
  if (!Array.isArray(payload.findings)) throw fail("Runner submission findings are unavailable");
  const existing = await database.prepare("SELECT COUNT(*) AS count FROM prospecting_signals WHERE submission_id = ?").bind(submission.id).first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) throw fail("Runner submission has already been validated");
  const validated = await Promise.all(payload.findings.map(async (finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) throw fail("Runner finding is invalid");
    const value = finding as Record<string, unknown>;
    return validateSourceObservation(input.policy, { url: string(value.sourceUrl), retrievedAt: input.now, observedAt: integer(value.observedAt), excerpt: string(value.excerpt), kind: string(value.kind) }, input.now);
  }));
  const sorted = [...validated].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const statements: D1PreparedStatement[] = [];
  for (const signal of sorted) {
    const lineageId = `lineage_${signal.fingerprint.slice(0, 24)}`; const signalId = `signal_${signal.fingerprint.slice(0, 24)}`;
    const lineageJson = canonical({ source: signal.url, publisher: signal.publisherIdentity, origin: signal.underlyingOriginIdentity, independenceGroup: signal.independenceGroup, tier: signal.tier, retrievedAt: signal.retrievedAt });
    const signalJson = canonical({ kind: signal.kind, excerpt: signal.excerpt, observedAt: signal.observedAt, material: signal.material, recency: signal.recency, rawSubmissionId: submission.id });
    statements.push(
      database.prepare("INSERT INTO prospecting_source_lineage (id, workspace_id, run_id, submission_id, source_id, source_url, publisher_identity, underlying_origin_identity, independence_group, source_tier, published_at, occurred_at, retrieved_at, excerpt, lineage_json, lineage_digest, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)").bind(lineageId, input.workspaceId, submission.run_id, submission.id, signal.url, signal.publisherIdentity, signal.underlyingOriginIdentity, signal.independenceGroup, signal.tier, signal.observedAt, signal.retrievedAt, signal.excerpt, lineageJson, await digest(lineageJson), input.now),
      database.prepare("INSERT INTO prospecting_signals (id, workspace_id, run_id, submission_id, source_lineage_id, profile_id, signal_kind, signal_json, signal_digest, material, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(signalId, input.workspaceId, submission.run_id, submission.id, lineageId, submission.profile_id, signal.kind, signalJson, signal.fingerprint, signal.material ? 1 : 0, input.now),
    );
  }
  if (statements.length) await database.batch(statements);
  return sorted;
}

export function sourceWindow(watermark: number | null, upperInclusive: number) { if (!Number.isSafeInteger(upperInclusive)) throw fail("Source window upper bound is invalid"); return { lowerExclusive: watermark === null ? null : watermark - 24 * 60 * 60 * 1_000, upperInclusive }; }

function parseHttps(value: string) { let parsed: URL; try { parsed = new URL(value); } catch { throw fail("Source URL is invalid"); } if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hostname === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname)) throw fail("Source URL is not a public HTTPS URL"); parsed.hash = ""; return parsed; }
function canonicalOrigin(host: string) { const normalized = host.toLowerCase().replace(/\.$/, ""); const labels = normalized.split("."); if (labels.length < 2) throw fail("Source origin is invalid"); return labels.slice(-2).join("."); }
function includesOrigin(origins: readonly string[], origin: string) { return origins.some((entry) => canonicalOrigin(entry) === origin); }
function escapedExcerpt(value: unknown) { return bounded(value, "Source excerpt", 8_192).replace(/[<>]/g, (character) => character === "<" ? "&lt;" : "&gt;"); }
function bounded(value: unknown, label: string, max: number) { if (typeof value !== "string" || !(value = value.normalize("NFC").trim()) || value.length > max) throw fail(`${label} is invalid`); return value; }
function string(value: unknown) { return bounded(value, "Runner source field", 8_192); }
function integer(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw fail("Runner source timestamp is invalid"); return value as number; }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`; } return JSON.stringify(value); }
async function digest(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function fail(message: string): SourcePolicyError { return new SourcePolicyError(message); }
