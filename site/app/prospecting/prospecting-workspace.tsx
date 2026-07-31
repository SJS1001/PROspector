"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ProfileReadiness,
  type ProfileReadinessProjection,
} from "./profile-readiness";
import { ProspectWorkspace } from "./prospect-workspace";
import { ReviewQueue } from "./review-queue";

type Projection = {
  authority?: "owner" | "blocked" | "malformed";
  readiness?: ProfileReadinessProjection | null;
  runs?: Record<string, unknown>[];
  evidence?: Record<string, unknown>[];
  assessments?: Record<string, unknown>[];
  queue?: Record<string, unknown>[];
};
type Notice = "stale" | "unknown" | "loaded" | "load_failed" | "";
const PROSPECTING_NOTICES = Object.freeze({
  stale:
    "This candidate changed in another tab. Your action was not applied.",
  unknown:
    "The outcome could not be verified. Nothing will be retried automatically. Check the current profile configuration.",
  loaded: "The server-confirmed authority is shown below.",
  load_failed:
    "Unable to load the authoritative workspace. No action was applied.",
});

export function ProspectingWorkspace({
  projection: initial,
  initialNotice = "",
}: {
  projection: Projection;
  initialNotice?: Notice;
}) {
  const [projection, setProjection] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(initialNotice);
  const reload = useCallback(async () => {
    const response = await fetch("/api/prospecting", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok)
      throw Error("Unable to reconcile the authoritative workspace.");
    setProjection(await response.json());
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload().catch(() => setNotice("load_failed"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  const command = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice("");
      try {
        const response = await fetch("/api/prospecting", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-prospector-intent": "prospecting-mutation",
          },
          body: JSON.stringify({
            ...body,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        if (response.status === 409) {
          setNotice("stale");
          return;
        }
        if (!response.ok) throw Error();
        setProjection(await response.json());
        setNotice("loaded");
      } catch {
        setNotice("unknown");
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  const denied =
    projection.authority === "blocked" ||
    projection.authority === "malformed";
  if (denied) {
    return (
      <main className="prospecting">
        <style>{CSS}</style>
        <h1>Prospecting unavailable</h1>
        <p role="alert">
          The private prospecting workspace is unavailable. No profile, run,
          evidence, or prospect details are shown.
        </p>
      </main>
    );
  }
  const readiness = projection.readiness ?? null;
  const profileId = readiness?.profile?.id;
  const activation = readiness?.activation;
  return (
    <main className="prospecting">
      <style>{CSS}</style>
      <h1>Profile Readiness and Prospect Workspace</h1>
      {notice && (
        <section
          className="workspace-notice"
          aria-live="polite"
          role={notice === "stale" || notice === "unknown" ? "alert" : "status"}
        >
          <p>{PROSPECTING_NOTICES[notice]}</p>
          {notice === "stale" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void reload()
                  .then(() => setNotice("loaded"))
                  .catch(() => setNotice("load_failed"))
              }
            >
              Load current candidate
            </button>
          )}
          {(notice === "unknown" || notice === "load_failed") && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void reload()
                  .then(() => setNotice("loaded"))
                  .catch(() => setNotice("load_failed"))
              }
            >
              Check current profile configuration
            </button>
          )}
        </section>
      )}
      <ProfileReadiness
        readiness={readiness}
        onCommand={command}
        busy={busy}
      />
      <ProspectWorkspace
        profileId={profileId}
        activation={activation}
        runs={
          (projection.runs ??
            []) as Parameters<typeof ProspectWorkspace>[0]["runs"]
        }
        evidence={
          (projection.evidence ??
            []) as Parameters<typeof ProspectWorkspace>[0]["evidence"]
        }
        assessments={
          (projection.assessments ??
            []) as Parameters<typeof ProspectWorkspace>[0]["assessments"]
        }
        onCommand={command}
        busy={busy}
      />
      <ReviewQueue
        queue={
          (projection.queue ??
            []) as Parameters<typeof ReviewQueue>[0]["queue"]
        }
        onCommand={command}
        busy={busy}
      />
      <section className="prospecting-panel unavailable-controls">
        <h2>Later-phase controls</h2>
        <p>
          Profile readiness and prospect approval grant no contact, spend,
          export, package, message, or call authority.
        </p>
        {[
          "Enrich contact",
          "Buy credits",
          "Export CRM",
          "Approve package",
          "Send email",
          "Call prospect",
        ].map((control) => (
          <button key={control} type="button" disabled>
            {control} disabled
          </button>
        ))}
      </section>
    </main>
  );
}

const CSS = `
.prospecting{display:grid;gap:16px;font-size:12px;line-height:1.55}
.prospecting-panel,.workspace-notice{display:grid;gap:12px;padding:24px;border:1px solid var(--line);border-radius:9px;background:var(--white)}
.prospecting button,.prospecting a,.prospecting summary,.prospecting input{min-height:44px}
.prospecting button,.prospecting input{font:inherit}
.prospecting :focus-visible{outline:2px solid var(--lime);outline-offset:2px}
.prospecting h2,.prospecting h3,.prospecting h4,.prospecting p,.prospecting blockquote,.prospecting dl,.prospecting dd{margin:0}
.scope-path{overflow-wrap:anywhere}
.readiness ol,.run-ledger,.evidence-cards,.frozen-authority ul{display:grid;gap:8px;padding:0;list-style:none}
.readiness li,.authority-card,.active-configuration,.manual-run-confirmation,.run-ledger>li,.evidence-cards article,.assessment,.review-queue article,.frozen-authority{display:grid;gap:8px;padding:16px;border:1px solid var(--line);border-radius:7px}
.readiness li span,.run-ledger header,.evidence-cards header,.assessment header,.review-queue article>header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
.readiness li span{color:var(--teal);font-weight:760}
.prospecting code,.prospecting small{overflow-wrap:anywhere;font-family:var(--font-geist-mono)}
.prospecting dl{display:grid;grid-template-columns:minmax(128px,.35fr) minmax(0,1fr);gap:4px 12px}
.prospecting dt{font-weight:760}
.prospecting dd{overflow-wrap:anywhere}
.frozen-authority dt,.candidate-review h4{text-transform:none}
.manual-run-confirmation label,.review-queue label{display:grid;gap:6px}
.manual-run-confirmation label{grid-template-columns:auto 1fr;align-items:center}
.manual-run-confirmation input[type=checkbox]{min-width:44px}
.review-queue input{width:100%;padding:8px;border:1px solid var(--line);border-radius:5px}
.decision-actions,.rejection-confirmation,.unavailable-controls{display:flex;flex-wrap:wrap;gap:8px}
.review-queue{display:grid;grid-template-columns:1fr}
.review-queue>h2,.review-queue>p,.review-queue>section,.review-queue>a{grid-column:1/-1}
.review-queue article{min-width:0}
.destructive{color:#a84b3e}
.evidence-cards article blockquote{padding:12px;border-left:3px solid var(--line);overflow-wrap:anywhere;white-space:pre-wrap}
.evidence-cards a,.assessment-link{display:inline-flex;align-items:center;color:var(--green);font-weight:760}
.external-warning{font-size:10px}
.outcome-disqualified>header strong{color:#a84b3e}
.outcome-insufficientevidence>header strong{color:#7b5b00}
.outcome-passed>header strong{color:var(--green)}
.prospecting details[open]{display:grid;gap:8px}
.prospecting pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:760px){
 .prospecting-panel,.workspace-notice{padding:16px}
 .prospecting button,.prospecting a,.decision-actions>*{width:100%}
 .evidence-cards article,.readiness li,.prospecting dl{grid-template-columns:1fr}
 .prospecting dd{margin-bottom:8px}
 .manual-run-confirmation label{grid-template-columns:44px 1fr}
}
`;
