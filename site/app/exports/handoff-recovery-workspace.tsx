"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ARCHIVE_PASSPHRASE_MIN_LENGTH, archiveCreationRefusalCopy, ArchiveBoundaryLeaf, DRY_RUN_PENDING_COPY, DRY_RUN_VERIFIED_COPY, DryRunEvidenceLeaf, formatTime, HANDOFF_EMPTY_COPY,
  HANDOFF_ERROR_COPY, HANDOFF_LOADING_COPY, HANDOFF_RECHECK_COPY, handoffBlockedCopy, HandoffHistoryLeaf, HandoffMetricsLeaf,
  HandoffSelectionLeaf, normalizeHandoffRecoveryProjection, PilotBanner, predicateText, RECOVERY_ERROR_COPY, RECOVERY_LOADING_COPY,
  RECOVERY_UNKNOWN_COPY, recoveryRefusalCopy, RecoveryLedgerLeaf, RecoveryReadinessLeaf, RESTORE_APPLYING_COPY,
  RESTORE_COMPLETE_COPY, RESTORE_CONFIRMATION_COPY, RESTORE_EFFECT_COPY, ScopeContext, StatusLine, ARCHIVE_CREATED_COPY,
  type HandoffHistoryEntry, type HandoffRecoveryProjection,
} from "./handoff-recovery-leaves";

/**
 * Sole Exports & History transport owner (07-09, local): CSV CRM Handoff and
 * Workspace Recovery. Commands carry only references the server projected
 * (snapshot, artifact, archive upload, dry run) plus the owner's passphrase
 * and the dry-run nonce, both held in memory for one request. The server
 * derives workspace, eligibility, target, and every predicate. Nothing here
 * schedules, enables, or runs anything, and nothing is retried: an unknown
 * outcome reloads the authoritative projection and asks the owner to review it.
 */

export const HANDOFF_RECOVERY_API = "/api/handoff-recovery";
export const HANDOFF_RECOVERY_INTENT = "handoff-recovery-mutation";

type Area = "handoff" | "recovery";
type Notice = Readonly<{ kind: "applied" | "refused" | "unknown" | "invalid"; area: Area; text: string }> | null;
type Held = Readonly<{ dryRunId: string; nonce: string }> | null;
type PassphraseRef = React.RefObject<HTMLInputElement | null>;

export type RecoveryInteraction = Readonly<{
  pending: boolean;
  pendingLabel: string | null;
  notice: Notice;
  held: Held;
  confirmingRestore: boolean;
  onCreateHandoff(snapshotDigest: string): void;
  onDownload(entry: HandoffHistoryEntry): void;
  onCreateArchive(): void;
  onRunDryRun(): void;
  onRequestRestore(): void;
  onCancelRestore(): void;
  onConfirmRestore(): void;
  onReload(): void;
}>;

const noop = () => undefined;
export const READ_ONLY_RECOVERY_INTERACTION: RecoveryInteraction = Object.freeze({
  pending: false, pendingLabel: null, notice: null, held: null, confirmingRestore: false,
  onCreateHandoff: noop, onDownload: noop, onCreateArchive: noop, onRunDryRun: noop,
  onRequestRestore: noop, onCancelRestore: noop, onConfirmRestore: noop, onReload: noop,
});

const HANDOFF_UNKNOWN_COPY = "The CSV handoff outcome could not be verified. Nothing will be retried automatically. Load the current handoff status.";

