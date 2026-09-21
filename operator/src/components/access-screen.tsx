import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function AccessScreen({
  mode,
}: {
  mode: "checking" | "login";
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-10">
      <section className="w-full max-w-md rounded-lg border border-line bg-cream p-7">
        <p className="text-2xs font-medium text-subtle">PROspector</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">
          {mode === "checking" ? "Opening workspace" : "Sign in to this workspace"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {mode === "checking"
            ? "Checking the owner session."
            : "One company per owner. After sign-in, add Apollo, Gmail, and xAI keys in Connections."}
        </p>
        {mode === "login" ? (
          <div className="mt-7 grid gap-2">
            {authEnabled ? (
              GROK_PROVIDERS.map((provider) => (
                <Button
                  key={provider.providerId}
                  className="w-full"
                  onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                >
                  Continue with {provider.label}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted">Sign-in is disabled.</p>
            )}
          </div>
        ) : (
          <p className="mt-7 text-xs text-subtle" role="status">
            Verifying owner…
          </p>
        )}
      </section>
    </main>
  );
}
