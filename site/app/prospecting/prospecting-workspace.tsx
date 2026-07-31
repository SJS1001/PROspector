"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ProfileReadiness,
  type ProfileReadinessProjection,
} from "./profile-readiness";
import { ProspectWorkspace } from "./prospect-workspace";
import { ReviewQueue } from "./review-queue";
import { prospectingUrl } from "./prospecting-transport";

export type ProspectingProjection = {
  authority?: "owner" | "blocked" | "malformed";
  profiles?: {
    id: string;
    name: string;
    lifecycle: string;
    revision?: number;
  }[];
  readiness?: ProfileReadinessProjection | null;
  runs?: Record<string, unknown>[];
  evidence?: Record<string, unknown>[];
  assessments?: Record<string, unknown>[];
  queue?: Record<string, unknown>[];
};
export type ProspectingMode = "prospects" | "review";
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
  mode = "prospects",
  initialNotice = "",
  onUnauthorized,
}: {
  projection: ProspectingProjection;
  mode?: ProspectingMode;
  initialNotice?: Notice;
  onUnauthorized?: () => void;
}) {
  const [projection, setProjection] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(initialNotice);
  const selectedProfileId = projection.readiness?.profile?.id ?? "";
  const initialProfileId = initial.readiness?.profile?.id;
  const reload = useCallback(async (profileId?: string) => {
    const response = await fetch(prospectingUrl(profileId), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 404) {
      onUnauthorized?.();
      throw Error("Private prospecting workspace unavailable.");
    }
    if (!response.ok)
      throw Error("Unable to reconcile the authoritative workspace.");
    setProjection(await response.json());
  }, [onUnauthorized]);
  const selectProfile = useCallback(
    async (profileId: string) => {
      setBusy(true);
      setNotice("");
      try {
        await reload(profileId);
        setNotice("loaded");
      } catch {
        setNotice("load_failed");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );
  const recover = useCallback(async () => {
    setBusy(true);
    try {
      await reload(selectedProfileId || undefined);
      setNotice("loaded");
    } catch {
      setNotice("load_failed");
    } finally {
      setBusy(false);
    }
  }, [reload, selectedProfileId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload(initialProfileId).catch(() =>
        setNotice("load_failed"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialProfileId, reload]);
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
        if (response.status === 404) {
          onUnauthorized?.();
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
    [onUnauthorized],
  );
  const denied =
    projection.authority === "blocked" ||
    projection.authority === "malformed";
  if (denied) {
    return (
      <section className="prospecting">
        <style>{CSS}</style>
        <h1>Prospecting unavailable</h1>
        <p role="alert">
          The private prospecting workspace is unavailable. No profile, run,
          evidence, or prospect details are shown.
        </p>
      </section>
    );
  }
  const readiness = projection.readiness ?? null;
  const profileId = readiness?.profile?.id;
  const activation = readiness?.activation;
  return (
    <section className="prospecting">
      <style>{CSS}</style>
      <h1>
        {mode === "review"
          ? "Qualified Prospect Review Queue"
          : "Profile Readiness and Prospect Workspace"}
      </h1>
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
              onClick={() => void recover()}
            >
              Load current candidate
            </button>
          )}
          {(notice === "unknown" || notice === "load_failed") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void recover()}
            >
              Check current profile configuration
            </button>
          )}
        </section>
      )}
      <ProfileSelector
        profiles={projection.profiles ?? []}
        selectedProfileId={profileId ?? ""}
        busy={busy}
        onSelect={(selected) => void selectProfile(selected)}
      />
      {mode === "review" ? (
        <>
          <ReviewQueue
            queue={
              (projection.queue ??
                []) as Parameters<typeof ReviewQueue>[0]["queue"]
            }
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
          <ProfileReadiness
            readiness={readiness}
            onCommand={command}
            onReload={() => void recover()}
            busy={busy}
          />
        </>
      ) : (
        <>
          <ProfileReadiness
            readiness={readiness}
            onCommand={command}
            onReload={() => void recover()}
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
        </>
      )}
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
    </section>
  );
}

function ProfileSelector({
  profiles,
  selectedProfileId,
  busy,
  onSelect,
}: {
  profiles: NonNullable<ProspectingProjection["profiles"]>;
  selectedProfileId: string;
  busy: boolean;
  onSelect: (profileId: string) => void;
}) {
  return (
    <section className="prospecting-panel profile-selector">
      <label htmlFor="prospecting-profile">
        <strong>Customer Profile</strong>
        <span>
          Select an owner-authorized Profile. The server reloads its exact
          authority and scope path.
        </span>
      </label>
      <select
        id="prospecting-profile"
        aria-label="Customer Profile"
        value={selectedProfileId}
        disabled={busy || profiles.length === 0}
        onChange={(event) => onSelect(event.target.value)}
      >
        {!selectedProfileId && <option value="">Select a Profile</option>}
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name} · {profile.lifecycle}
          </option>
        ))}
      </select>
      {selectedProfileId ? (
        <p>
          Selected Profile <code>{selectedProfileId}</code>
        </p>
      ) : (
        <p role="status">No Profile is selected.</p>
      )}
    </section>
  );
}

const CSS = `
.prospecting{display:grid;gap:16px;font-size:12px;line-height:1.55}
.prospecting-panel,.workspace-notice{display:grid;gap:12px;padding:24px;border:1px solid var(--line);border-radius:9px;background:var(--white)}
.prospecting button,.prospecting a,.prospecting summary,.prospecting input,.prospecting select{min-height:44px}
.prospecting button,.prospecting input,.prospecting select{font:inherit}
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
.profile-selector label{display:grid;gap:4px}
.profile-selector select{width:100%;padding:8px;border:1px solid var(--line);border-radius:5px;background:var(--white)}
.decision-actions,.rejection-confirmation,.unavailable-controls{display:flex;flex-wrap:wrap;gap:8px}
.review-queue{display:grid;grid-template-columns:1fr}
.review-queue>h2,.review-queue>p,.review-queue>section,.review-queue>a{grid-column:1/-1}
.review-queue article{min-width:0}
.destructive{color:#a84b3e}
.evidence-cards article blockquote{padding:12px;border-left:3px solid var(--line);overflow-wrap:anywhere;white-space:pre-wrap}
.evidence-cards a,.assessment-link{display:inline-flex;align-items:center;color:var(--green);font-weight:760}
.evidence-url{display:block}
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
