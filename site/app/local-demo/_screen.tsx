"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type DemoState = "checking" | "uninitialized" | "active" | "unavailable" | "rejected";

const statusCopy: Record<DemoState, string> = {
  checking: "Checking the disposable local interview…",
  uninitialized: "Local demo is ready for your company setup.",
  active: "Interview is ready with disposable local data.",
  unavailable: "Local demo unavailable. Check that the local development server is running, then retry.",
  rejected: "Initialization was rejected. Refresh the local server and retry.",
};

async function readInterview() {
  const response = await fetch("/api/interview", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = response.ok
    ? await response.json() as { status?: string }
    : null;
  return { response, body };
}

type CrmPreviewState = "idle" | "loading" | "ready" | "unavailable";
type CrmPreviewResult = {
  admittedRowCount: number;
  refusedCount: number;
  schemaVersion: string;
  encoding: string;
  byteLength: number;
  sha256: string;
  text: string;
};

function normalizeCrmPreview(value: unknown): CrmPreviewResult | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.kind !== "crm_handoff_local_demo_preview" || body.fictional !== true) return null;
  if (body.exportAuthorized !== false || body.deliveryAuthorized !== false || body.downloadAuthorized !== false || body.persistenceAuthorized !== false || body.providerInvocationAuthorized !== false) return null;
  const decision = body.decision;
  const preview = body.preview;
  if (!decision || typeof decision !== "object" || !preview || typeof preview !== "object") return null;
  const d = decision as Record<string, unknown>;
  const p = preview as Record<string, unknown>;
  if (p.previewRowsAreFictionalAndUnadmitted !== true) return null;
  if (
    typeof d.admittedRowCount !== "number" ||
    typeof d.refusedCount !== "number" ||
    typeof p.schemaVersion !== "string" ||
    typeof p.encoding !== "string" ||
    typeof p.byteLength !== "number" ||
    typeof p.sha256 !== "string" ||
    typeof p.text !== "string"
  ) return null;
  return {
    admittedRowCount: d.admittedRowCount,
    refusedCount: d.refusedCount,
    schemaVersion: p.schemaVersion,
    encoding: p.encoding,
    byteLength: p.byteLength,
    sha256: p.sha256,
    text: p.text,
  };
}

export function LocalDemoScreen() {
  const [demoState, setDemoState] = useState<DemoState>("checking");
  const [crmPreviewState, setCrmPreviewState] = useState<CrmPreviewState>("idle");
  const [crmPreview, setCrmPreview] = useState<CrmPreviewResult | null>(null);

  async function runCrmHandoffPreview() {
    setCrmPreviewState("loading");
    setCrmPreview(null);
    try {
      const response = await fetch("/api/local-demo/crm-handoff-preview", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setCrmPreviewState("unavailable");
        return;
      }
      const normalized = normalizeCrmPreview(await response.json());
      if (!normalized) {
        setCrmPreviewState("unavailable");
        return;
      }
      setCrmPreview(normalized);
      setCrmPreviewState("ready");
    } catch {
      setCrmPreviewState("unavailable");
    }
  }

  useEffect(() => {
    let mounted = true;
    void readInterview()
      .then(({ response, body }) => {
        if (!mounted) return;
        setDemoState(response.ok && body?.status === "active"
          ? "active"
          : response.ok
            ? "uninitialized"
            : "unavailable");
      })
      .catch(() => {
        if (mounted) setDemoState("unavailable");
      })
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="local-demo-screen" data-local-demo-visible="true" data-demo-state={demoState}>
      <section aria-labelledby="local-demo-title">
        <span>LOCAL_DEMO</span>
        <h1 id="local-demo-title">Local demo interview</h1>
        <p>Development-only, disposable, and unable to activate providers, prospecting, outreach, or external effects.</p>
        <ol className="local-demo-steps" aria-label="Local demo setup steps">
          <li className={demoState === "active" ? "complete" : "current"}>
            <b>Enter your Company and first Product</b>
            <small>Creates only the private commercial model you provide.</small>
          </li>
          <li className={demoState === "active" ? "current" : "pending"}>
            <b>Open Consensus Knowledge</b>
            <small>Continue with the disposable interview in the owner workspace.</small>
          </li>
        </ol>
        <div className="local-demo-actions">
          {demoState === "active" ? (
            <Link className="local-demo-primary" href="/?view=knowledge">Open Consensus Knowledge <span aria-hidden="true">→</span></Link>
          ) : (
            <Link className="local-demo-primary" href="/?view=knowledge">Start company setup <span aria-hidden="true">→</span></Link>
          )}
        </div>
        <p className="local-demo-status" role="status" aria-live="polite">{statusCopy[demoState]}</p>
      </section>

      <section aria-labelledby="crm-handoff-preview-title" className="local-demo-crm-preview">
        <span>FICTIONAL · NOT APPROVED FOR EXPORT</span>
        <h2 id="crm-handoff-preview-title">CRM handoff CSV preview</h2>
        <p>
          Shows the CSV byte policy applied to two made-up demo rows only. This
          is not a real export: every row here is refused by the actual
          eligibility check, nothing is written to disk, downloaded, or sent
          anywhere, and no real prospect or contact data is read.
        </p>
        <p>
          <button
            type="button"
            disabled={crmPreviewState === "loading"}
            onClick={() => void runCrmHandoffPreview()}
          >
            {crmPreviewState === "loading" ? "Building fictional preview…" : "Preview fictional CSV rows"}
          </button>
        </p>
        {crmPreviewState === "unavailable" ? (
          <p role="alert">
            Preview unavailable. This demo-only trigger needs the local
            development server, the disposable local-demo identity, and the
            CRM handoff preview route; retry once all three are ready.
          </p>
        ) : null}
        {crmPreviewState === "ready" && crmPreview ? (
          <div role="status" aria-live="polite">
            <p>
              <strong>Fictional and unapproved.</strong> {crmPreview.admittedRowCount} of{" "}
              {crmPreview.admittedRowCount + crmPreview.refusedCount} demo rows would be
              admitted for a real export; {crmPreview.refusedCount} are refused by the
              live eligibility check. This preview cannot change that.
            </p>
            <details>
              <summary>Byte policy details</summary>
              <dl>
                <dt>Schema version</dt>
                <dd>{crmPreview.schemaVersion}</dd>
                <dt>Encoding</dt>
                <dd>{crmPreview.encoding}</dd>
                <dt>Byte length</dt>
                <dd>{crmPreview.byteLength}</dd>
                <dt>SHA-256</dt>
                <dd style={{ overflowWrap: "anywhere" }}>{crmPreview.sha256}</dd>
              </dl>
            </details>
            <pre className="local-demo-crm-preview-bytes" aria-label="Fictional CSV preview bytes">
              <code>{crmPreview.text}</code>
            </pre>
          </div>
        ) : null}
      </section>
    </main>
  );
}
