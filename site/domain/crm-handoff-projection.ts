/**
 * Pure CRM handoff decision and row projection.
 *
 * This is the decision seam between verified contact eligibility and a future
 * CRM handoff. It answers one question for each supplied candidate: may this
 * contact point appear in a CRM handoff right now, and if so what are its
 * ordered field values?
 *
 * It composes the real contracts rather than restating them:
 *   - `recheckForCrmExport` from `./contact-eligibility` is the authority on
 *     whether the CRM export boundary is open. That function returns
 *     `blocked: true` as a literal type, unconditionally, so **no candidate is
 *     admitted today even when its evidence projects ContactReady**. That is
 *     the intended reject-only state, not a defect, and this module must never
 *     route around it.
 *   - `CRM_CSV_FIELD_IDS` / `CRM_CSV_SCHEMA_VERSION` from `./crm-csv-codec`
 *     supply the field order, so a row projection cannot drift from the codec's
 *     closed schema. Only those constants are imported: `encodeCrmCsv` is
 *     deliberately never called.
 *
 * Deliberately absent: CSV bytes, checksums, files, downloads, delivery,
 * persistence, routes, UI, environment bindings, providers, and any import of a
 * `preparation/` module. It reads no live data and produces no effect. Callers
 * supply already-projected synthetic material; this module decides and shapes.
 */

import {
  recheckForCrmExport,
  type ContactEligibility,
  type DownstreamRecheck,
} from "./contact-eligibility";
import {
  CRM_CSV_FIELD_IDS,
  CRM_CSV_SCHEMA_VERSION,
  type CrmCsvFieldId,
} from "./crm-csv-codec";

export type CrmHandoffRefusalCode =
  | "crm_export_recheck_blocked"
  | "contact_not_eligible"
  | "contact_non_contactable"
  | "duplicate_identity_conflict"
  | "handoff_candidate_invalid";

export type CrmHandoffRow = Readonly<Record<CrmCsvFieldId, string | null>>;

export type CrmHandoffRefusal = Readonly<{
  prospectId: string;
  contactId: string;
  contactPointId: string;
  eligibilityState: ContactEligibility["state"];
  reasonCodes: readonly CrmHandoffRefusalCode[];
  eligibilityReasonCodes: readonly string[];
}>;

/** Every counter this seam is forbidden to move. */
export type CrmHandoffEffects = Readonly<{
  csvSerializations: 0;
  checksumCalculations: 0;
  exportMutations: 0;
  deliveryInvocations: 0;
  downloadInvocations: 0;
  durableMutations: 0;
  providerCalls: 0;
}>;

export type CrmHandoffDecision = Readonly<{
  kind: "crm_handoff_decision";
  schemaVersion: typeof CRM_CSV_SCHEMA_VERSION;
  fieldIds: typeof CRM_CSV_FIELD_IDS;
  evaluatedAt: number;
  admitted: readonly CrmHandoffRow[];
  refused: readonly CrmHandoffRefusal[];
  admittedRowCount: number;
  refusedCount: number;
  uniqueProspectCount: number;
  exportAuthorized: false;
  csvSerializationAuthorized: false;
  deliveryAuthorized: false;
  downloadAuthorized: false;
  persistenceAuthorized: false;
  providerInvocationAuthorized: false;
  effects: CrmHandoffEffects;
}>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const ZERO_EFFECTS: CrmHandoffEffects = Object.freeze({
  csvSerializations: 0,
  checksumCalculations: 0,
  exportMutations: 0,
  deliveryInvocations: 0,
  downloadInvocations: 0,
  durableMutations: 0,
  providerCalls: 0,
});

/**
 * Shape one candidate's supplied cells into the codec's closed field order.
 *
 * Exported so the row contract can be exercised directly. It invents nothing:
 * an absent field becomes `null`, which the codec's null policy renders as an
 * empty field. Calling this does not admit anything -- admission is decided
 * only by `projectCrmHandoff`.
 */
export function projectCrmHandoffRow(cells: unknown): CrmHandoffRow {
  const supplied = exactStringRecord(cells);
  const row = {} as Record<CrmCsvFieldId, string | null>;
  for (const field of CRM_CSV_FIELD_IDS) {
    const value = supplied[field];
    row[field] = typeof value === "string" ? value : null;
  }
  return Object.freeze(row);
}

/**
 * Decide the CRM handoff for a bounded set of candidates.
 *
 * Admission requires an unblocked CRM export recheck. `recheckForCrmExport`
 * never returns one, so `admitted` is empty and every candidate is refused with
 * `crm_export_recheck_blocked` alongside its own eligibility reasons. When that
 * boundary is later opened under its own authorization, admitted rows appear
 * here in canonical Prospect, Contact, contact-point order without this module
 * changing shape.
 */
