import type { AuthorizedEnrichmentAssignment } from "./enrichment-authority";

/** The only provider boundary. It is intentionally devoid of credentials, endpoints, workspace records, and contact values. */
export type ContactProviderOutcome =
  | { kind: "completed" | "partial"; reservationId: string; operationKey: string; documentedUnits: number; documentedCostMinor: number; evidence: readonly unknown[] }
  | { kind: "rejected"; reservationId: string; operationKey: string; documentedUnits: 0; documentedCostMinor: 0; evidence: readonly unknown[] }
  | { kind: "timeout" | "ambiguous"; reservationId: string; operationKey: string };
export type ContactProviderDescriptor = Readonly<{
  providerId: string;
  providerVersion: string;
  catalogRef: string;
}>;
export interface ContactProviderPort {
  readonly kind: "bound";
  readonly descriptor: ContactProviderDescriptor;
  enrich(assignment: Readonly<AuthorizedEnrichmentAssignment>): Promise<ContactProviderOutcome>;
}
export class ContactProviderUnconfiguredError extends Error { readonly code = "contact_provider_unconfigured"; constructor() { super("contact_provider_unconfigured"); } }

const serverBoundPorts = new WeakSet<object>();

/**
 * The server composition root binds one adapter to one immutable provider
 * identity. Provider responses and client input cannot construct this brand.
 */
export function bindContactProviderPort(
  descriptor: ContactProviderDescriptor,
  enrich: ContactProviderPort["enrich"],
): ContactProviderPort {
  if (!validDescriptor(descriptor) || typeof enrich !== "function") throw new TypeError("invalid_contact_provider_binding");
  const boundDescriptor = Object.freeze({ ...descriptor });
  const port: ContactProviderPort = Object.freeze({
    kind: "bound" as const,
    descriptor: boundDescriptor,
    enrich,
  });
  serverBoundPorts.add(port);
  return port;
}

export function isContactProviderPortBoundTo(port: unknown, expected: ContactProviderDescriptor): port is ContactProviderPort {
  return !!port
    && typeof port === "object"
    && serverBoundPorts.has(port)
    && (port as ContactProviderPort).kind === "bound"
    && validDescriptor((port as ContactProviderPort).descriptor)
    && (port as ContactProviderPort).descriptor.providerId === expected.providerId
    && (port as ContactProviderPort).descriptor.providerVersion === expected.providerVersion
    && (port as ContactProviderPort).descriptor.catalogRef === expected.catalogRef;
}

/** Production composition stays fail-closed. Tests must inject their own fake port. */
export const productionContactProviderPort: Readonly<{ kind: "unconfigured"; enrich(): Promise<never> }> = Object.freeze({
  kind: "unconfigured" as const,
  async enrich(): Promise<never> { throw new ContactProviderUnconfiguredError(); },
});

function validDescriptor(value: unknown): value is ContactProviderDescriptor {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "catalogRef,providerId,providerVersion"
    && bounded((value as ContactProviderDescriptor).providerId, 128)
    && bounded((value as ContactProviderDescriptor).providerVersion, 128)
    && bounded((value as ContactProviderDescriptor).catalogRef, 256);
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
