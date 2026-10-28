import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
export const authEnabled = true;
// Kept as compatibility exports for the existing generic button components.
export const GROK_PROVIDERS: { providerId: string; label: string }[] = [];
export function getBearerToken(): null {
  return null;
}
export async function signIn(): Promise<void> {
  window.location.href = "/login";
}
export async function signOut(redirectTo = "/login"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = redirectTo;
}