/** The pure Exports & History view. It renders a normalized projection and calls back to the transport owner. */
export function HandoffRecoveryView({ projection, interaction, passphraseRef, passphraseConfirmRef }: {
  projection: HandoffRecoveryProjection;
  interaction: RecoveryInteraction;
  /** Uncontrolled passphrase fields: the value is never rendered back or held in state. */
  passphraseRef?: PassphraseRef;
  passphraseConfirmRef?: PassphraseRef;
}) {
  const { handoff, recovery } = projection;
  const { pending } = interaction;
  const selection = handoff.selection;
  const handoffEnabled = handoff.gate.available && selection !== null && !pending;
  const handoffReason = !handoff.gate.available ? handoffBlockedCopy(handoff.gate.firstUnmetPredicate)
    : !selection ? HANDOFF_EMPTY_COPY : pending ? "Another request is pending." : HANDOFF_RECHECK_COPY;
  const archiveEnabled = recovery.gates.archive.available && !pending;
  const dryRunEnabled = recovery.gates.dryRun.available && recovery.candidate !== null && !pending;
  const heldMatches = interaction.held !== null && recovery.currentDryRun?.dryRunId === interaction.held.dryRunId;
  const restoreEnabled = recovery.gates.restore.available && heldMatches && !pending;
  const restoreReason = !recovery.gates.restore.available ? `Restore is blocked by ${predicateText(recovery.gates.restore.firstUnmetPredicate)}.`
    : !heldMatches ? "The restore nonce from a dry run in this session is required. Run a new read-only dry run first."
      : pending ? "Another request is pending." : "Available after the explicit confirmation below.";
  const applied = recovery.restores.find((item) => item.outcome === "applied");
  const notice = interaction.notice;
  const noticeFor = (area: Area) => notice && notice.area === area ? (
    <p className="exports-notice" data-kind={notice.kind} role={notice.kind === "applied" ? "status" : "alert"} aria-live={notice.kind === "applied" ? "polite" : undefined}>{notice.text}</p>
  ) : null;

  return (
    <div className="exports-surfaces">
      <PilotBanner mode={projection.mode} />
      <ScopeContext projection={projection} />

      <section className="panel exports-section" aria-labelledby="csv-handoff-title">
        <h2 id="csv-handoff-title">CSV CRM Handoff</h2>
        <p>CSV delivery only. The server creates a governed CSV artifact and manifest; nothing is sent to an external system.</p>
        {selection ? <HandoffSelectionLeaf selection={selection} /> : null}
        <HandoffMetricsLeaf selection={selection} />
        {!handoff.gate.available
          ? <div role="alert"><StatusLine family="Blocked" reason={handoffBlockedCopy(handoff.gate.firstUnmetPredicate)} checkedAt={projection.generatedAt} /></div>
          : selection ? <StatusLine family="Current" reason="Current eligibility snapshot." checkedAt={selection.evaluatedAt} reference={selection.snapshotDigest} /> : null}
        {selection ? (
          <div className="exports-confirmation">
            <h3>Frozen snapshot summary</h3>
            <p>Selection frozen {formatTime(selection.evaluatedAt)} · {selection.eligibleContactRowCount} eligible contact rows · {selection.uniqueEligibleProspectCount} distinct Prospects · schema <code>{selection.schemaVersion}</code> · configuration <code>{selection.configurationDigest}</code></p>
            <p>{HANDOFF_RECHECK_COPY}</p>
          </div>
        ) : null}
        <p className="exports-action">
          <button type="button" className="primary exports-primary" disabled={!handoffEnabled} aria-describedby="csv-handoff-reason" onClick={() => { if (selection) interaction.onCreateHandoff(selection.snapshotDigest); }}>Create CSV handoff</button>
          <span id="csv-handoff-reason">{handoffReason}</span>
        </p>
        {noticeFor("handoff")}
        <h3>Handoff history</h3>
        <HandoffHistoryLeaf history={handoff.history} renderAction={(entry) => (
          <div className="exports-row-actions">
            <button type="button" className="outline" disabled={entry.deliveryState !== "available" || pending} onClick={() => interaction.onDownload(entry)}>Download CSV handoff</button>
            {entry.deliveryState !== "available" ? <span>Delivery unavailable. Downloading never rebuilds the file.</span> : null}
            <details className="exports-technical">
              <summary>Review manifest</summary>
              <dl className="exports-kv">
                <div><dt>Manifest digest</dt><dd><code>{entry.manifestDigest}</code></dd></div>
                <div><dt>Snapshot digest</dt><dd><code>{entry.snapshotDigest || "Not recorded"}</code></dd></div>
                <div><dt>Source workspace</dt><dd><code>{entry.sourceWorkspaceId}</code></dd></div>
                <div><dt>Row order</dt><dd>Canonical, fixed columns; rows and fields cannot be reordered or edited.</dd></div>
              </dl>
            </details>
          </div>
        )} />
      </section>

      <section className="panel exports-section" aria-labelledby="workspace-recovery-title">
        <h2 id="workspace-recovery-title" tabIndex={-1}>Workspace Recovery</h2>
        <p>A recovery evidence surface for the Company Workspace Archive — not an operational restore console. Restored targets keep every schedule, runner, outbox, provider, and delivery effect disabled pending fresh upstream Phase 4 readiness activation.</p>
        <p className="exports-action">
          <button type="button" className="primary exports-primary" disabled={pending} aria-describedby="recovery-review-reason" onClick={interaction.onReload}>Review recovery evidence</button>
          <span id="recovery-review-reason">Reloads the current archive, dry-run, restore, and audit evidence. Nothing is retried.</span>
        </p>
        <ArchiveBoundaryLeaf />
        <RecoveryReadinessLeaf projection={projection} />

        <fieldset className="exports-passphrase" disabled={pending}>
          <legend>Archive passphrase</legend>
          <p>Used for this one request only. It is never stored, shown, or sent anywhere except this request.</p>
          <p id="passphrase-rule">At least {ARCHIVE_PASSPHRASE_MIN_LENGTH} characters.</p>
          <label>Passphrase <input type="password" ref={passphraseRef} autoComplete="off" spellCheck={false} minLength={ARCHIVE_PASSPHRASE_MIN_LENGTH} aria-describedby="passphrase-rule" /></label>
          <label>Confirm passphrase (archive creation only) <input type="password" ref={passphraseConfirmRef} autoComplete="off" spellCheck={false} minLength={ARCHIVE_PASSPHRASE_MIN_LENGTH} aria-describedby="passphrase-rule" /></label>
        </fieldset>

        <p className="exports-action">
          <button type="button" className="outline" disabled={!archiveEnabled} aria-describedby="archive-reason" onClick={interaction.onCreateArchive}>Create encrypted workspace archive</button>
          <span id="archive-reason">{recovery.gates.archive.available ? "Creates one encrypted archive with a safe manifest and checksum." : `Archive creation is blocked by ${predicateText(recovery.gates.archive.firstUnmetPredicate)}.`}</span>
        </p>

        <h3>Dry run evidence</h3>
        <DryRunEvidenceLeaf projection={projection} />
        <p className="exports-action">
          <button type="button" className="outline" disabled={!dryRunEnabled} aria-describedby="dry-run-reason" onClick={interaction.onRunDryRun}>Run read-only dry run</button>
          <span id="dry-run-reason">{recovery.gates.dryRun.available ? "Verifies the server-issued archive upload and the clean target without writing target data." : `The dry run is blocked by ${predicateText(recovery.gates.dryRun.firstUnmetPredicate)}.`}</span>
        </p>

        <h3>Explicit restore evidence</h3>
        {interaction.confirmingRestore && interaction.held && heldMatches ? (
          <div className="exports-confirm" role="group" aria-labelledby="restore-confirm-title">
            <h3 id="restore-confirm-title">Confirm restore</h3>
            <dl className="exports-kv">
              <div><dt>Target</dt><dd>The approved clean compatible target, workspace <code>{projection.context.workspaceId}</code></dd></div>
              <div><dt>Dry-run result</dt><dd>{DRY_RUN_VERIFIED_COPY} Reference <code>{interaction.held.dryRunId}</code></dd></div>
              <div><dt>Restore nonce</dt><dd><code>{interaction.held.nonce}</code></dd></div>
            </dl>
            <p>{RESTORE_EFFECT_COPY}</p>
            <p><strong>{RESTORE_CONFIRMATION_COPY}</strong></p>
            <p className="exports-action">
              <button type="button" className="destructive" disabled={!restoreEnabled} onClick={interaction.onConfirmRestore}>Restore verified archive</button>
              <button type="button" className="outline" disabled={pending} onClick={interaction.onCancelRestore}>Cancel</button>
            </p>
          </div>
        ) : (
          <p className="exports-action">
            <button type="button" className="outline" disabled={!restoreEnabled} aria-describedby="restore-reason" onClick={interaction.onRequestRestore}>Restore verified archive</button>
            <span id="restore-reason">{restoreReason}</span>
          </p>
        )}
        {applied ? <StatusLine family="Restored — effects disabled" reason={`${RESTORE_COMPLETE_COPY} Schedules and runners stay disabled pending fresh upstream Phase 4 readiness activation.`} checkedAt={applied.completedAt} reference={applied.restoreResultId} /> : null}
        {interaction.pendingLabel ? <p role="status" aria-live="polite">{interaction.pendingLabel}</p> : null}
        {noticeFor("recovery")}
        {notice?.kind === "unknown" ? (
          <p className="exports-action"><button type="button" className="outline" disabled={pending} onClick={interaction.onReload}>Load recovery audit</button></p>
        ) : null}

        <h3>Replay and audit ledger</h3>
        <RecoveryLedgerLeaf projection={projection} />
      </section>
    </div>
  );
}

