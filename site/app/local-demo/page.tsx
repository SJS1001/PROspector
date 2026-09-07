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

export default function LocalDemo() {
  const [demoState, setDemoState] = useState<DemoState>("checking");

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
    </main>
  );
}
