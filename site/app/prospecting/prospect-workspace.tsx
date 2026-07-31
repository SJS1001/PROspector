import React, { useMemo, useState } from "react";
import type { ProfileReadinessProjection } from "./profile-readiness";

type Evidence = {
  id: string;
  signal_kind?: string;
  material?: number | boolean;
  source_id?: string | null;
  source_url: string;
  source_tier: number;
  publisher_identity: string;
  underlying_origin_identity: string;
  independence_group: string;
  retrieved_at: number;
  published_at?: number;
  occurred_at?: number;
  excerpt: string;
  lineage_digest?: string;
  run_id: string;
  submission_id: string;
  configuration_digest?: string;
  signal_json?: string;
  canonicalMaterialLineage?: Record<string, unknown>[];
};
type Run = {
  id: string;
  configuration_id?: string;
  configuration_digest?: string;
  trigger_kind?: string;
  trigger_key?: string;
  execution_state?: string;
  window_lower_exclusive?: number | null;
  window_upper_inclusive?: number;
  successful_watermark?: number | null;
  schedule_id?: string | null;
  schedule_key?: string | null;
  timezone?: string | null;
  intended_local_time?: string | null;
  utc_offset_minutes?: number | null;
  assignment_id?: string | null;
  assignment_status?: string | null;
  instruction_version?: string | null;
  tool_configuration_digest?: string | null;
  provider?: string;
  model?: string;
  allowedTools?: unknown[];
  quotas?: Record<string, unknown>;
  expires_at?: number | null;
  attempt?: number | null;
  terminalReason?: string | null;
  terminalRetryable?: boolean | null;
};
type Assessment = {
  id: string;
  candidate_id?: string;
  configuration_digest?: string;
  anchor_json?: string;
  evidence_json?: string;
  gate_json?: string;
  score_json?: string;
  score?: number;
  outcome?: string;
  tie_order?: string;
  assessment_digest?: string;
  created_at?: number;
};
type Activation = NonNullable<ProfileReadinessProjection["activation"]>;
const NON_DISQUALIFIER_GATES = new Set([
  "immutable_configuration",
  "trusted_identity_fields",
  "required_evidence",
  "independent_qualifying_sources",
  "pain_and_timing",
]);

