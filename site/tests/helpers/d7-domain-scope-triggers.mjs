import { readFile } from "node:fs/promises";

// D-7 (owner-delegated decision 3, 2026-11-10): migration 0024 drops and
// recreates the five suppression-recheck triggers. This file states the only
// clauses 0024 may change. Every other character of each trigger must equal
// its source migration, which tests/migration-source-of-truth.test.mjs proves.
//
// - A confirmed-domain tombstone blocks an email contact point only when the
//   point's recorded whole-label domain scope (outreach_contact_point_domains)
//   holds the tombstone digest or one of its aliases. In the Message approval
//   and 0015-0017 triggers a point with no recorded scope is blocked by every
//   confirmed-domain tombstone (fail closed), and email work with no bound
//   email point is blocked too. Package approval, which grants no email
//   authority and precedes the recipient authority that records the scope,
//   defers an unscoped point to those rechecks.
// - In Package approval a Contact tombstone blocks only when it reaches every
//   bound channel ('all', or no bound point on another channel).
// - A Contact tombstone blocks only its own channel ('all' blocks both).
// - Suppression stop events defer to their tombstone, which carries the
//   channel and aliases; reply/bounce/pause stops are unchanged.
// - Company and Organization tombstones stay workspace-wide.

const MIGRATIONS = new URL("../../drizzle/", import.meta.url);

/** Trigger name -> source migration that last created it. */
export const D7_NARROWED_TRIGGER_SOURCES = Object.freeze({
  outreach_package_approval_current_guard: "0010_governed_outreach.sql",
  outreach_message_approval_current_guard: "0010_governed_outreach.sql",
  outreach_pre_call_receipt_scope_guard: "0015_governed-outreach-pre-call.sql",
  outreach_dispatch_attempt_preparation_scope_guard: "0016_governed-outreach-attempt-preparation.sql",
  outreach_dispatch_attempt_repreparation_guard: "0017_governed-outreach-preparation-recovery.sql",
});

/**
 * SQL that is true when a confirmed-domain tombstone `tomb` reaches the email
 * contact points bound to Package Version `pv` in workspace `workspace`.
 */
export function domainTombstoneReaches({ tomb, aliasName, pv, workspace, binding, observation, requireEmailPoint, failClosedWithoutScope = true, indent }) {
  const pad = " ".repeat(indent);
  // Package approval grants no email authority, so it defers a point with no
  // recorded scope to the Message approval and outbox rechecks, which fail
  // closed (PR 205 review: the scope is recorded beside the recipient
  // authority, which needs a Package approval first).
  const scopeMatch = [
    `EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain`,
    `${pad}      WHERE scope_domain.value=${tomb}.subject_digest`,
    `${pad}        OR EXISTS (SELECT 1 FROM json_each(${tomb}.alias_snapshot_json) ${aliasName} WHERE ${aliasName}.value=scope_domain.value)))`,
  ];
  const reach = [
    `${pad}EXISTS (SELECT 1 FROM outreach_artifact_bindings ${binding}`,
    `${pad}  JOIN contact_point_observations ${observation} ON ${observation}.id=${binding}.binding_id`,
    `${pad}  ${failClosedWithoutScope ? "LEFT JOIN" : "JOIN"} outreach_contact_point_domains point_domain ON point_domain.workspace_id=${workspace}`,
    `${pad}    AND point_domain.contact_point_digest=${observation}.contact_point_digest`,
    `${pad}  WHERE ${binding}.workspace_id=${workspace} AND ${binding}.artifact_kind='package_version'`,
    `${pad}    AND ${binding}.artifact_id=${pv} AND ${binding}.binding_kind='contact_observation'`,
    ...(failClosedWithoutScope
      ? [
        `${pad}    AND ${observation}.kind='email' AND (point_domain.id IS NULL`,
        `${pad}      OR EXISTS (SELECT 1 FROM json_each(point_domain.domain_digests_json) scope_domain`,
        `${pad}        WHERE scope_domain.value=${tomb}.subject_digest`,
        `${pad}          OR EXISTS (SELECT 1 FROM json_each(${tomb}.alias_snapshot_json) ${aliasName} WHERE ${aliasName}.value=scope_domain.value))))`,
      ]
      : [`${pad}    AND ${observation}.kind='email' AND ${scopeMatch.join("\n")}`]),
  ].join("\n");
  if (!requireEmailPoint) return reach;
  return [
    `${pad}NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings ${binding}`,
    `${pad}  JOIN contact_point_observations ${observation} ON ${observation}.id=${binding}.binding_id`,
    `${pad}  WHERE ${binding}.workspace_id=${workspace} AND ${binding}.artifact_kind='package_version'`,
    `${pad}    AND ${binding}.artifact_id=${pv} AND ${binding}.binding_kind='contact_observation'`,
    `${pad}    AND ${observation}.kind='email')`,
    `${pad}OR ${reach.trimStart()}`,
  ].join("\n");
}