export function projectCrmHandoff(value: unknown): CrmHandoffDecision {
  const input = exactRecord(value, ["evaluatedAt", "candidates"]);
  const evaluatedAt = timestamp(input.evaluatedAt);
  if (!Array.isArray(input.candidates)) invalid();

  const seen = new Map<string, string>();
  const admitted: CrmHandoffRow[] = [];
  const refused: CrmHandoffRefusal[] = [];
  const prospects = new Set<string>();

  for (const candidate of input.candidates) {
    const entry = exactRecord(candidate, [
      "prospectId",
      "contactId",
      "contactPointId",
      "eligibilityInput",
      "cells",
    ]);
    const prospectId = stableId(entry.prospectId);
    const contactId = stableId(entry.contactId);
    const contactPointId = stableId(entry.contactPointId);
    const row = projectCrmHandoffRow(entry.cells);

    // Row identity is the Prospect plus contact point, matching the codec's
    // deduplication. An exact repeat collapses; the same identity carrying
    // different material is a conflict and fails closed rather than guessing.
    const identity = JSON.stringify([prospectId, contactPointId]);
    const signature = JSON.stringify([contactId, ...CRM_CSV_FIELD_IDS.map((field) => row[field])]);
    const previous = seen.get(identity);
    if (previous !== undefined) {
      if (previous !== signature) {
        refused.push(freezeRefusal({
          prospectId,
          contactId,
          contactPointId,
          eligibilityState: "NeedsReview",
          reasonCodes: ["duplicate_identity_conflict"],
          eligibilityReasonCodes: [],
        }));
        prospects.add(prospectId);
      }
      continue;
    }
    seen.set(identity, signature);
    prospects.add(prospectId);

    // The real boundary. Its projection carries the eligibility this decision
    // reports, so the two can never disagree.
    const recheck: DownstreamRecheck = recheckForCrmExport(entry.eligibilityInput);
    const eligibility = recheck.eligibility;
    const reasonCodes: CrmHandoffRefusalCode[] = [];
    if (recheck.blocked) reasonCodes.push("crm_export_recheck_blocked");
    if (eligibility.state === "NonContactable") reasonCodes.push("contact_non_contactable");
    else if (!eligibility.eligible) reasonCodes.push("contact_not_eligible");

    if (reasonCodes.length === 0) {
      admitted.push(row);
      continue;
    }
    refused.push(freezeRefusal({
      prospectId,
      contactId,
      contactPointId,
      eligibilityState: eligibility.state,
      reasonCodes: [...new Set(reasonCodes)].sort(compareText),
      eligibilityReasonCodes: eligibility.reasonCodes,
    }));
  }

  const ordered = admitted.sort((left, right) => (
    compareText(String(left.prospect_id), String(right.prospect_id))
    || compareText(String(left.contact_id), String(right.contact_id))
    || compareText(String(left.contact_point_id), String(right.contact_point_id))
  ));

  return Object.freeze({
    kind: "crm_handoff_decision" as const,
    schemaVersion: CRM_CSV_SCHEMA_VERSION,
    fieldIds: CRM_CSV_FIELD_IDS,
    evaluatedAt,
    admitted: Object.freeze(ordered),
    refused: Object.freeze(refused),
    admittedRowCount: ordered.length,
    refusedCount: refused.length,
    uniqueProspectCount: prospects.size,
    exportAuthorized: false as const,
    csvSerializationAuthorized: false as const,
    deliveryAuthorized: false as const,
    downloadAuthorized: false as const,
    persistenceAuthorized: false as const,
    providerInvocationAuthorized: false as const,
    effects: ZERO_EFFECTS,
  });
}

function freezeRefusal(refusal: {
  prospectId: string;
  contactId: string;
  contactPointId: string;
  eligibilityState: ContactEligibility["state"];
  reasonCodes: readonly CrmHandoffRefusalCode[];
  eligibilityReasonCodes: readonly string[];
}): CrmHandoffRefusal {
  return Object.freeze({
    ...refusal,
    reasonCodes: Object.freeze([...refusal.reasonCodes]),
    eligibilityReasonCodes: Object.freeze([...refusal.eligibilityReasonCodes]),
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const keys = Object.keys(descriptors).sort(compareText);
  if (keys.join("\0") !== [...expectedKeys].sort(compareText).join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

/** Cells are a plain record of known field ids to strings. Unknown keys reject. */
function exactStringRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const known = new Set<string>(CRM_CSV_FIELD_IDS);
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!known.has(key)) invalid();
    if (!descriptor.enumerable || !("value" in descriptor)) invalid();
    if (descriptor.value !== null && typeof descriptor.value !== "string") invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function stableId(value: unknown) {
  if (typeof value !== "string" || !STABLE_ID.test(value)) invalid();
  return value;
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
  return value as number;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(): never {
  throw new Error("crm_handoff_candidate_invalid");
}
