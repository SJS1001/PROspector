import { headers } from "next/headers";
import {
  cloudflareAccessMode,
  verifyCloudflareAccessIdentity,
  type CloudflareAccessConfig,
} from "./cloudflare-access";

export type RuntimeIdentityBindings = {
  TRUSTED_IDENTITY_PROVIDER?: unknown;
  LOCAL_DEMO?: unknown;
  CLOUDFLARE_ACCESS_ISSUER?: unknown;
  CLOUDFLARE_ACCESS_AUDIENCE?: unknown;
};

type RuntimeIdentityDependencies = {
  fetcher?: (input: string) => Promise<Response>;
  now?: () => number;
};

export async function runtimeIdentity(
  request?: Request,
  bindings: RuntimeIdentityBindings = {},
) {
  const requestHeaders = request?.headers ?? await headers();
  return resolveRuntimeIdentity(request, requestHeaders, bindings);
}

export async function resolveRuntimeIdentity(
  request: Request | undefined,
  requestHeaders: Pick<Headers, "get">,
  bindings: RuntimeIdentityBindings,
  dependencies: RuntimeIdentityDependencies = {},
) {
  const cloudflareConfig: CloudflareAccessConfig = {
    issuer: bindings.CLOUDFLARE_ACCESS_ISSUER,
    audience: bindings.CLOUDFLARE_ACCESS_AUDIENCE,
  };
  const accessMode = cloudflareAccessMode(cloudflareConfig);
  if (bindings.TRUSTED_IDENTITY_PROVIDER === "cloudflare-access") {
    if (accessMode !== "enabled" || bindings.LOCAL_DEMO !== undefined) return null;
    return verifyCloudflareAccessIdentity(requestHeaders, cloudflareConfig, dependencies);
  }
  // Positive-form gate. `if (import.meta.env.DEV && ...)` folds to `if (false)`
  // and the whole block -- including the dynamic import of the demo identity --
  // is eliminated. The previous negative form (`|| !import.meta.env.DEV`) folded
  // to `|| true) return null`, which is equally unreachable but left every
  // following statement, and the identity constant, in the emitted bundle.
  if (
    import.meta.env.DEV
    && bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo"
    && accessMode === "disabled"
    && bindings.LOCAL_DEMO === "1"
  ) {
    const host = request
      ? new URL(request.url).hostname
      : hostnameFromHostHeader(requestHeaders.get("host"));
    if (!isLoopbackHostname(host)) return null;
    if (request && request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.get("origin");
      try {
        if (!origin || new URL(origin).origin !== new URL(request.url).origin) return null;
      } catch {
        return null;
      }
    }
    const { LOCAL_DEMO_IDENTITY } = await import("./_local-demo-identity");
    return LOCAL_DEMO_IDENTITY;
  }
  return null;
}

export function isLocalDemoRequest(
  request: Request,
  bindings: RuntimeIdentityBindings,
) {
  const accessMode = cloudflareAccessMode({
    issuer: bindings.CLOUDFLARE_ACCESS_ISSUER,
    audience: bindings.CLOUDFLARE_ACCESS_AUDIENCE,
  });
  return import.meta.env.DEV
    && bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo"
    && bindings.LOCAL_DEMO === "1"
    && accessMode === "disabled"
    && isLoopbackHostname(new URL(request.url).hostname);
}

export function isLoopbackHostname(hostname: string | null | undefined) {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  const unwrapped = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
  return unwrapped === "localhost" || unwrapped === "127.0.0.1" || unwrapped === "::1";
}

function hostnameFromHostHeader(hostHeader: string | null) {
  if (!hostHeader) return null;
  try {
    const parsed = new URL(`http://${hostHeader}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash)
      return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}
