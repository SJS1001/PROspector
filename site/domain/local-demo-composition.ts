/**
 * Fixed, disposable inputs for the LOCAL_DEMO composition journey.
 *
 * This is deliberately a projection builder, not a workflow or authority
 * service. It accepts no caller material, performs no I/O, and describes no
 * real-world decision or effect. The `ContactReady` label below is explicitly
 * shaped-only: it demonstrates screen ordering while all later admission
 * remains refused.
 */

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
  prospects: readonly Readonly<{
    id: "qualified" | "rejected" | "deferred";
    qualification: "qualified" | "rejected" | "deferred";
    label: string;
  }>[];
  contacts: readonly Readonly<{
    prospectId: "qualified" | "rejected" | "deferred";
    state: "ContactSuggestion" | "NonContactable" | "ContactReady";
    shapedOnly: boolean;
    eligible: false;
    reason: string;
  }>[];
  package: Readonly<{ reviewedAfter: "qualified"; exact: true; admitted: false }>;
  message: Readonly<{ reviewedAfter: "package"; exact: true; admitted: false }>;
  suppression: Readonly<{ recheckedAfter: "message"; outcome: "blocked" }>;
  weeklyPreview: Readonly<{ source: "fictional projections"; realAdmissionCount: 0 }>;
  crmPreview: Readonly<{ source: "fictional projections"; realAdmissionCount: 0; downloadAuthorized: false }>;
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
  prospects: Object.freeze([
    Object.freeze({ id: "qualified", qualification: "qualified", label: "Qualified fictional prospect" }),
    Object.freeze({ id: "rejected", qualification: "rejected", label: "Rejected fictional prospect" }),
    Object.freeze({ id: "deferred", qualification: "deferred", label: "Deferred fictional prospect" }),
  ]),
  contacts: Object.freeze([
    Object.freeze({ prospectId: "qualified", state: "ContactSuggestion", shapedOnly: false, eligible: false, reason: "fictional_suggestion_only" }),
    Object.freeze({ prospectId: "rejected", state: "NonContactable", shapedOnly: false, eligible: false, reason: "fictional_rejected_prospect" }),
    Object.freeze({ prospectId: "qualified", state: "ContactReady", shapedOnly: true, eligible: false, reason: "fictional_shape_not_real_admission" }),
  ]),
  package: Object.freeze({ reviewedAfter: "qualified", exact: true, admitted: false }),
  message: Object.freeze({ reviewedAfter: "package", exact: true, admitted: false }),
  suppression: Object.freeze({ recheckedAfter: "message", outcome: "blocked" }),
  weeklyPreview: Object.freeze({ source: "fictional projections", realAdmissionCount: 0 }),
  crmPreview: Object.freeze({ source: "fictional projections", realAdmissionCount: 0, downloadAuthorized: false }),
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
