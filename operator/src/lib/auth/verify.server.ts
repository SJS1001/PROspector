import { getRequest } from "@tanstack/react-start/server";
import { getLocalAuth } from "./server";
import { assertLocalRequest } from "./local-request";
import { readLocalOwner, localAccessEnabled, OWNER_EMAIL } from "../../../scripts/local-owner.mjs";
export { authConfigured } from "./server";
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
export type VerifiedUser = { id: string; email: string | null };
export async function getSessionUser(): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  assertLocalRequest(request);
  const auth = await getLocalAuth();
  if (localAccessEnabled()) return { id: readLocalOwner().id, email: OWNER_EMAIL };
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || session.user.id !== readLocalOwner().id) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
