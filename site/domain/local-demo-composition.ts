/**
 * One fixed, disposable story for the LOCAL_DEMO composition screen.
 *
 * This is data, not a workflow. It has no arguments, does no I/O, and each
 * downstream projection carries the immutable identifier and digest of its
 * immediate authorized predecessor. `ContactReady` is presentation-only;
 * it never represents a real admission or a provider verification.
 */

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
    immutableDigest: "sha256:local-demo-prospect-qualified-v1";
  }>;
  ownerProspectApproval: Readonly<{
    id: "local-demo-owner-prospect-approval-v1";
    immutableDigest: "sha256:local-demo-owner-prospect-approval-v1";
    reviewedProspectId: "local-demo-prospect-qualified-v1";
    reviewedProspectDigest: "sha256:local-demo-prospect-qualified-v1";
    decision: "approved";
    provenance: "fictional owner Prospect approval";
  }>;
  contactSuggestion: ImmutableStage & Readonly<{
    id: "local-demo-contact-suggestion-v1";
    predecessorId: "local-demo-owner-prospect-approval-v1";
    predecessorDigest: "sha256:local-demo-owner-prospect-approval-v1";
    state: "ContactSuggestion";
  }>;
  verificationIntent: ImmutableStage & Readonly<{
    id: "local-demo-verification-intent-v1";
    predecessorId: "local-demo-contact-suggestion-v1";
    predecessorDigest: "sha256:local-demo-contact-suggestion-v1";
    state: "verification_intent";
    providerInvocation: false;
    verified: false;
  }>;
  contactReady: ImmutableStage & Readonly<{
    id: "local-demo-contact-ready-v1";
    predecessorId: "local-demo-verification-intent-v1";
    predecessorDigest: "sha256:local-demo-verification-intent-v1";
    state: "ContactReady";
    shapedOnly: true;
    admitted: false;
  }>;
  package: ImmutableStage & Readonly<{
    id: "local-demo-package-v1";
    predecessorId: "local-demo-contact-ready-v1";
    predecessorDigest: "sha256:local-demo-contact-ready-v1";
    exact: true;
    admitted: false;
  }>;
  message: ImmutableStage & Readonly<{
    id: "local-demo-message-v1";
    predecessorId: "local-demo-package-v1";
    predecessorDigest: "sha256:local-demo-package-v1";
    exact: true;
    admitted: false;
  }>;
  suppression: ImmutableStage & Readonly<{
    id: "local-demo-suppression-v1";
    predecessorId: "local-demo-message-v1";
    predecessorDigest: "sha256:local-demo-message-v1";
    outcome: "blocked";
  }>;
  weeklyPreview: ImmutableStage & Readonly<{
    id: "local-demo-weekly-preview-v1";
    predecessorId: "local-demo-suppression-v1";
    predecessorDigest: "sha256:local-demo-suppression-v1";
    source: "fictional projections";
    realAdmissionCount: 0;
  }>;
  crmPreview: ImmutableStage & Readonly<{
    id: "local-demo-crm-preview-v1";
    predecessorId: "local-demo-weekly-preview-v1";
    predecessorDigest: "sha256:local-demo-weekly-preview-v1";
    source: "fictional projections";
    realAdmissionCount: 0;
    downloadAuthorized: false;
  }>;
  effects: Readonly<{
    persistence: false;
    browserStorage: false;
    network: false;
    providerInvocation: false;
    outbound: false;
    export: false;
    effectCount: 0;
  }>;
}>;

const composition: LocalDemoComposition = Object.freeze({
  kind: "local_demo_composition",
  fictional: true,
  disposable: true,
  scope: Object.freeze({
    company: "Northwind Sample Works",
    product: "Sample Operations Console",
    marketPlay: "Fictional regional operations teams",
    profile: "Fictional maintenance planning profile",
  }),
  prospect: Object.freeze({
    id: "local-demo-prospect-qualified-v1",
    qualification: "qualified",
    immutableDigest: "sha256:local-demo-prospect-qualified-v1",
  }),
  ownerProspectApproval: Object.freeze({
    id: "local-demo-owner-prospect-approval-v1",
    immutableDigest: "sha256:local-demo-owner-prospect-approval-v1",
    reviewedProspectId: "local-demo-prospect-qualified-v1",
    reviewedProspectDigest: "sha256:local-demo-prospect-qualified-v1",
    decision: "approved",
    provenance: "fictional owner Prospect approval",
  }),
  contactSuggestion: Object.freeze({
    id: "local-demo-contact-suggestion-v1",
    immutableDigest: "sha256:local-demo-contact-suggestion-v1",
    predecessorId: "local-demo-owner-prospect-approval-v1",
    predecessorDigest: "sha256:local-demo-owner-prospect-approval-v1",
    state: "ContactSuggestion",
  }),
  verificationIntent: Object.freeze({
    id: "local-demo-verification-intent-v1",
    immutableDigest: "sha256:local-demo-verification-intent-v1",
    predecessorId: "local-demo-contact-suggestion-v1",
    predecessorDigest: "sha256:local-demo-contact-suggestion-v1",
    state: "verification_intent",
    providerInvocation: false,
    verified: false,
  }),
  contactReady: Object.freeze({
    id: "local-demo-contact-ready-v1",
    immutableDigest: "sha256:local-demo-contact-ready-v1",
    predecessorId: "local-demo-verification-intent-v1",
    predecessorDigest: "sha256:local-demo-verification-intent-v1",
    state: "ContactReady",
    shapedOnly: true,
    admitted: false,
  }),
  package: Object.freeze({
    id: "local-demo-package-v1",
    immutableDigest: "sha256:local-demo-package-v1",
    predecessorId: "local-demo-contact-ready-v1",
    predecessorDigest: "sha256:local-demo-contact-ready-v1",
    exact: true,
    admitted: false,
  }),
  message: Object.freeze({
    id: "local-demo-message-v1",
    immutableDigest: "sha256:local-demo-message-v1",
    predecessorId: "local-demo-package-v1",
    predecessorDigest: "sha256:local-demo-package-v1",
    exact: true,
    admitted: false,
  }),
  suppression: Object.freeze({
    id: "local-demo-suppression-v1",
    immutableDigest: "sha256:local-demo-suppression-v1",
    predecessorId: "local-demo-message-v1",
    predecessorDigest: "sha256:local-demo-message-v1",
    outcome: "blocked",
  }),
  weeklyPreview: Object.freeze({
    id: "local-demo-weekly-preview-v1",
    immutableDigest: "sha256:local-demo-weekly-preview-v1",
    predecessorId: "local-demo-suppression-v1",
    predecessorDigest: "sha256:local-demo-suppression-v1",
    source: "fictional projections",
    realAdmissionCount: 0,
  }),
  crmPreview: Object.freeze({
    id: "local-demo-crm-preview-v1",
    immutableDigest: "sha256:local-demo-crm-preview-v1",
    predecessorId: "local-demo-weekly-preview-v1",
    predecessorDigest: "sha256:local-demo-weekly-preview-v1",
    source: "fictional projections",
    realAdmissionCount: 0,
    downloadAuthorized: false,
  }),
  effects: Object.freeze({
    persistence: false,
    browserStorage: false,
    network: false,
    providerInvocation: false,
    outbound: false,
    export: false,
    effectCount: 0,
  }),
});

/** Returns the one fixed local-only story; the returned graph is immutable. */
export function readLocalDemoComposition(): LocalDemoComposition {
  return composition;
}
