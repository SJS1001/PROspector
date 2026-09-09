# Validation and adversarial challenge

Read this reference before declaring a package audited, validated, or ready.

## Separate four validation layers

1. **Structure:** files exist, JSON parses, local links/anchors resolve, examples
   are placeholders, identifiers are defined, no obvious secrets exist.
2. **Evidence:** the owning current source supports the nearby claim with correct
   scope, date, jurisdiction, and limitation.
3. **Implementation:** the real UI, profile, data flow, forms, emergency route,
   access controls, tracking, and recovery behavior pass tests.
4. **Outcomes:** authorized field evidence supports qualified leads, bookings,
   sold work, revenue, or another defined business result.

Never use a lower layer as proof of a higher one.

## Package checks

For Markdown/JSON packages:

- run `node scripts/validate-package.mjs <output-directory>`;
- run a whitespace check that includes new/untracked files;
- verify external links with redirects and GET fallback;
- record transport/bot exceptions and manually inspect them;
- check evidence-ID or footnote coverage;
- parse every JSON/JSON-LD example;
- inspect structured-data semantics and visible-content requirements;
- distinguish fictional templates from contractor facts;
- search for guarantees, unsafe DIY content, self-serving ratings, review gating,
  hidden addresses, credentials, and customer data;
- record exact commands, date, scope, and known limits.

The bundled validator is structural. Its PASS does not establish source-to-claim
fit or current network behavior.

## Adversarial challenge

When independent challenge is requested or a high-risk package will be called
validated, use a reviewer who did not author the work. Give them the raw target,
goal, project rules, and current evidence without the author's reasoning.

Attack at least:

- completion/readiness overclaims;
- stale or mis-scoped sources;
- safety and emergency ambiguity;
- privacy, recording, consent, retention, and AI prompt leakage;
- Business Profile access, suspension, and recovery risk;
- review manipulation and schema misuse;
- taxonomy/crosswalk gaps;
- documentation versus implemented UI confusion;
- adjacent-trade scope creep;
- link receipts and artifact digests that do not bind the reviewed version.

Require file-and-line evidence and a concrete scenario for every finding. A
justified clean result is acceptable; invented findings are not.

## Triage

Preserve the original report. For each finding, record:

- `valid`, `invalid`, `needs-investigation`, or `severity-adjusted`;
- the exact ground-truth check;
- action taken;
- verification result;
- residual limit.

Ground-truth every blocker and high-severity finding before accepting it.
Mechanical documentation defects can be corrected. Decisions requiring live
authority, legal approval, contractor facts, or a user choice remain open.

After remediation, rerun structural checks and ask the independent reviewer to
verify closure when the user requested adversarial validation.

## Honest completion language

Prefer:

- “evidence-grounded documentation package”;
- “UX design contract, not coded UI”;
- “structural validation passed”;
- “live implementation checks remain open”;
- “no ranking, lead, or revenue outcome has been established.”

Avoid “validated system,” “implementation-ready,” or “proven strategy” unless
the exact layer and evidence are named. If using a digest, bind the final files
and avoid self-referential receipts.
