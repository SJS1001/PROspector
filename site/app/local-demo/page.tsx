"use client";
import { useEffect, useState } from "react";

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
  const [state, setState] = useState("Checking the disposable local interview…");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let mounted = true;
    void readInterview()
      .then(({ response, body }) => {
        if (!mounted) return;
        setState(response.ok && body?.status === "active"
          ? "Interview is ready with disposable local data."
          : response.ok
            ? "Local demo is ready to initialize."
            : "Local demo unavailable.");
      })
      .catch(() => {
        if (mounted) setState("Local demo unavailable.");
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
        setState("Local demo unavailable.");
        return;
      }
      if (body?.status === "active") {
        setState("Interview is ready with disposable local data.");
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
      setState(mutation.ok
        ? "Interview initialized with disposable local data."
        : "Bootstrap was rejected.");
    } catch {
      setState("Local demo unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="local-demo-screen" data-local-demo-visible="true">
      <section aria-labelledby="local-demo-title">
        <span>LOCAL_DEMO</span>
        <h1 id="local-demo-title">Local demo interview</h1>
        <p>Development-only, disposable, and unable to activate providers, prospecting, outreach, or external effects.</p>
        <button type="button" disabled={busy} onClick={() => void bootstrap()}>
          {busy ? "Checking local interview…" : "Initialize local interview"}
        </button>
        <p role="status">{state}</p>
      </section>
    </main>
  );
}