export function ProspectWorkspace({
  profileId,
  activation,
  runs,
  evidence,
  assessments,
  onCommand,
  busy,
}: {
  profileId?: string;
  activation?: Activation | null;
  runs: Run[];
  evidence: Evidence[];
  assessments: Assessment[];
  onCommand: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const activeRun = runs[0];
  const orderedEvidence = useMemo(
    () =>
      [...evidence].sort(
        (left, right) =>
          Number(right.retrieved_at) - Number(left.retrieved_at) ||
          left.id.localeCompare(right.id),
      ),
    [evidence],
  );
  return (
    <section
      className="prospecting-panel prospect-workspace"
      aria-labelledby="prospect-workspace"
    >
      <h2 id="prospect-workspace">Prospect Workspace</h2>
      {activation ? (
        <ActiveAuthority activation={activation} currentRun={activeRun} />
      ) : (
        <p role="status">
          Find Prospects is unavailable until an active Profile Effective
          Configuration is projected by the server.
        </p>
      )}
      {activation && (
        <fieldset className="manual-run-confirmation">
          <legend>Manual run confirmation</legend>
          <p>
            Confirm this exact server-projected scope before queuing a manual
            run. No browser-supplied provider, model, tool, credential, or URL
            will be accepted.
          </p>
          <p>
            Source window: {stamp(activeRun?.window_lower_exclusive)} exclusive
            to {stamp(activeRun?.window_upper_inclusive)} inclusive · quota{" "}
            {quota(activeRun?.quotas)}.
          </p>
          <label>
            <input
              type="checkbox"
              checked={manualConfirmed}
              disabled={busy}
              onChange={(event) => setManualConfirmed(event.target.checked)}
            />{" "}
            I confirm this scoped source window and quota.
          </label>
          <button
            className="primary"
            type="button"
            disabled={busy || !profileId || !manualConfirmed}
            onClick={() => {
              if (!profileId || !manualConfirmed) return;
              onCommand({ action: "manual_find", profileId });
              setManualConfirmed(false);
            }}
          >
            Find Prospects
          </button>
        </fieldset>
      )}
      <h3>Run ledger</h3>
      {runs.length ? (
        <ol className="run-ledger">
          {runs.map((run) => (
            <li key={run.id}>
              <header>
                <strong>{label(run.trigger_kind)}</strong>
                <span>{label(run.execution_state)}</span>
              </header>
              <dl>
                <Row term="Run" value={run.id} />
                <Row
                  term="Configuration"
                  value={`${value(run.configuration_id)} · ${value(run.configuration_digest)}`}
                />
                <Row
                  term="Slot / timezone"
                  value={`${value(run.trigger_key)} · ${value(run.schedule_key)} · ${value(run.intended_local_time)} ${value(run.timezone)} · UTC ${offset(run.utc_offset_minutes)}`}
                />
                <Row
                  term="Source window"
                  value={`${stamp(run.window_lower_exclusive)} exclusive → ${stamp(run.window_upper_inclusive)} inclusive`}
                />
                <Row
                  term="Watermark"
                  value={stamp(run.successful_watermark)}
                />
                <Row
                  term="Assignment"
                  value={`${value(run.assignment_id)} · ${value(run.assignment_status)} · expires ${stamp(run.expires_at)}`}
                />
                <Row
                  term="Provider / model"
                  value={`${value(run.provider)} / ${value(run.model)}`}
                />
                <Row
                  term="Instruction / tools"
                  value={`${value(run.instruction_version)} · ${value(run.tool_configuration_digest)} · ${list(run.allowedTools)}`}
                />
                <Row term="Quotas" value={quota(run.quotas)} />
                <Row
                  term="Attempt / terminal reason"
                  value={`${run.attempt ?? "not recorded"} · ${value(run.terminalReason)}${run.terminalRetryable === true ? " · retryable only by a new explicit assignment" : ""}`}
                />
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <p>No permitted prospecting runs are recorded.</p>
      )}
      <h3>Validated evidence</h3>
      {orderedEvidence.length ? (
        <div className="evidence-cards">
          {orderedEvidence.map((item) => (
            <article key={item.id}>
              <header>
                <strong>Tier {item.source_tier}</strong>
                <span>{recency(item.signal_json)}</span>
              </header>
              <h4>{item.publisher_identity || "Untitled source"}</h4>
              <p>
                Domain {domain(item.source_url)} · underlying origin{" "}
                {item.underlying_origin_identity} · independence{" "}
                {item.independence_group}
              </p>
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open source externally: ${item.publisher_identity || domain(item.source_url)}`}
              >
                Open source externally
              </a>
              <p className="external-warning">
                External link — verify the destination before leaving the
                private workspace.
              </p>
              <blockquote>{item.excerpt}</blockquote>
              <dl>
                <Row
                  term="Publication / event"
                  value={stamp(item.published_at ?? item.occurred_at)}
                />
                <Row term="Retrieved" value={stamp(item.retrieved_at)} />
                <Row
                  term="Lineage"
                  value={`signal ${item.id} · run ${item.run_id} · submission ${item.submission_id} · configuration ${value(item.configuration_digest)} · digest ${value(item.lineage_digest)}`}
                />
              </dl>
              {item.canonicalMaterialLineage?.length ? (
                <details>
                  <summary>Canonical material lineage</summary>
                  <ul>
                    {item.canonicalMaterialLineage.map((member) => (
                      <li
                        key={`${String(member.signalId)}-${String(member.lineageDigest)}`}
                      >
                        {String(member.signalId)} ·{" "}
                        {String(member.lineageDigest)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <>
          <p>No evidence submitted yet</p>
          <p>
            Evidence appears only after a bounded runner assignment or
            permitted run records validated observations.
          </p>
        </>
      )}
      <h3>Application-calculated qualification</h3>
      {assessments.map((item) => (
        <AssessmentPanel item={item} key={item.id} />
      ))}
      {!assessments.length && runs.some((run) => run.execution_state === "succeeded") ? (
        <>
          <p>No prospects found in this run</p>
          <p>
            The scoped source window completed without a qualifying candidate.
            Review the run ledger and evidence before starting another
            permitted run.
          </p>
          <a href="#prospect-workspace">Review run ledger</a>
        </>
      ) : null}
    </section>
  );
}

function ActiveAuthority({
  activation,
  currentRun,
}: {
  activation: Activation;
  currentRun?: Run;
}) {
  const path = activation.profilePath;
  return (
    <section className="active-configuration" aria-label="Current authority">
      <h3>Active configuration</h3>
      {path ? (
        <p className="scope-path">
          {path.company.name} → {path.product.name} → {path.marketPlay.name} →{" "}
          {path.profile.name}
        </p>
      ) : null}
      <code>
        {activation.configuration.id} · {activation.configuration.digest}
      </code>
      <p>
        {activation.schedule.cadence} at{" "}
        {activation.schedule.localTime ?? "time not recorded"}{" "}
        {activation.schedule.timezone} · schedule{" "}
        {activation.schedule.executionState}
      </p>
      <p>
        Current run {currentRun?.id ?? activation.initialRun.id} ·{" "}
        {label(currentRun?.execution_state ?? activation.initialRun.executionState)}
      </p>
      <p>
        Last successful watermark{" "}
        {stamp(
          activation.schedule.lastSuccessfulWatermark ??
            activation.initialRun.successfulWatermark,
        )}
      </p>
    </section>
  );
}

function AssessmentPanel({ item }: { item: Assessment }) {
  const anchors = parse(item.anchor_json);
  const gates = array(item.gate_json);
  const score = parse(item.score_json);
  const missing = Array.isArray(score.missingFields)
    ? score.missingFields.map(String)
    : [];
  return (
    <article
      className={`assessment outcome-${String(item.outcome).toLowerCase()}`}
      id={`assessment-${item.id}`}
      tabIndex={-1}
    >
      <header>
        <strong>{outcome(item.outcome)}</strong>
        <span>
          score {item.score ?? "not recorded"} / threshold 7
        </span>
      </header>
      <p>
        Candidate {value(item.candidate_id)} · configuration{" "}
        {value(item.configuration_digest)}
      </p>
      <dl>
        {Object.entries(anchors).map(([dimension, assigned]) => (
          <Row
            key={dimension}
            term={label(dimension)}
            value={`${String(assigned)} of 2`}
          />
        ))}
        <Row
          term="Pain / timing gate"
          value={gate(gates, "pain_and_timing")}
        />
        <Row
          term="Source independence gate"
          value={gate(gates, "independent_qualifying_sources")}
        />
        <Row
          term="Missing fields"
          value={missing.join(", ") || "none"}
        />
        <Row
          term="Hard disqualifiers"
          value={failedHardDisqualifiers(gates)}
        />
        <Row term="Tie-order inputs" value={value(item.tie_order)} />
        <Row term="Assessment digest" value={value(item.assessment_digest)} />
      </dl>
      <details>
        <summary>Immutable assessment evidence and all gates</summary>
        <ul>
          {gates.map((entry) => (
            <li
              key={`${String(entry.gate)}-${String(entry.detail)}-${String(entry.passed)}`}
            >
              {String(entry.gate)} — {entry.passed ? "passed" : "failed"} ·{" "}
              {String(entry.detail)}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}
function parse(raw?: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
function array(raw?: string): Record<string, unknown>[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
        )
      : [];
  } catch {
    return [];
  }
}
function gate(rows: Record<string, unknown>[], name: string) {
  const row = rows.find((entry) => entry.gate === name);
  return row ? `${row.passed ? "Passed" : "Failed"} · ${String(row.detail)}` : "not recorded";
}
function failedHardDisqualifiers(rows: Record<string, unknown>[]) {
  const failed: string[] = [];
  for (const entry of rows) {
    if (
      typeof entry.gate === "string" &&
      !NON_DISQUALIFIER_GATES.has(entry.gate) &&
      entry.passed === false
    ) {
      failed.push(entry.gate);
    }
  }
  return failed.join(", ") || "none";
}
function recency(raw?: string) {
  try {
    return JSON.parse(raw ?? "{}").recency ===
      "account_context_reconfirmation_required"
      ? "Account Context — reconfirmation required"
      : "Current evidence";
  } catch {
    return "Recency unavailable";
  }
}
function domain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid source";
  }
}
function outcome(value?: string) {
  if (value === "Passed") return "Qualified";
  if (value === "NotQualified") return "Below threshold";
  if (value === "InsufficientEvidence") return "More evidence required";
  if (value === "Disqualified") return "Hard disqualifier";
  return "Assessment unavailable";
}
function quota(value?: Record<string, unknown>) {
  if (!value || !Object.keys(value).length) return "not assigned";
  return Object.entries(value)
    .map(([name, amount]) => `${label(name)} ${String(amount)}`)
    .join(" · ");
}
function list(value?: unknown[]) {
  return value?.map(String).join(", ") || "no tools";
}
function label(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "not recorded";
}
function value(input: unknown) {
  return input === null || input === undefined || input === ""
    ? "not recorded"
    : String(input);
}
function stamp(input: number | null | undefined) {
  return Number.isFinite(input)
    ? new Date(input as number).toISOString()
    : "not recorded";
}
function offset(input: number | null | undefined) {
  if (!Number.isFinite(input)) return "not recorded";
  const minutes = input as number;
  return `${minutes >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}
