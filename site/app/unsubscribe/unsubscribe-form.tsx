"use client";

import { useState } from "react";

const FALLBACK = "We could not process this request right now. Please try the link again later.";

/** Sends the token once per click. It shows the server's generic message as plain text. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/unsubscribe", { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await response.json() as { message?: unknown };
      setMessage(typeof body.message === "string" ? body.message.slice(0, 300) : FALLBACK);
    } catch {
      setMessage(FALLBACK);
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => void submit()}>Unsubscribe</button>
      <p role="status" aria-live="polite">{message ?? ""}</p>
    </div>
  );
}
