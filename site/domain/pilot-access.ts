import {
  principalFromIdentity,
  type InterviewPrincipal,
} from "./interview";

export type TrustedPilotIdentity = {
  email: string;
  displayName: string;
};

export class PilotAccessError extends Error {
  readonly code = "private_workspace_unavailable";

  constructor() {
    super("Private workspace unavailable");
    this.name = "PilotAccessError";
  }
}

export async function admitPilotOwner(
  identity: TrustedPilotIdentity | null,
  configuredOwnerEmail: string | undefined,
  subjectPepper: string,
): Promise<InterviewPrincipal> {
  const ownerEmail = normalizeEmail(configuredOwnerEmail);
  const identityEmail = normalizeEmail(identity?.email);
  if (!identity || !ownerEmail || !identityEmail || identityEmail !== ownerEmail) {
    throw new PilotAccessError();
  }

  return principalFromIdentity(
    identityEmail,
    identity.displayName,
    subjectPepper,
  );
}

function normalizeEmail(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}
