"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type DemoState = "checking" | "uninitialized" | "active" | "unavailable" | "rejected";

const statusCopy: Record<DemoState, string> = {
  checking: "Checking the disposable local interview…",
  uninitialized: "Local demo is ready to initialize.",
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

export default function LocalDemo() {
  const [demoState, setDemoState] = useState<DemoState>("checking");
  const [busy, setBusy] = useState(true);

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
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function bootstrap() {
    setBusy(true);
    try {
      const { response, body } = await readInterview();
      if (!response.ok) {
        setDemoState("unavailable");
        return;
      }
      if (body?.status === "active") {
        setDemoState("active");
        return;
      }
      const mutation = await fetch("/api/interview", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-prospector-intent": "interview-mutation",
        },
        body: JSON.stringify({ action: "bootstrap" }),
      });
      setDemoState(mutation.ok ? "active" : "rejected");
    } catch {
      setDemoState("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="local-demo-screen" data-local-demo-visible="true" data-demo-state={demoState}>
      <section aria-labelledby="local-demo-title">
        <span>LOCAL_DEMO</span>
        <h1 id="local-demo-title">Local demo interview</h1>
        <p>Development-only, disposable, and unable to activate providers, prospecting, outreach, or external effects.</p>
        <ol className="local-demo-steps" aria-label="Local demo setup steps">
          <li className={demoState === "active" ? "complete" : "current"}>
            <b>Initialize disposable interview</b>
            <small>Creates local-only working data.</small>
          </li>
          <li className={demoState === "active" ? "current" : "pending"}>
            <b>Open owner workspace</b>
            <small>Review the product using the disposable interview.</small>
          </li>
        </ol>
        <div className="local-demo-actions">
          {demoState === "active" ? (
            <Link className="local-demo-primary" href="/">Open owner workspace <span aria-hidden="true">→</span></Link>
          ) : (
            <button type="button" disabled={busy} onClick={() => void bootstrap()}>
              {busy ? "Checking local interview…" : demoState === "uninitialized" ? "Initialize local interview" : "Retry local setup"}
            </button>
          )}
        </div>
        <p className="local-demo-status" role="status" aria-live="polite">{statusCopy[demoState]}</p>
      </section>
    </main>
  );
}
