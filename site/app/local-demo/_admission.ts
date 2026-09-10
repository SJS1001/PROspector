import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { admitPilotOwner } from "../../domain/pilot-access";
import { cloudflareAccessMode } from "../cloudflare-access";
import { isLoopbackHostname, runtimeIdentity } from "../runtime-identity";

type LocalDemoBindings = Readonly<{
  OWNER_SUBJECT_PEPPER?: string;
  PILOT_OWNER_EMAIL?: string;
  LOCAL_DEMO?: string;
  TRUSTED_IDENTITY_PROVIDER?: string;
  CLOUDFLARE_ACCESS_ISSUER?: unknown;
  CLOUDFLARE_ACCESS_AUDIENCE?: unknown;
}>;

const bindings = env as unknown as LocalDemoBindings;

function configuredForDisposableOwner() {
  return bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo"
    && bindings.LOCAL_DEMO === "1"
    && cloudflareAccessMode({ issuer: bindings.CLOUDFLARE_ACCESS_ISSUER, audience: bindings.CLOUDFLARE_ACCESS_AUDIENCE }) === "disabled"
    && typeof bindings.PILOT_OWNER_EMAIL === "string"
    && typeof bindings.OWNER_SUBJECT_PEPPER === "string";
}

async function admitted(request?: Request) {
  if (!configuredForDisposableOwner()) return false;
  try {
    await admitPilotOwner(await runtimeIdentity(request, bindings), bindings.PILOT_OWNER_EMAIL!, bindings.OWNER_SUBJECT_PEPPER!);
    return true;
  } catch {
    return false;
  }
}

/** Complete, network-free page admission. Scenario modules load only after it. */
export async function admitLocalDemoPage() {
  const host = (await headers()).get("host");
  if (!host) return false;
  try {
    if (!isLoopbackHostname(new URL(`http://${host}`).hostname)) return false;
  } catch {
    return false;
  }
  return admitted();
}

/** Complete admission for the non-admitting composition read.
 * POST is used only so browsers supply Origin. No body, query, workspace,
 * owner, revision, or CSRF material is accepted: those would imply a caller-
 * controlled mutation/reconciliation seam which this track does not grant.
 */
export async function admitLocalDemoCompositionRead(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (
    request.method !== "POST"
    || new URL(request.url).search
    || request.headers.has("content-type")
    || (contentLength !== null && contentLength !== "0")
  ) return false;
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  for (const header of ["x-csrf-token", "x-local-demo-authority-revision", "x-local-demo-workspace", "x-local-demo-owner"]) {
    if (request.headers.has(header)) return false;
  }
  return admitted(request);
}