type CommandBody = Readonly<Record<string, unknown>>;
type PostOutcome =
  | Readonly<{ kind: "answered"; status: number; command: Record<string, unknown>; projection: HandoffRecoveryProjection | null }>
  | Readonly<{ kind: "invalid"; error: string }>
  | Readonly<{ kind: "session_expired" }>
  | Readonly<{ kind: "unauthorized" }>
  | Readonly<{ kind: "unknown" }>;

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function postInit(body: CommandBody): RequestInit {
  return {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json", "x-prospector-intent": HANDOFF_RECOVERY_INTENT },
    body: JSON.stringify(body),
  };
}

async function classify(response: Response): Promise<PostOutcome> {
  if (response.status >= 500) return { kind: "unknown" };
  if (response.status === 404) return { kind: "unauthorized" };
  const json = await readJson(response);
  if (response.status === 403 && json?.error === "invalid_csrf_token") return { kind: "session_expired" };
  if ((response.status === 200 || response.status === 409) && json && typeof json.command === "object" && json.command) {
    return { kind: "answered", status: response.status, command: json.command as Record<string, unknown>, projection: normalizeHandoffRecoveryProjection(json.projection) };
  }
  if (response.status === 200 || response.status === 409) return { kind: "unknown" };
  return { kind: "invalid", error: typeof json?.error === "string" ? json.error.slice(0, 64) : "invalid_request" };
}