const MESSAGE_PV = "(SELECT package_version_id FROM outreach_message_versions WHERE id=NEW.message_version_id AND workspace_id=NEW.workspace_id)";
const CONTACT_MATCH = "(s.subject_digest=c.identity_digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=c.identity_digest))";

function approvalReplacements(kind) {
  const pv = kind === "package" ? "NEW.package_version_id" : MESSAGE_PV;
  const domain = domainTombstoneReaches({
    tomb: "s", aliasName: "a", pv, workspace: "NEW.workspace_id", binding: "b", observation: "o",
    requireEmailPoint: kind === "message", failClosedWithoutScope: kind === "message", indent: 10,
  });
  const contactChannel = kind === "package"
    ? "(s.channel='all' OR NOT EXISTS (SELECT 1 FROM outreach_artifact_bindings b JOIN contact_point_observations o ON o.id=b.binding_id\n"
      + "          WHERE b.artifact_kind='package_version' AND b.artifact_id=pv.id AND b.binding_kind='contact_observation' AND o.kind<>s.channel))"
    : "s.channel IN ('email','all')";
  return [
    [
      "      AND s.effective_at<=NEW.created_at AND s.subject_kind IN ('organization','confirmed_email_domain')\n",
      "      AND s.effective_at<=NEW.created_at AND (s.subject_kind='organization'\n"
        + "        OR (s.subject_kind='confirmed_email_domain' AND (\n"
        + `${domain})))\n`,
      1,
    ],
    [
      `        OR (s.subject_kind='contact' AND ${CONTACT_MATCH})\n`,
      `        OR (s.subject_kind='contact' AND ${contactChannel}\n          AND ${CONTACT_MATCH})\n`,
      1,
    ],
  ];
}

function preparationReplacements() {
  const domain = domainTombstoneReaches({
    tomb: "suppression", aliasName: "alias", pv: "package_version.id", workspace: "item.workspace_id",
    binding: "binding", observation: "observation", requireEmailPoint: true, indent: 12,
  });
  return [
    [
      "          suppression.subject_kind IN ('company','organization','confirmed_email_domain')\n"
        + "          OR (suppression.subject_kind='contact' AND (\n",
      "          suppression.subject_kind IN ('company','organization')\n"
        + "          OR (suppression.subject_kind='confirmed_email_domain' AND (\n"
        + `${domain}))\n`
        + "          OR (suppression.subject_kind='contact' AND suppression.channel IN ('email','all') AND (\n",
      1,
    ],
    [
      "          stop.subject_kind IN ('company','organization','confirmed_email_domain')\n"
        + "          OR (stop.subject_kind='contact' AND stop.subject_digest=contact.identity_digest)\n",
      "          stop.subject_kind IN ('company','organization')\n"
        + "          OR (stop.subject_kind='confirmed_email_domain' AND stop.stop_kind<>'suppression')\n"
        + "          OR (stop.subject_kind='contact' AND stop.stop_kind<>'suppression' AND stop.subject_digest=contact.identity_digest)\n",
      1,
    ],
  ];
}

const REPLACEMENTS = Object.freeze({
  outreach_package_approval_current_guard: approvalReplacements("package"),
  outreach_message_approval_current_guard: approvalReplacements("message"),
  outreach_pre_call_receipt_scope_guard: preparationReplacements(),
  outreach_dispatch_attempt_preparation_scope_guard: preparationReplacements(),
  outreach_dispatch_attempt_repreparation_guard: preparationReplacements(),
});

export async function migrationStatements(filename) {
  const sql = await readFile(new URL(filename, MIGRATIONS), "utf8");
  return sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
}

export function triggerStatement(statements, name) {
  const matches = statements.filter((statement) => statement.startsWith(`CREATE TRIGGER ${name} `));
  if (matches.length !== 1) throw new Error(`${name}: expected one CREATE TRIGGER, found ${matches.length}`);
  return matches[0];
}

/**
 * The exact trigger text 0024 must create for each narrowed trigger: the
 * source text with only the D-7 clauses replaced. Throws if any expected
 * clause is missing or appears an unexpected number of times.
 */
export async function expectedNarrowedTriggers() {
  const expected = {};
  for (const [name, source] of Object.entries(D7_NARROWED_TRIGGER_SOURCES)) {
    let text = triggerStatement(await migrationStatements(source), name);
    for (const [from, to, count] of REPLACEMENTS[name]) {
      const found = text.split(from).length - 1;
      if (found !== count) throw new Error(`${name}: expected ${count} copies of a D-7 clause, found ${found}`);
      text = text.split(from).join(to);
    }
    expected[name] = text;
  }
  return expected;
}
