import { admitPilotOwner } from "../domain/pilot-access";
import { runtimeIdentity, type RuntimeIdentityBindings } from "./runtime-identity";

export type OperatorAdmissionBindings = RuntimeIdentityBindings & {
  PILOT_OWNER_EMAIL?: string;
  OWNER_SUBJECT_PEPPER?: string;
};

export type OperatorSession =
  | Readonly<{ admitted: true; identityKey: string }>
  | Readonly<{ admitted: false; identityKey: null }>;

const DENIED: OperatorSession = Object.freeze({ admitted: false, identityKey: null });

/** The root shell and the dedicated Contacts route admit the operator through
 * exactly this check, so neither entry point can be reachable while the other
 * denies. Every failure — missing bindings, no identity, a non-owner identity,
 * or a thrown adapter — denies. */
export async function admitOperatorSession(
  bindings: OperatorAdmissionBindings,
): Promise<OperatorSession> {
  try {
    if (!bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL) return DENIED;
    const principal = await admitPilotOwner(
      await runtimeIdentity(undefined, bindings),
      bindings.PILOT_OWNER_EMAIL,
      bindings.OWNER_SUBJECT_PEPPER,
    );
    return Object.freeze({
      admitted: true,
      identityKey: await presentationIdentityKey(principal.subject),
    });
  } catch {
    return DENIED;
  }
}

/** A one-way digest of the already-protected owner subject. It only scopes
 * client-side presentation state to one identity; it is never displayed, carries
 * no authority, and reveals neither the identity nor the subject pepper. */
export async function presentationIdentityKey(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`prospector-operator-context:${subject}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
