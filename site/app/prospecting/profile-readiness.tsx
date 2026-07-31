import React from "react";

type Reference = { id?: string; digest?: string; versionId?: string };
type PathPart = { id: string; name: string };
type ProfilePath = {
  company: PathPart;
  product: PathPart;
  marketPlay: PathPart;
  profile: PathPart;
};
type Item = {
  category: string;
  status: "complete" | "missing" | "stale" | "wrong-scoped" | string;
  versionIds?: string[];
};
type Candidate = {
  id: string;
  revision: number;
  digest: string;
  status: string;
  createdAt?: number;
  auditEventId?: string;
  predecessorConfigurationId?: string | null;
  frozenAuthority?: Record<string, unknown>;
};
type Activation = {
  configuration: {
    id: string;
    digest: string;
    frozenAuthority?: Record<string, unknown>;
  };
  initialRun: {
    id: string;
    executionState: string;
    successfulWatermark?: number | null;
  };
  schedule: {
    id: string;
    timezone: string;
    localTime?: string;
    utcOffsetMinutes?: number;
    cadence: string;
    nextRunAt?: number;
    lastSuccessfulWatermark?: number | null;
    executionState: string;
  };
  auditEventId: string;
  profilePath?: ProfilePath;
};
export type ProfileReadinessProjection = {
  profile?: { id: string; revision: number; lifecycle?: string; path?: ProfilePath };
  complete?: boolean;
  missing?: string[];
  items?: Item[];
  candidate?: Candidate | null;
  activation?: Activation | null;
};

export function ProfileReadiness({
  readiness,
  onCommand,
  busy,
}: {
  readiness: ProfileReadinessProjection | null;
  onCommand: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  if (!readiness) {
    return (
      <section className="prospecting-panel">
        <h2>Profile Readiness</h2>
        <p role="alert">No readiness items are available</p>
        <p>
          Load the current Product, Market Play, Offer, and Phase 3 authorities
          before preparing this profile.
        </p>
        <button type="button">Load current authority</button>
      </section>
    );
  }
  const profile = readiness.profile;
  const candidate = readiness.candidate;
  const active = readiness.activation;
  const candidateIsCurrent =
    candidate?.status === "candidate" ||
    candidate?.status === "candidate_not_active";
  return (
    <section
      className="prospecting-panel readiness"
      aria-labelledby="profile-readiness"
    >
      <h2 id="profile-readiness">Profile Readiness</h2>
      {profile?.path && <ScopePath path={profile.path} />}
      <p>
        {readiness.complete
          ? "All required predecessor references are current."
          : "This profile is not ready. Confirm the required item before creating a configuration candidate."}
      </p>
      <ol>
        {(readiness.items ?? []).map((item) => (
          <li key={item.category}>
            <strong>{label(item.category)}</strong>
            <span>{readinessStatus(item.status)}</span>
            <code>
              {item.versionIds?.join(", ") || "No confirmed reference"}
            </code>
          </li>
        ))}
      </ol>
      {!readiness.complete && (
        <p role="alert">
          Missing or stale:{" "}
          {(readiness.missing ?? []).map(label).join(", ") ||
            "unknown authority"}
        </p>
      )}
      {active ? (
        <section
          className="authority-card"
          aria-label="Active Profile Effective Configuration"
        >
          <h3>Active Profile Effective Configuration</h3>
          <code>
            {active.configuration.id} · {active.configuration.digest}
          </code>
          <p>
            Initial run {active.initialRun.id} —{" "}
            {label(active.initialRun.executionState)}
          </p>
          <p>
            Schedule {active.schedule.id} — {active.schedule.cadence} at{" "}
            {active.schedule.localTime ?? "time not recorded"},{" "}
            {active.schedule.timezone} (UTC offset{" "}
            {offset(active.schedule.utcOffsetMinutes)})
          </p>
          <p>
            Schedule state {label(active.schedule.executionState)} · next slot{" "}
            {stamp(active.schedule.nextRunAt)} · last successful watermark{" "}
            {stamp(
              active.schedule.lastSuccessfulWatermark ??
                active.initialRun.successfulWatermark,
            )}
          </p>
          <p>Audit {active.auditEventId}</p>
        </section>
      ) : candidateIsCurrent && candidate ? (
        <section className="authority-card candidate-review">
          <h3>Candidate — not active</h3>
          <p>
            Review this complete frozen authority before making the separate
            activation decision.
          </p>
          <code>
            Candidate {candidate.id} · revision {candidate.revision} · digest{" "}
            {candidate.digest}
          </code>
          <FrozenCandidate
            manifest={candidate.frozenAuthority}
            path={profile?.path}
          />
          <p>
            Activation preserves history, queues one initial prospecting run,
            and starts this profile’s schedule. It does not authorize contact,
            spend, export, or outreach.
          </p>
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() =>
              onCommand({
                action: "activate",
                candidateId: candidate.id,
                expectedRevision: candidate.revision,
                expectedDigest: candidate.digest,
              })
            }
          >
            Activate Profile configuration
          </button>
        </section>
      ) : (
        <section className="authority-card">
          <h3>Configuration candidate</h3>
          <p>
            Creating a candidate freezes the reviewed authority. It does not
            activate a run or schedule.
          </p>
          <button
            className="primary"
            type="button"
            disabled={busy || !readiness.complete || !profile}
            onClick={() =>
              profile &&
              onCommand({
                action: "create_candidate",
                profileId: profile.id,
                expectedRevision: profile.revision,
              })
            }
          >
            Create Profile configuration candidate
          </button>
        </section>
      )}
    </section>
  );
}

