import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  handleDiscoveryGet,
  handleDiscoveryPost,
  type DiscoveryHandlerDependencies,
} from "../../../domain/discovery-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDiscoveryGet(request, dependencies());
}

export async function POST(request: Request) {
  return handleDiscoveryPost(request, dependencies());
}

function dependencies(): DiscoveryHandlerDependencies {
  const bindings = env as unknown as {
    DB?: D1Database;
    OWNER_SUBJECT_PEPPER?: string;
    PILOT_OWNER_EMAIL?: string;
  };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL)
    throw new Error("Secure discovery bindings are unavailable");
  return {
    database: bindings.DB,
    subjectPepper: bindings.OWNER_SUBJECT_PEPPER,
    pilotOwnerEmail: bindings.PILOT_OWNER_EMAIL,
    getIdentity: async () => {
      const user = await getChatGPTUser();
      return user ? { email: user.email, displayName: user.displayName } : null;
    },
  };
}