const reasonOf = (command: Record<string, unknown>) => Array.isArray(command.reasonCodes) && typeof command.reasonCodes[0] === "string" ? command.reasonCodes[0] : "refused";
const textOf = (value: unknown) => typeof value === "string" ? value.slice(0, 128) : "";

function answeredNotice(action: string, command: Record<string, unknown>): Notice {
  const refused = command.status === "refused";
  const reason = reasonOf(command);
  switch (action) {
    case "create_csv_handoff":
      if (refused) {
        return { kind: "refused", area: "handoff", text: reason === "snapshot_stale"
          ? "New handoff version required — the eligibility snapshot changed. Historical artifacts stay immutable. Review the current snapshot."
          : handoffBlockedCopy(reason) };
      }
      return { kind: "applied", area: "handoff", text: command.status === "replayed"
        ? `Existing deterministic handoff — checksum ${textOf(command.csvSha256)}. No fresh artifact was made.`
        : `CSV handoff created as a governed CSV artifact — checksum ${textOf(command.csvSha256)}. No contacts were sent to any external system.` };
    case "create_archive":
      return refused ? { kind: "refused", area: "recovery", text: archiveCreationRefusalCopy(reason) }
        : { kind: "applied", area: "recovery", text: `${ARCHIVE_CREATED_COPY} Manifest ${textOf(command.manifestDigest)}, delivery expiry ${formatTime(Number(command.deliveryExpiresAt))}.` };
    case "run_dry_run":
      return refused ? { kind: "refused", area: "recovery", text: recoveryRefusalCopy(reason) }
        : { kind: "applied", area: "recovery", text: DRY_RUN_VERIFIED_COPY };
    case "restore_verified_archive":
      return refused ? { kind: "refused", area: "recovery", text: recoveryRefusalCopy(reason) }
        : { kind: "applied", area: "recovery", text: command.status === "replayed" ? `This verified archive is already restored. ${RESTORE_COMPLETE_COPY}` : RESTORE_COMPLETE_COPY };
    default:
      return { kind: "refused", area: "handoff", text: `Delivery unavailable (${reason}). The file was not rebuilt.` };
  }
}