function FrozenCandidate({
  manifest,
  path,
}: {
  manifest?: Record<string, unknown>;
  path?: ProfilePath;
}) {
  const authority = record(manifest?.authority);
  const policy = record(manifest?.policy);
  const categories = record(manifest?.confirmedCategoryInputs);
  const offer = record(authority?.offer);
  const source = record(authority?.sourcePolicy);
  const runner = record(authority?.runnerPolicy);
  const rubric = Array.isArray(categories?.rubric)
    ? (categories?.rubric as Reference[])
    : [];
  const output = Array.isArray(categories?.output_policy)
    ? (categories?.output_policy as Reference[])
    : [];
  return (
    <div className="frozen-authority" aria-label="Frozen candidate authority">
      <h4>Frozen candidate authority review</h4>
      {path && <ScopePath path={path} offerId={text(offer?.id)} />}
      <dl>
        <AuthorityRow
          term="Product configuration"
          value={reference(authority?.productConfiguration)}
        />
        <AuthorityRow
          term="Market Play"
          value={reference(authority?.acceptedPlay)}
        />
        <AuthorityRow term="Offer" value={reference(offer)} />
        <AuthorityRow term="Source policy" value={reference(source)} />
        <AuthorityRow term="Runner policy" value={reference(runner)} />
        <AuthorityRow
          term="Rubric versions"
          value={references(rubric)}
        />
        <AuthorityRow
          term="Output policy versions"
          value={references(output)}
        />
        <AuthorityRow
          term="Schedule"
          value={`${text(policy?.cadence) || "not recorded"} at ${text(policy?.localTime) || "not recorded"} · ${text(policy?.timezone) || "not recorded"}`}
        />
        <AuthorityRow
          term="Transport"
          value={`${text(policy?.transport) || "not recorded"} · no silent failover`}
        />
      </dl>
      <details>
        <summary>All typed policy versions</summary>
        <ul>
          {Object.entries(categories ?? {}).map(([category, values]) => (
            <li key={category}>
              <strong>{label(category)}</strong>:{" "}
              {references(Array.isArray(values) ? (values as Reference[]) : [])}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ScopePath({
  path,
  offerId,
}: {
  path: ProfilePath;
  offerId?: string;
}) {
  return (
    <p className="scope-path" aria-label="Profile scope path">
      {path.company.name} <code>{path.company.id}</code> → {path.product.name}{" "}
      <code>{path.product.id}</code> → {path.marketPlay.name}{" "}
      <code>{path.marketPlay.id}</code> → {path.profile.name}{" "}
      <code>{path.profile.id}</code>
      {offerId ? (
        <>
          {" "}
          → Offer <code>{offerId}</code>
        </>
      ) : null}
    </p>
  );
}

function AuthorityRow({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function reference(value: unknown) {
  const row = record(value);
  if (!row) return "not recorded";
  return [text(row.id), text(row.versionId), text(row.digest)]
    .filter(Boolean)
    .join(" · ");
}
function references(values: Reference[]) {
  const rendered: string[] = [];
  for (const item of values) {
    const value = reference(item);
    if (value !== "not recorded") rendered.push(value);
  }
  return rendered.join("; ") || "not recorded";
}
function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
function label(value: string) {
  return value.replaceAll("_", " ");
}
function readinessStatus(value: string) {
  if (value === "complete") return "Complete";
  if (value === "missing") return "Needs confirmation";
  if (value === "stale") return "Stale predecessor";
  if (value === "wrong-scoped") return "Blocked by prerequisite";
  return label(value);
}
function stamp(value: number | null | undefined) {
  return Number.isFinite(value)
    ? new Date(value as number).toISOString()
    : "not recorded";
}
function offset(value: number | undefined) {
  if (!Number.isFinite(value)) return "not recorded";
  const minutes = value as number;
  return `${minutes >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}
