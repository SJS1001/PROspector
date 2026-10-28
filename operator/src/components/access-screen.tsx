import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
export function AccessScreen({ mode }: { mode: "checking" | "login" }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error && !busy) passwordInput.current?.focus();
  }, [error, busy]);
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-10">
      <section className="w-full max-w-md rounded-lg border border-line bg-cream p-7">
        <p className="text-2xs font-medium text-subtle">PROspector</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">
          {mode === "checking" ? "Opening workspace" : "Unlock your local workspace"}
        </h1>
        {mode === "checking" ? (
          <p className="mt-7 text-xs text-subtle" role="status">
            Checking the owner session…
          </p>
        ) : (
          <form
            className="mt-7 grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const result = await authClient.signIn.email({
                  email: "owner@localhost.invalid",
                  password,
                });
                if (result.error) {
                  setError("Sign-in failed. Check your password or wait before retrying.");
                  return;
                }
                window.location.href = "/";
              } catch {
                setError("Could not reach the local app. Check that it is running.");
              } finally {
                setPassword("");
                setBusy(false);
              }
            }}
          >
            <label htmlFor="owner-password" className="text-sm">
              Owner password
            </label>
            <input
              ref={passwordInput}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "owner-password-error" : undefined}
              id="owner-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded border border-line bg-paper p-3"
            />
            {error && (
              <p id="owner-password-error" role="alert" className="text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Unlocking…" : "Unlock workspace"}
            </Button>
            <p className="text-xs leading-5 text-muted">
              Use the password you chose with npm run owner:setup. If you need to reset it, stop the
              app and run npm run owner:reset.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