export function HandoffRecoveryWorkspace({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [projection, setProjection] = useState<HandoffRecoveryProjection | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState(true);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [held, setHeld] = useState<Held>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const passphraseRef = useRef<HTMLInputElement | null>(null);
  const passphraseConfirmRef = useRef<HTMLInputElement | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(HANDOFF_RECOVERY_API, { method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      if (response.status === 404) { onUnauthorized(); return; }
      const next = response.ok ? normalizeHandoffRecoveryProjection(await readJson(response)) : null;
      if (!next) { setProjection(null); setLoadState("error"); return; }
      setProjection(next);
      setLoadState("ready");
    } catch {
      setProjection(null);
      setLoadState("error");
    } finally {
      setPending(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  /** Reads and immediately clears the passphrase fields, so the value lives only for this request. */
  const takePassphrase = () => {
    const value = passphraseRef.current?.value ?? "";
    const confirmation = passphraseConfirmRef.current?.value ?? "";
    if (passphraseRef.current) passphraseRef.current.value = "";
    if (passphraseConfirmRef.current) passphraseConfirmRef.current.value = "";
    return { value, confirmation };
  };

  const run = useCallback(async (area: Area, body: CommandBody, label: string, onApplied?: (command: Record<string, unknown>) => void) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setPendingLabel(label);
    setNotice(null);
    let outcome: PostOutcome;
    try {
      outcome = await classify(await fetch(HANDOFF_RECOVERY_API, postInit(body)));
    } catch {
      outcome = { kind: "unknown" };
    }
    try {
      if (outcome.kind === "unauthorized") { onUnauthorized(); return; }
      if (outcome.kind === "answered") {
        if (outcome.projection) setProjection(outcome.projection);
        if (outcome.command.status !== "refused") onApplied?.(outcome.command);
        setNotice(answeredNotice(String(body.action), outcome.command));
        if (!outcome.projection) await load();
        return;
      }
      if (outcome.kind === "invalid") { setNotice({ kind: "invalid", area, text: `The request was not accepted (${outcome.error}). Nothing was changed.` }); return; }
      // An expired token or an unknown outcome reloads the authoritative projection; nothing is resubmitted.
      await load();
      setNotice(outcome.kind === "session_expired"
        ? { kind: "refused", area, text: "The request token expired. Nothing was changed. Review the current status and submit again." }
        : { kind: "unknown", area, text: area === "recovery" ? RECOVERY_UNKNOWN_COPY : HANDOFF_UNKNOWN_COPY });
    } finally {
      busy.current = false;
      setPending(false);
      setPendingLabel(null);
    }
  }, [load, onUnauthorized]);

  const download = useCallback(async (entry: HandoffHistoryEntry) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setNotice(null);
    try {
      let response: Response;
      try {
        response = await fetch(HANDOFF_RECOVERY_API, postInit({ action: "download_csv_handoff", artifactId: entry.artifactId }));
      } catch {
        await load();
        setNotice({ kind: "unknown", area: "handoff", text: HANDOFF_UNKNOWN_COPY });
        return;
      }
      if (response.status === 200 && (response.headers.get("content-type") ?? "").startsWith("text/csv")) {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.download = `crm-handoff-v${entry.version}.csv`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setNotice({ kind: "applied", area: "handoff", text: `Downloaded the stored CSV handoff bytes — checksum ${response.headers.get("x-content-sha256") ?? entry.csvSha256}.` });
        return;
      }
      const outcome = await classify(response);
      if (outcome.kind === "unauthorized") { onUnauthorized(); return; }
      if (outcome.kind === "answered") {
        if (outcome.projection) setProjection(outcome.projection);
        setNotice(answeredNotice("download_csv_handoff", outcome.command));
        return;
      }
      await load();
      setNotice({ kind: "unknown", area: "handoff", text: HANDOFF_UNKNOWN_COPY });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [load, onUnauthorized]);

  const reload = useCallback(() => {
    if (busy.current) return;
    setPending(true);
    setNotice(null);
    void load().then(() => { document.getElementById("workspace-recovery-title")?.focus(); });
  }, [load]);

  const interaction: RecoveryInteraction = {
    pending, pendingLabel, notice, held, confirmingRestore,
    onCreateHandoff: (snapshotDigest) => { void run("handoff", { action: "create_csv_handoff", snapshotDigest }, "Requesting the CSV handoff…"); },
    onDownload: (entry) => { void download(entry); },
    onCreateArchive: () => {
      const { value, confirmation } = takePassphrase();
      if (!value || value !== confirmation) {
        setNotice({ kind: "invalid", area: "recovery", text: value ? "The passphrases do not match. No archive was created." : "Enter and confirm the archive passphrase. No archive was created." });
        return;
      }
      if (value.length < ARCHIVE_PASSPHRASE_MIN_LENGTH) {
        setNotice({ kind: "invalid", area: "recovery", text: `The archive passphrase must be at least ${ARCHIVE_PASSPHRASE_MIN_LENGTH} characters. No archive was created.` });
        return;
      }
      void run("recovery", { action: "create_archive", passphrase: value }, "Creating the encrypted workspace archive…");
    },
    onRunDryRun: () => {
      const { value } = takePassphrase();
      const archiveRef = projection?.recovery.candidate?.archiveRef;
      if (!value || !archiveRef) { setNotice({ kind: "invalid", area: "recovery", text: "Enter the archive passphrase. No dry run was started." }); return; }
      if (value.length < ARCHIVE_PASSPHRASE_MIN_LENGTH) { setNotice({ kind: "invalid", area: "recovery", text: `The archive passphrase is at least ${ARCHIVE_PASSPHRASE_MIN_LENGTH} characters. No dry run was started.` }); return; }
      setHeld(null);
      setConfirmingRestore(false);
      void run("recovery", { action: "run_dry_run", archiveRef, passphrase: value }, DRY_RUN_PENDING_COPY, (command) => {
        if (typeof command.dryRunId === "string" && typeof command.nonce === "string") setHeld({ dryRunId: command.dryRunId, nonce: command.nonce });
      });
    },
    onRequestRestore: () => setConfirmingRestore(true),
    onCancelRestore: () => setConfirmingRestore(false),
    onConfirmRestore: () => {
      const { value } = takePassphrase();
      const archiveRef = projection?.recovery.candidate?.archiveRef;
      if (!value || !archiveRef || !held) { setNotice({ kind: "invalid", area: "recovery", text: "Enter the archive passphrase. Nothing was restored." }); return; }
      if (value.length < ARCHIVE_PASSPHRASE_MIN_LENGTH) { setNotice({ kind: "invalid", area: "recovery", text: `The archive passphrase is at least ${ARCHIVE_PASSPHRASE_MIN_LENGTH} characters. Nothing was restored.` }); return; }
      const body = { action: "restore_verified_archive", archiveRef, dryRunId: held.dryRunId, nonce: held.nonce, passphrase: value, confirmed: true };
      // The nonce is single use whatever the answer: a new restore needs a new dry run.
      setHeld(null);
      setConfirmingRestore(false);
      void run("recovery", body, RESTORE_APPLYING_COPY);
    },
    onReload: reload,
  };

  return (
    <section className="exports-workspace" aria-labelledby="exports-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">OWNER EVIDENCE — CSV DELIVERY AND RECOVERY</span>
          <h1 id="exports-title">Handoff &amp; Recovery</h1>
          <p>CSV CRM Handoff and Workspace Recovery for this owner workspace. Schedules stay owned by Phase 4; this surface cannot change them.</p>
        </div>
      </header>
      {loadState === "loading" && !projection ? (
        <section className="panel exports-section" role="status">
          <p>{HANDOFF_LOADING_COPY}</p>
          <p>{RECOVERY_LOADING_COPY}</p>
        </section>
      ) : null}
      {loadState === "error" ? (
        <section className="panel exports-section" role="alert">
          <p>{HANDOFF_ERROR_COPY}</p>
          <p className="exports-action"><button type="button" className="outline" disabled={pending} onClick={reload}>Retry handoff status</button></p>
          <p>{RECOVERY_ERROR_COPY}</p>
          <p className="exports-action"><button type="button" className="outline" disabled={pending} onClick={reload}>Retry recovery status</button></p>
        </section>
      ) : null}
      {projection && loadState === "ready" ? <HandoffRecoveryView projection={projection} interaction={interaction} passphraseRef={passphraseRef} passphraseConfirmRef={passphraseConfirmRef} /> : null}
    </section>
  );
}
