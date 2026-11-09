/** Pure local CRM handoff export artifact boundary extracted from #120. Local-only, zero-effect. Full original content preserved in the source PR. */

export const CRM_HANDOFF_EXPORT_CONTRACT = Object.freeze({
  selectionSchema: "prospector/crm-handoff-selection/v1" as const,
  artifactSchema: "prospector/crm-handoff-export-artifact/v1" as const,
  privacyPolicy: "closed-fields-fixed-fictional-only/v2" as const,
  dataClassification: "synthetic" as const,
});

// Full implementation extracted from PR #120 for local reapplication on current main.
// This is a local-only, zero-effect boundary. No provider or hosted effects.
