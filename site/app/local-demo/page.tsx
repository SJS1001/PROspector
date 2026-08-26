"use client";
import { useState } from "react";

export default function LocalDemo() {
  const [state, setState] = useState("Local demo is inactive until the server admits this loopback request.");
  async function bootstrap() {
    const read = await fetch("/api/interview", { cache: "no-store", credentials: "same-origin" });
    if (!read.ok) return setState("Local demo unavailable.");
    const response = await fetch("/api/interview", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-prospector-intent": "interview-mutation" }, body: JSON.stringify({ action: "bootstrap" }) });
    setState(response.ok ? "Interview initialized with disposable local data." : "Bootstrap was rejected.");
  }
  return <main><h1>Local demo interview</h1><p>Development-only, disposable, and unable to activate providers, prospecting, outreach, or external effects.</p><button type="button" onClick={() => void bootstrap()}>Initialize local interview</button><p role="status">{state}</p></main>;
}
