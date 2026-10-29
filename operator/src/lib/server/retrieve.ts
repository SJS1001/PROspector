import { load } from "cheerio";
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
  if (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80")
  ) {
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
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  ) {
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
    if (chunk.includes("\0") || (prefix + chunk).trimStart().startsWith("%PDF-")) {
      await reader.cancel();
      throw new Error("Source is a document or binary download; an HTML page is required.");
    }
    if (!inBody) {
      prefix += chunk;
      const idx = prefix.search(/<body[\s>]/i);
      if (idx >= 0) {
        inBody = true;
        body = prefix.slice(idx);
        // Keep the bounded head intact: cutting inside a style/script tag can
        // cause an HTML parser to swallow the entire article as code.
        prefix = prefix.slice(0, idx);
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

export function extractText(html: string) {
  const $ = load(html);
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const title = clean($("title").text()).slice(0, 180);
  $(
    "script, style, noscript, nav, footer, aside, form, [role=navigation], [role=banner], [role=contentinfo], [hidden], .menu, .navigation, .sidebar, .related-posts, .share-buttons, .cookie-banner",
  ).remove();
  // Prefer the article body; site headers and related-story menus are not evidence.
  const article = $(
    "[itemprop=articleBody], .entry-content, .post-content, .article-content, article, main, [role=main]",
  )
    .toArray()
    .map((node) => $(node))
    .filter((node) => clean(node.text()).length > 100)
    .sort((a, b) => clean(b.text()).length - clean(a.text()).length);
  const root =
    article.find((node) =>
      node.is("[itemprop=articleBody], .entry-content, .post-content, .article-content"),
    ) ??
    article[0] ??
    $("body");
  root.find("header").remove();
  root.find("p, div, br, li, h1, h2, h3, h4, section").before(" ").after(" ");
  // Quarterly reports often put site operations after financial tables.
  return { title, text: clean(root.text()).slice(0, 64_000) };
}

/** Only explicit publication metadata; never substitute retrieval time or dateModified. */
export function publicationDate(html: string): string | null {
  const $ = load(html);
  const values = [
    $('meta[property="article:published_time"]').attr("content"),
    $('meta[name="date"]').attr("content"),
    $('[itemprop="datePublished"]').attr("content"),
    $('time[itemprop="datePublished"]').attr("datetime"),
    $("time.published[datetime]").first().attr("datetime"),
  ];
  $('script[type="application/ld+json"]').each((_index, node) => {
    try {
      const collect = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === "object") {
          const row = value as Record<string, unknown>;
          if (typeof row.datePublished === "string") values.push(row.datePublished);
          if (row["@graph"]) collect(row["@graph"]);
        }
      };
      collect(JSON.parse($(node).text()));
    } catch {
      /* Invalid metadata is not evidence of a date. */
    }
  });
  for (const value of values) {
    const date = value?.match(/^\d{4}-\d{2}-\d{2}(?=$|T|\s)/)?.[0];
    if (
      date &&
      Number.isFinite(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date
    )
      return date;
  }
  return null;
}

export type RetrievedPage = {
  url: string;
  title: string;
  text: string;
  hash: string;
  retrievedAt: string;
  publishedOn?: string | null;
};

export async function retrieveHttps(urlString: string): Promise<RetrievedPage> {
  let current = assertPublicHttps(urlString);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await resolvePublic(current.hostname);
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": "PROspectorRetrieval/1.0",
        accept: "text/html,application/xhtml+xml,text/plain",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      if (!next) throw new Error("Redirect had no location.");
      current = assertPublicHttps(new URL(next, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Evidence fetch failed (${response.status}).`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (
      contentType &&
      !["text/html", "application/xhtml+xml", "text/plain"].includes(contentType)
    ) {
      await response.body?.cancel();
      throw new Error("Source is not an HTML or text page.");
    }
    const html = await readHtml(response);
    const extracted = extractText(html);
    if (!extracted.text) throw new Error("Source page contains no readable text.");
    return {
      url: current.toString(),
      title: extracted.title || current.hostname,
      text: extracted.text,
      publishedOn: publicationDate(html),
      hash: createHash("sha256").update(html).digest("hex"),
      retrievedAt: new Date().toISOString(),
    };
  }
  throw new Error("Too many redirects while retrieving evidence.");
}
