import { headers } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";

const DEMO = { email: "local-owner@prospector.invalid", displayName: "Local Demo Owner" } as const;

export async function runtimeIdentity(request?: Request, localDemo?: unknown) {
  const platform = await getChatGPTUser();
  if (platform) return { email: platform.email, displayName: platform.displayName };
  if (!import.meta.env.DEV || localDemo !== "1") return null;
  const requestHeaders = request ? null : await headers();
  const host = request
    ? new URL(request.url).hostname
    : hostnameFromHostHeader(requestHeaders?.get("host") ?? null);
  if (!isLoopbackHostname(host)) return null;
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== new URL(request.url).host) return null;
  }
  return DEMO;
}

export function isLocalDemoRequest(request: Request, localDemo?: unknown) {
  return import.meta.env.DEV
    && localDemo === "1"
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
