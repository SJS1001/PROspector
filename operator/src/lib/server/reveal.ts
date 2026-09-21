import { retrieveHttps } from "@/lib/server/retrieve";

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

const JUNK = /(example\.com|sentry\.|wixpress|schema\.org|placeholder|noreply|no-reply|donotreply)/i;

export type RevealedMailbox = {
  email: string;
  url: string;
  excerpt: string;
};

function emailsIn(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
}

function domainOf(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sameSite(email: string, pageUrl: string) {
  const mail = domainOf(email);
  const host = hostOf(pageUrl);
  if (!mail || !host) return false;
  return host === mail || host.endsWith(`.${mail}`) || mail.endsWith(`.${host}`);
}

export async function revealFromPages(urls: string[]): Promise<RevealedMailbox[]> {
  const found: RevealedMailbox[] = [];
  const seen = new Set<string>();
  for (const url of urls.slice(0, 3)) {
    let page;
    try {
      page = await retrieveHttps(url);
    } catch {
      continue;
    }
    for (const raw of emailsIn(`${page.title} ${page.text}`)) {
      const email = raw.toLowerCase();
      if (seen.has(email) || JUNK.test(email) || FREE_MAIL.has(domainOf(email))) continue;
      if (!sameSite(email, page.url)) continue;
      seen.add(email);
      const idx = page.text.toLowerCase().indexOf(email);
      found.push({
        email,
        url: page.url,
        excerpt: page.text.slice(Math.max(0, idx - 80), idx + email.length + 80).trim(),
      });
    }
  }
  return found.slice(0, 3);
}
