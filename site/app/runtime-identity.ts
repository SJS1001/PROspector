import { headers } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";

const DEMO = { email: "local-owner@prospector.invalid", displayName: "Local Demo Owner" } as const;

export async function runtimeIdentity(request?: Request, localDemo?: unknown) {
  const platform = await getChatGPTUser();
  if (platform) return { email: platform.email, displayName: platform.displayName };
  if (!import.meta.env.DEV || localDemo !== "1") return null;
  const host = request ? new URL(request.url).hostname : (await headers()).get("host")?.split(":")[0];
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return null;
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== new URL(request.url).host) return null;
  }
  return DEMO;
}
