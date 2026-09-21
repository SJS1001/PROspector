import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 400_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

function isBlockedIp(ip: string) {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);
  const v4 = ip.includes(".") && !ip.includes(":");
  if (v4) {
    const parts = ip.split(".").map((part) => Number(part));
    const [a, b] = parts;
    if (parts.some((n) => Number.isNaN(n))) return true;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
    return true;
  }
  return false;
}

export function assertPublicHttps(urlString: string) {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Evidence URL is not valid.");
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS evidence URLs are retrieved.");
  if (url.username || url.password) throw new Error("Evidence URLs may not include credentials.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    throw new Error("Private hosts are not retrieved.");
  }
  if (url.hostname.includes(".onion")) throw new Error("Onion hosts are not retrieved.");
  if (isIP(url.hostname) && isBlockedIp(url.hostname)) {
    throw new Error("Private addresses are not retrieved.");
  }
  return url;
}

async function resolvePublic(hostname: string) {
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("Private addresses are not retrieved.");
    return;
  }
  const answers = await lookup(hostname, { all: true, verbatim: true });
  if (answers.length === 0) throw new Error("Evidence host could not be resolved.");
  if (answers.some((item) => isBlockedIp(item.address))) {
    throw new Error("Private addresses are not retrieved.");
  }
}

async function readHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Evidence fetch returned no body.");
  const decoder = new TextDecoder("utf-8");
  let prefix = "";
  let body = "";
  let inBody = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!inBody) {
      prefix += chunk;
      const idx = prefix.search(/<body[\s>]/i);
      if (idx >= 0) {
        inBody = true;
        body = prefix.slice(idx);
        prefix = prefix.slice(0, Math.min(idx, 12_000));
      } else if (prefix.length > 2_000_000) {
        await reader.cancel();
        break;
      }
    } else {
      body += chunk;
      if (body.length > MAX_BYTES) {
        body = body.slice(0, MAX_BYTES);
        await reader.cancel();
        break;
      }
    }
  }
  return `${prefix}\n${body}`;
}

function extractText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "";
  const body = html.includes("<body") ? html.replace(/^[\s\S]*<body[^>]*>/i, " ") : html.replace(/<head[\s\S]*?<\/head>/i, " ");
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: title.replace(/\s+/g, " ").trim().slice(0, 180),
    text: stripped.slice(0, 8_000),
  };
}

export type RetrievedPage = {
  url: string;
  title: string;
  text: string;
  hash: string;
  retrievedAt: string;
};

export async function retrieveHttps(urlString: string): Promise<RetrievedPage> {
  let current = assertPublicHttps(urlString);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await resolvePublic(current.hostname);
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "PROspectorRetrieval/1.0", accept: "text/html,application/xhtml+xml,text/plain" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      if (!next) throw new Error("Redirect had no location.");
      current = assertPublicHttps(new URL(next, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Evidence fetch failed (${response.status}).`);
    const html = await readHtml(response);
    const extracted = extractText(html);
    return {
      url: current.toString(),
      title: extracted.title || current.hostname,
      text: extracted.text,
      hash: createHash("sha256").update(html).digest("hex"),
      retrievedAt: new Date().toISOString(),
    };
  }
  throw new Error("Too many redirects while retrieving evidence.");
}
