/** Fixed, disposable LOCAL_DEMO composition data with no external I/O. */

type ImmutableStage = Readonly<{
  id: string;
  immutableDigest: string;
  predecessorId: string;
  predecessorDigest: string;
}>;

export type LocalDemoComposition = Readonly<{
  kind: "local_demo_composition";
  fictional: true;
  disposable: true;
  scope: Readonly<{
    company: "Northwind Sample Works";
    product: "Sample Operations Console";
    marketPlay: "Fictional regional operations teams";
    profile: "Fictional maintenance planning profile";
  }>;
  prospect: Readonly<{
    id: "local-demo-prospect-qualified-v1";
    qualification: "qualified";
    immutableDigest: string;
  }>;
  ownerProspectApproval: Readonly<{
    id: "local-demo-owner-prospect-approval-v1";
    immutableDigest: string;
    reviewedProspectId: "local-demo-prospect-qualified-v1";
    reviewedProspectDigest: string;
    decision: "approved";
    provenance: "fictional owner Prospect approval";
  }>;
  contactSuggestion: ImmutableStage & Readonly<{ id: "local-demo-contact-suggestion-v1"; predecessorId: "local-demo-owner-prospect-approval-v1"; state: "ContactSuggestion" }>;
  verificationIntent: ImmutableStage & Readonly<{ id: "local-demo-verification-intent-v1"; predecessorId: "local-demo-contact-suggestion-v1"; state: "verification_intent"; providerInvocation: false; verified: false }>;
  contactReady: ImmutableStage & Readonly<{ id: "local-demo-contact-ready-v1"; predecessorId: "local-demo-verification-intent-v1"; state: "ContactReady"; shapedOnly: true; admitted: false }>;
  package: ImmutableStage & Readonly<{ id: "local-demo-package-v1"; predecessorId: "local-demo-contact-ready-v1"; exact: true; admitted: false }>;
  message: ImmutableStage & Readonly<{ id: "local-demo-message-v1"; predecessorId: "local-demo-package-v1"; exact: true; admitted: false }>;
  suppression: ImmutableStage & Readonly<{ id: "local-demo-suppression-v1"; predecessorId: "local-demo-message-v1"; outcome: "blocked" }>;
  manualCallOutcome: ImmutableStage & Readonly<{ id: "local-demo-manual-call-outcome-v1"; predecessorId: "local-demo-suppression-v1"; outcome: "not_attempted"; phoneTargetPresent: false }>;
  morningBrief: ImmutableStage & Readonly<{ id: "local-demo-morning-brief-v1"; predecessorId: "local-demo-manual-call-outcome-v1"; source: "fictional projections"; actionableCount: 0 }>;
  weeklyPreview: ImmutableStage & Readonly<{ id: "local-demo-weekly-preview-v1"; predecessorId: "local-demo-morning-brief-v1"; source: "fictional projections"; realAdmissionCount: 0 }>;
  crmPreview: ImmutableStage & Readonly<{ id: "local-demo-crm-preview-v1"; predecessorId: "local-demo-weekly-preview-v1"; source: "fictional metadata only"; realAdmissionCount: 0; materializationAuthorized: false; fieldCount: 7 }>;
  portabilityPreview: ImmutableStage & Readonly<{ id: "local-demo-portability-preview-v1"; predecessorId: "local-demo-crm-preview-v1"; compatibility: "synthetic_contract_match"; restoreAuthorized: false }>;
  effects: Readonly<{ persistence: false; browserStorage: false; network: false; providerInvocation: false; outbound: false; export: false; effectCount: 0 }>;
}>;

type StageFields = Readonly<Record<string, string | number | boolean>>;

async function stage<T extends StageFields>(fields: T) {
  return Object.freeze({ ...fields, immutableDigest: await digest(fields) });
}

