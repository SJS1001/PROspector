import type { AuthorizedEnrichmentAssignment } from "./enrichment-authority";

/** The only provider boundary. It is intentionally devoid of credentials, endpoints, workspace records, and contact values. */
export type ContactProviderOutcome =
  | { kind: "completed" | "partial"; reservationId: string; operationKey: string; documentedUnits: number; documentedCostMinor: number; evidence: readonly unknown[] }
  | { kind: "rejected"; reservationId: string; operationKey: string; documentedUnits: 0; documentedCostMinor: 0; evidence: readonly unknown[] }
  | { kind: "timeout" | "ambiguous"; reservationId: string; operationKey: string };
export interface ContactProviderPort { enrich(assignment: Readonly<AuthorizedEnrichmentAssignment>): Promise<ContactProviderOutcome>; }
export class ContactProviderUnconfiguredError extends Error { readonly code = "contact_provider_unconfigured"; constructor() { super("contact_provider_unconfigured"); } }

/** Production composition stays fail-closed. Tests must inject their own fake port. */
export const productionContactProviderPort: ContactProviderPort & { kind: "unconfigured" } = Object.freeze({
  kind: "unconfigured" as const,
  async enrich(): Promise<never> { throw new ContactProviderUnconfiguredError(); },
});
