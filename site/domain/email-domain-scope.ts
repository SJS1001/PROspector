import { normalizeBusinessEmail } from "./contact-evidence";
import { canonicalDigest } from "./enrichment-grant-issuance";

/**
 * Confirmed-domain scope (D-6/D-7). A leaf module so the outreach repository
 * can record a mailbox's domain scope without importing the suppression
 * resolver, which itself depends on the repository. `suppression.ts`
 * re-exports these, so there is still one normalization library.
 */

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const MAX_DOMAIN_LABELS = 8;

/** Owner-confirmed domain: lowercase ASCII/punycode labels, at least two labels. */
export function normalizeConfirmedDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let candidate = value.normalize("NFC").trim().toLowerCase();
  if (candidate.endsWith(".")) candidate = candidate.slice(0, -1);
  if (candidate.length < 3 || candidate.length > 253 || /[^a-z0-9.\-\u0080-￿]/u.test(candidate)) return null;
  let ascii: string;
  try {
    ascii = new URL(`https://${candidate}/`).hostname;
  } catch {
    return null;
  }
  const labels = ascii.split(".");
  if (labels.length < 2 || labels.length > MAX_DOMAIN_LABELS || !labels.every((label) => LABEL.test(label))) return null;
  if (/^[0-9.]+$/u.test(ascii)) return null;
  return ascii;
}

/** Every whole-label suffix of a normalized domain with two or more labels, most specific first. */
export function wholeLabelDomainSuffixes(normalizedDomain: string): string[] {
  const labels = normalizedDomain.split(".");
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
}

export function domainDigest(normalizedDomain: string): Promise<string> {
  return canonicalDigest({ schema: "outreach-suppression-domain/v1", domain: normalizedDomain });
}

/**
 * The confirmed-domain digests that cover this mailbox, most specific first:
 * the digest of every whole-label suffix of its domain, after the same
 * normalization (including one DNS root dot) the resolver uses. Null when the
 * address or its domain cannot be resolved; the SQL rechecks then treat the
 * contact point as covered by every confirmed-domain tombstone.
 */
export async function emailDomainScopeDigests(email: unknown): Promise<string[] | null> {
  const normalized = normalizeBusinessEmail(email);
  if (!normalized) return null;
  const domain = normalizeConfirmedDomain(normalized.slice(normalized.lastIndexOf("@") + 1));
  if (!domain) return null;
  const digests: string[] = [];
  for (const suffix of wholeLabelDomainSuffixes(domain)) digests.push(await domainDigest(suffix));
  return digests;
}