async function buildComposition(): Promise<LocalDemoComposition> {
  const prospect = await stage({ id: "local-demo-prospect-qualified-v1" as const, qualification: "qualified" as const });
  const ownerProspectApproval = await stage({
    id: "local-demo-owner-prospect-approval-v1" as const,
    reviewedProspectId: prospect.id,
    reviewedProspectDigest: prospect.immutableDigest,
    decision: "approved" as const,
    provenance: "fictional owner Prospect approval" as const,
  });
  const contactSuggestion = await stage({ id: "local-demo-contact-suggestion-v1" as const, predecessorId: ownerProspectApproval.id, predecessorDigest: ownerProspectApproval.immutableDigest, state: "ContactSuggestion" as const });
  const verificationIntent = await stage({ id: "local-demo-verification-intent-v1" as const, predecessorId: contactSuggestion.id, predecessorDigest: contactSuggestion.immutableDigest, state: "verification_intent" as const, providerInvocation: false as const, verified: false as const });
  const contactReady = await stage({ id: "local-demo-contact-ready-v1" as const, predecessorId: verificationIntent.id, predecessorDigest: verificationIntent.immutableDigest, state: "ContactReady" as const, shapedOnly: true as const, admitted: false as const });
  const outreachPackage = await stage({ id: "local-demo-package-v1" as const, predecessorId: contactReady.id, predecessorDigest: contactReady.immutableDigest, exact: true as const, admitted: false as const });
  const message = await stage({ id: "local-demo-message-v1" as const, predecessorId: outreachPackage.id, predecessorDigest: outreachPackage.immutableDigest, exact: true as const, admitted: false as const });
  const suppression = await stage({ id: "local-demo-suppression-v1" as const, predecessorId: message.id, predecessorDigest: message.immutableDigest, outcome: "blocked" as const });
  const manualCallOutcome = await stage({ id: "local-demo-manual-call-outcome-v1" as const, predecessorId: suppression.id, predecessorDigest: suppression.immutableDigest, outcome: "not_attempted" as const, phoneTargetPresent: false as const });
  const morningBrief = await stage({ id: "local-demo-morning-brief-v1" as const, predecessorId: manualCallOutcome.id, predecessorDigest: manualCallOutcome.immutableDigest, source: "fictional projections" as const, actionableCount: 0 as const });
  const weeklyPreview = await stage({ id: "local-demo-weekly-preview-v1" as const, predecessorId: morningBrief.id, predecessorDigest: morningBrief.immutableDigest, source: "fictional projections" as const, realAdmissionCount: 0 as const });
  const crmPreview = await stage({ id: "local-demo-crm-preview-v1" as const, predecessorId: weeklyPreview.id, predecessorDigest: weeklyPreview.immutableDigest, source: "fictional metadata only" as const, realAdmissionCount: 0 as const, materializationAuthorized: false as const, fieldCount: 7 as const });
  const portabilityPreview = await stage({ id: "local-demo-portability-preview-v1" as const, predecessorId: crmPreview.id, predecessorDigest: crmPreview.immutableDigest, compatibility: "synthetic_contract_match" as const, restoreAuthorized: false as const });

  return Object.freeze({
    kind: "local_demo_composition",
    fictional: true,
    disposable: true,
    scope: Object.freeze({ company: "Northwind Sample Works", product: "Sample Operations Console", marketPlay: "Fictional regional operations teams", profile: "Fictional maintenance planning profile" }),
    prospect,
    ownerProspectApproval,
    contactSuggestion,
    verificationIntent,
    contactReady,
    package: outreachPackage,
    message,
    suppression, manualCallOutcome, morningBrief,
    weeklyPreview,
    crmPreview,
    portabilityPreview,
    effects: Object.freeze({ persistence: false, browserStorage: false, network: false, providerInvocation: false, outbound: false, export: false, effectCount: 0 }),
  });
}

let compositionPromise: Promise<LocalDemoComposition> | undefined;

/** Returns the one fixed local-only story; the returned graph is immutable. */
export function readLocalDemoComposition(): Promise<LocalDemoComposition> {
  compositionPromise ??= buildComposition();
  return compositionPromise;
}

/** Reject any injected graph with a changed field, link, digest, or effect claim. */
export async function validateLocalDemoComposition(candidate: unknown) {
  try {
    return canonicalJson(candidate) === canonicalJson(await readLocalDemoComposition());
  } catch {
    return false;
  }
}

async function digest(value: StageFields) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
