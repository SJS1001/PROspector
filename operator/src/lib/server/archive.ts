import { createHash } from "node:crypto";
import type { Sql } from "../db";

/** Version 1 is the complete operator workspace schema from migrations 0002–0008.
 * Secrets, authentication, unspent grants, grant expiry authority, active leases
 * schedules and transient search progress are deliberately excluded. Spent enrichment history is retained. Operating budget is reset; approval timestamps and
 * delivery history are retained, but imported approvals cannot authorize sends. */
export const ARCHIVE_VERSION = 1;
const columns = {
  workspaces: "company_name company_legal interview_complete seeded_at",
  knowledge_items:
    "id question_id scope question proposed_answer confirmed_answer status evidence inference recommendation sort_order",
  market_proposals:
    "id title problem_match customer_type examples likely_buyer risks product_fit evidence decision decision_reason decided_at",
  prospects:
    "id account_name account_id target_name target_id offer_id score outcome state revision configuration_digest assessment_id assessment_json evidence_excerpt evidence_url evidence_tier evidence_date cooldown_until review_at material_signal last_reason created_at origin run_id fingerprint lane",
  review_commands: "id command_key operation_digest prospect_id decision reason created_at",
  contacts:
    "id prospect_id full_name role email_kind email_display source confidence published_url phone_display provider_id",
  profile_configurations: "id digest status snapshot_json created_at activated_at",
  prospecting_runs:
    "id configuration_digest trigger status candidate_count qualified_count terminal_reason started_at finished_at",
  signals:
    "id run_id prospect_id url title excerpt tier content_hash retrieved_at publication_date recency",
  product_configurations: "id digest status snapshot_json created_at activated_at",
  discovery_runs:
    "id configuration_digest trigger status proposal_count terminal_reason started_at finished_at",
  draft_plays:
    "id proposal_id title status notes created_at audience likely_buyer offer confirmed_at",
  outreach_packages: "id prospect_id status subject body digest approved_at created_at",
  suppressions: "id kind value reason created_at",
  enrichment_grants: "id prospect_id status reason created_at provider unit cost_cents spent_at",
  outreach_messages:
    "id package_id prospect_id contact_id to_email subject body digest status acknowledged gmail_url blocked_reason approved_at dispatched_at created_at",
  delivery_events: "id message_id kind note created_at",
  identity_merges: "id keep_id drop_id reason created_at",
  operating_state: "monthly_budget_cents spend_month spend_used_cents",
} as const;
type Table = keyof typeof columns;
type Row = Record<string, unknown>;
export type WorkspaceArchive = {
  format: "prospector-workspace";
  version: 1;
  sourceOwner: string;
  tables: Record<Table, Row[]>;
  checksum: string;
};
/** Transaction callback must pin all queries to one connection and roll back on throw. */
export interface ArchiveAdapter {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
}
const tables = Object.keys(columns) as Table[];
const names = (table: Table) => columns[table].split(" ");
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(object[k])}`)
    .join(",")}}`;
};
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const body = (a: WorkspaceArchive) => ({
  format: a.format,
  version: a.version,
  sourceOwner: a.sourceOwner,
  tables: a.tables,
});
const validText = (text: string) =>
  !text.includes("\u0000") &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
const validOwner = (owner: string) => {
  if (typeof owner !== "string" || !owner || owner.length > 1024 || !validText(owner))
    throw new Error("Invalid workspace owner");
};
const quote = (value: string) => `"${value}"`;

async function schema(sql: Sql) {
  const rows = await sql.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public'",
  );
  const result = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r]));
  const excludedTables = new Set([
    "_migrations",
    "user",
    "session",
    "account",
    "verification",
    "operator_secrets",
  ]);
  for (const row of rows)
    if (!(tables as string[]).includes(row.table_name) && !excludedTables.has(row.table_name))
      throw new Error(`Unsupported archive schema table: ${row.table_name}`);
  for (const table of tables)
    for (const col of ["user_id", ...names(table)]) {
      if (!result.has(`${table}.${col}`))
        throw new Error(`Archive schema unavailable: ${table}.${col}`);
    }
  for (const table of tables) {
    const allowed = new Set([
      "user_id",
      ...names(table),
      ...(table === "prospecting_runs" ? ["progress_json"] : []),
      ...(table === "outreach_messages"
        ? ["lease_until", "lease_token"]
        : table === "enrichment_grants"
          ? ["expires_at"]
          : []),
    ]);
    for (const r of rows)
      if (r.table_name === table && !allowed.has(r.column_name))
        throw new Error(`Unsupported archive schema: ${table}.${r.column_name}`);
  }
  return result;
}
function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  return value;
}
export async function exportWorkspaceArchive(
  owner: string,
  adapter: ArchiveAdapter,
): Promise<WorkspaceArchive> {
  validOwner(owner);
  return adapter.transaction(async (sql) => {
    await schema(sql);
    const data = {} as Record<Table, Row[]>;
    for (const table of tables) {
      const cols = names(table);
      const rows = await sql.query<Row>(
        `select ${cols.map(quote).join(", ")} from ${quote(table)} where user_id = $1${table === "enrichment_grants" ? " and spent_at is not null" : ""}`,
        [owner],
      );
      data[table] = rows
        .map((row) => Object.fromEntries(cols.map((key) => [key, plain(row[key])])))
        .sort((a, b) => canonical(a).localeCompare(canonical(b)));
    }
    if (data.workspaces.length !== 1) throw new Error("Workspace not found");
    const archive: WorkspaceArchive = {
      format: "prospector-workspace",
      version: 1,
      sourceOwner: owner,
      tables: data,
      checksum: "",
    };
    archive.checksum = hash(body(archive));
    await validateWorkspaceArchive(archive, sql);
    return archive;
  });
}

/** Checks the entire envelope, fields, database types, duplicates and live references before replacement. */
export async function validateWorkspaceArchive(
  input: unknown,
  sql: Sql,
): Promise<WorkspaceArchive> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid archive");
  const a = input as WorkspaceArchive;
  if (
    Object.keys(a).sort().join() !== "checksum,format,sourceOwner,tables,version" ||
    a.format !== "prospector-workspace" ||
    a.version !== ARCHIVE_VERSION
  )
    throw new Error("Unsupported archive format or version");
  validOwner(a.sourceOwner);
  if (
    !a.tables ||
    typeof a.tables !== "object" ||
    Array.isArray(a.tables) ||
    Object.keys(a.tables).sort().join() !== [...tables].sort().join()
  )
    throw new Error("Incomplete archive tables");
  if (
    typeof a.checksum !== "string" ||
    !/^[0-9a-f]{64}$/.test(a.checksum) ||
    hash(body(a)) !== a.checksum
  )
    throw new Error("Archive checksum mismatch");
  const types = await schema(sql);
  for (const table of tables) {
    const rows = a.tables[table];
    if (!Array.isArray(rows) || rows.length > 100000) throw new Error(`Invalid ${table} rows`);
    const ids = new Set<unknown>();
    for (const row of rows) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).sort().join() !== [...names(table)].sort().join()
      )
        throw new Error(`Invalid ${table} fields`);
      for (const col of names(table)) {
        const meta = types.get(`${table}.${col}`)!;
        const value = row[col];
        if (value === null) {
          if (meta.is_nullable !== "YES") throw new Error(`Missing ${table}.${col}`);
          continue;
        }
        const kind = meta.data_type;
        const ok =
          kind === "boolean"
            ? typeof value === "boolean"
            : kind === "integer"
              ? typeof value === "number" &&
                Number.isInteger(value) &&
                value >= -2147483648 &&
                value <= 2147483647
              : typeof value === "string" &&
                validText(value) &&
                (!kind.includes("timestamp") ||
                  (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
                    Number(value.slice(0, 4)) >= 1 &&
                    !Number.isNaN(Date.parse(value)) &&
                    new Date(value).toISOString() === value));
        if (!ok) throw new Error(`Invalid ${table}.${col}`);
      }
      if ("id" in row) {
        if (!row.id || ids.has(row.id)) throw new Error(`Duplicate ${table} id`);
        ids.add(row.id);
      }
    }
  }
  const enums: [Table, string, string[]][] = [
    ["knowledge_items", "status", ["pending", "proposed", "confirmed"]],
    ["market_proposals", "decision", ["open", "explore", "defer", "dismiss"]],
    [
      "prospects",
      "state",
      ["qualified", "approved", "rejected", "deferred", "assessed", "disqualified"],
    ],
    [
      "prospects",
      "outcome",
      ["Passed", "Failed", "NotQualified", "InsufficientEvidence", "Disqualified"],
    ],
    ["prospects", "origin", ["seed", "run"]],
    ["prospects", "lane", ["operating", "greenfield"]],
    ["review_commands", "decision", ["approve", "reject", "defer"]],
    ["contacts", "email_kind", ["suggestion", "verified", "public_source"]],
    ["profile_configurations", "status", ["draft", "active", "stale"]],
    ["product_configurations", "status", ["draft", "active", "stale"]],
    ["prospecting_runs", "status", ["queued", "running", "succeeded", "failed"]],
    ["discovery_runs", "status", ["queued", "running", "succeeded", "failed"]],
    ["draft_plays", "status", ["draft", "confirmed"]],
    ["outreach_packages", "status", ["draft", "approved"]],
    [
      "outreach_messages",
      "status",
      ["draft", "approved", "sending", "blocked", "sent", "handed_to_gmail", "handed_off"],
    ],
    [
      "delivery_events",
      "kind",
      [
        "bounce",
        "reply",
        "unsubscribe",
        "manual_handoff",
        "archive_restore_package",
        "archive_restore_message",
      ],
    ],
    ["enrichment_grants", "status", ["apollo", "zoominfo", "public_source"]],
    ["suppressions", "kind", ["email", "domain", "phone", "contact", "org", "all"]],
  ];
  for (const [table, field, values] of enums)
    for (const row of a.tables[table])
      if (!values.includes(row[field] as string)) throw new Error(`Invalid ${table}.${field}`);
  for (const row of a.tables.enrichment_grants)
    if (row.spent_at === null || (row.cost_cents as number) < 0)
      throw new Error("Invalid spent enrichment history");
  for (const row of a.tables.prospects) {
    let assessment: unknown;
    try {
      assessment = JSON.parse(row.assessment_json as string);
    } catch {
      throw new Error("Invalid assessment JSON");
    }
    if (!assessment || typeof assessment !== "object" || Array.isArray(assessment))
      throw new Error("Invalid assessment JSON");
    const data = assessment as Record<string, unknown>;
    if (
      typeof data.passRule !== "string" ||
      !(data.hardDisqualifier === null || typeof data.hardDisqualifier === "string") ||
      !Array.isArray(data.dimensions) ||
      data.dimensions.some(
        (d: unknown) =>
          !d ||
          typeof d !== "object" ||
          Array.isArray(d) ||
          typeof (d as Row).id !== "string" ||
          typeof (d as Row).label !== "string" ||
          typeof (d as Row).score !== "number" ||
          typeof (d as Row).max !== "number" ||
          typeof (d as Row).note !== "string",
      )
    )
      throw new Error("Invalid assessment JSON");
  }
  for (const table of ["profile_configurations", "product_configurations"] as const)
    for (const row of a.tables[table]) {
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(row.snapshot_json as string);
      } catch {
        throw new Error("Invalid configuration JSON");
      }
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot) ||
        [
          "company",
          "product",
          "promise",
          "play",
          "fit",
          "offerId",
          "passRule",
          "configurationFamily",
        ].some((key) => typeof (snapshot as Row)[key] !== "string")
      )
        throw new Error("Invalid configuration JSON");
    }
  if (
    a.tables.workspaces.length !== 1 ||
    a.tables.operating_state.length > 1 ||
    a.tables.profile_configurations.length > 1 ||
    a.tables.product_configurations.length > 1
  )
    throw new Error("Invalid singleton rows");
  const references: [Table, string, Table, boolean][] = [
    ["review_commands", "prospect_id", "prospects", false],
    ["contacts", "prospect_id", "prospects", false],
    ["prospects", "run_id", "prospecting_runs", true],
    ["signals", "run_id", "prospecting_runs", false],
    ["signals", "prospect_id", "prospects", true],
    ["draft_plays", "proposal_id", "market_proposals", false],
    ["outreach_packages", "prospect_id", "prospects", false],
    ["outreach_messages", "package_id", "outreach_packages", false],
    ["outreach_messages", "prospect_id", "prospects", false],
    ["enrichment_grants", "prospect_id", "prospects", false],
  ];
  for (const [from, col, to, nullable] of references) {
    const ids = new Set(a.tables[to].map((r) => r.id));
    for (const row of a.tables[from])
      if (!(nullable && row[col] === null) && !ids.has(row[col]))
        throw new Error(`Invalid reference ${from}.${col}`);
  }
  for (const [table, fields] of Object.entries({
    knowledge_items: ["question_id"],
    review_commands: ["command_key"],
    draft_plays: ["proposal_id"],
    outreach_packages: ["prospect_id"],
    suppressions: ["kind", "value"],
  }) as [Table, string[]][]) {
    const keys = new Set<string>();
    for (const row of a.tables[table]) {
      const key = canonical(fields.map((field) => row[field]));
      if (keys.has(key)) throw new Error(`Duplicate ${table} key`);
      keys.add(key);
    }
  }
  const messageIds = new Set(a.tables.outreach_messages.map((row) => row.id));
  const packageIds = new Set(a.tables.outreach_packages.map((row) => row.id));
  for (const event of a.tables.delivery_events) {
    const targets = event.kind === "archive_restore_package" ? packageIds : messageIds;
    if (!targets.has(event.message_id)) throw new Error("Invalid delivery event reference");
    if (event.kind === "archive_restore_package" || event.kind === "archive_restore_message") {
      let history: unknown;
      try {
        history = JSON.parse(event.note as string);
      } catch {
        throw new Error("Invalid restore history");
      }
      if (!history || typeof history !== "object" || Array.isArray(history))
        throw new Error("Invalid restore history");
      const record = history as Row;
      if (event.kind === "archive_restore_package") {
        if (Object.keys(record).join() !== "status" || record.status !== "approved")
          throw new Error("Invalid restore history");
      } else if (
        Object.keys(record).sort().join() !== "acknowledged,status" ||
        ![
          "draft",
          "approved",
          "sending",
          "blocked",
          "sent",
          "handed_to_gmail",
          "handed_off",
        ].includes(record.status as string) ||
        typeof record.acknowledged !== "boolean"
      )
        throw new Error("Invalid restore history");
    }
  }
  const packages = new Map(a.tables.outreach_packages.map((r) => [r.id, r]));
  const contactRows = new Map(a.tables.contacts.map((r) => [r.id, r]));
  for (const row of a.tables.outreach_messages) {
    if (packages.get(row.package_id)?.prospect_id !== row.prospect_id)
      throw new Error("Invalid message package relationship");
    const contact = contactRows.get(row.contact_id);
    if (contact && contact.prospect_id !== row.prospect_id)
      throw new Error("Invalid message contact relationship");
  }
  // A merged-away contact is a valid historical tombstone; arbitrary dangling IDs are not.
  const contacts = new Set(a.tables.contacts.map((r) => r.id));
  const tombstones = new Set(a.tables.identity_merges.map((r) => r.drop_id));
  // Merges are an event history: a contact can be rediscovered after deletion
  // and merged again, so cycles in the historical IDs are possible.
  for (const row of a.tables.identity_merges) {
    if (row.keep_id === row.drop_id || (!contacts.has(row.keep_id) && !tombstones.has(row.keep_id)))
      throw new Error("Invalid identity merge reference");
  }
  for (const row of a.tables.outreach_messages)
    if (!contacts.has(row.contact_id) && !tombstones.has(row.contact_id))
      throw new Error("Invalid message contact reference");
  return a;
}

export async function restoreWorkspaceArchive(
  owner: string,
  input: unknown,
  adapter: ArchiveAdapter,
  options: {
    signal?: AbortSignal;
    afterDelete?: () => void | Promise<void>;
    afterTable?: (table: string) => void | Promise<void>;
  } = {},
): Promise<void> {
  validOwner(owner);
  const check = () => {
    if (options.signal?.aborted) throw new Error("Archive restore aborted");
  };
  await adapter.transaction(async (sql) => {
    check();
    const a = await validateWorkspaceArchive(input, sql);
    check();
    const ids = new Map<string, string>();
    if (a.sourceOwner !== owner) {
      for (const table of tables)
        for (const row of a.tables[table])
          if (typeof row.id === "string")
            ids.set(
              row.id,
              createHash("sha256")
                .update(`archive:v1:${owner}:${a.sourceOwner}:${row.id}`)
                .digest("hex")
                .slice(0, 24),
            );
      const seededId = (user: string, slug: string) =>
        createHash("sha256").update(`prospector:${user}:${slug}`).digest("hex").slice(0, 24);
      // Stable sample identities must remain recognizable to seedMiningSample.
      for (const slug of [
        "nordic-engebø",
        "lundin-candelaria",
        "teck-hvc",
        "vale-voiseys",
        "boliden-aitik",
        "newmont-boddington",
        "greenfield-draft",
        "play-operating-plants",
        "play-projects",
        "play-marine",
        "profile",
        "product",
      ]) {
        for (const candidate of [
          slug,
          `assess:${slug}`,
          ...["champion", "economic_buyer", "validator"].map((role) => `contact:${slug}:${role}`),
        ]) {
          const oldId = seededId(a.sourceOwner, candidate);
          if (ids.has(oldId) || candidate.startsWith("assess:"))
            ids.set(oldId, seededId(owner, candidate));
        }
      }
      for (const row of a.tables.knowledge_items)
        ids.set(
          row.id as string,
          createHash("sha256")
            .update(`prospector:${owner}:${row.question_id}`)
            .digest("hex")
            .slice(0, 24),
        );
      // Retain stable historical tombstones for deleted contacts.
      for (const table of ["identity_merges", "outreach_messages"] as const)
        for (const row of a.tables[table])
          for (const key of table === "identity_merges" ? ["keep_id", "drop_id"] : ["contact_id"]) {
            const id = row[key];
            if (typeof id === "string" && !ids.has(id))
              ids.set(
                id,
                createHash("sha256")
                  .update(`archive:v1:${owner}:${a.sourceOwner}:${id}`)
                  .digest("hex")
                  .slice(0, 24),
              );
          }
    }
    // Match the ID used by prepareMessage after owner/package/contact remapping.
    if (a.sourceOwner !== owner)
      for (const row of a.tables.outreach_messages) {
        const packageId = ids.get(row.package_id as string) ?? row.package_id;
        const contactId = ids.get(row.contact_id as string) ?? row.contact_id;
        ids.set(
          row.id as string,
          createHash("sha256")
            .update(`prospector:${owner}:msg:${packageId}:${contactId}`)
            .digest("hex")
            .slice(0, 24),
        );
      }
    const refs: Record<string, string[]> = {
      prospects: ["run_id", "assessment_id"],
      review_commands: ["prospect_id"],
      contacts: ["prospect_id"],
      signals: ["run_id", "prospect_id"],
      draft_plays: ["proposal_id"],
      outreach_packages: ["prospect_id"],
      outreach_messages: ["package_id", "prospect_id", "contact_id"],
      delivery_events: ["message_id"],
      identity_merges: ["keep_id", "drop_id"],
      enrichment_grants: ["prospect_id"],
    };
    const transform = (table: Table, original: Row): Row => {
      const row = { ...original };
      for (const key of ["id", ...(refs[table] ?? [])])
        if (typeof row[key] === "string" && ids.has(row[key] as string))
          row[key] = ids.get(row[key] as string);
      if (table === "suppressions") {
        // Owner-entered values may be external IDs; only remap known contacts.
        if (row.kind === "contact" && typeof row.value === "string" && ids.has(row.value))
          row.value = ids.get(row.value);
        if (a.sourceOwner !== owner)
          row.id = createHash("sha256")
            .update(`prospector:${owner}:sup:${row.kind}:${row.value}`)
            .digest("hex")
            .slice(0, 24);
      }
      if (table === "outreach_messages") {
        if (["approved", "sending"].includes(row.status as string)) row.status = "blocked";
        row.acknowledged = false;
      }
      if (table === "outreach_packages" && row.status === "approved") row.status = "draft";
      if (table === "operating_state") row.monthly_budget_cents = 0;
      return row;
    };
    for (const [table, fields] of Object.entries({
      draft_plays: ["proposal_id"],
      outreach_packages: ["prospect_id"],
      suppressions: ["kind", "value"],
    }) as [Table, string[]][]) {
      const seen = new Set<string>();
      for (const original of a.tables[table]) {
        const row = transform(table, original);
        const key = canonical(fields.map((field) => row[field]));
        if (seen.has(key)) throw new Error(`Conflicting mapped ${table} key`);
        seen.add(key);
      }
    }
    // Preserve the exact prior authority as audit history before resetting it.
    // Package history points at its package; message history points at its message.
    const auditEvents: Row[] = [];
    for (const [table, kind] of [
      ["outreach_packages", "archive_restore_package"],
      ["outreach_messages", "archive_restore_message"],
    ] as const) {
      for (const original of a.tables[table]) {
        const normalized = transform(table, original);
        if (
          original.status === normalized.status &&
          (table !== "outreach_messages" || original.acknowledged === normalized.acknowledged)
        )
          continue;
        auditEvents.push({
          id: createHash("sha256")
            .update(`archive-history:v1:${owner}:${a.checksum}:${table}:${original.id}`)
            .digest("hex")
            .slice(0, 24),
          message_id: normalized.id,
          kind,
          note: JSON.stringify(
            table === "outreach_messages"
              ? { status: original.status, acknowledged: original.acknowledged }
              : { status: original.status },
          ),
          created_at: new Date().toISOString(),
        });
      }
    }
    // Recovery must never erase consumed manual effects. An older backup that
    // predates local terminal history is rejected atomically, not replayed.
    const terminalStatuses = ["handed_off", "handed_to_gmail", "sent"];
    const archivedMessages = a.tables.outreach_messages.map((row) =>
      transform("outreach_messages", row),
    );
    const archivedEvents = a.tables.delivery_events.map((row) => transform("delivery_events", row));
    const terminalMessages = await sql.query<Row>(
      "select id from outreach_messages where user_id = $1 and (status in ('handed_off', 'handed_to_gmail', 'sent') or dispatched_at is not null)",
      [owner],
    );
    const terminalEvents = await sql.query<Row>(
      "select message_id from delivery_events where user_id = $1 and kind = 'manual_handoff'",
      [owner],
    );
    for (const row of terminalMessages)
      if (
        !archivedMessages.some(
          (candidate) =>
            candidate.id === row.id &&
            (terminalStatuses.includes(candidate.status as string) ||
              candidate.dispatched_at !== null),
        )
      )
        throw new Error(
          "This backup predates recorded delivery or handoff history. Export the current workspace before recovery; restore cannot erase consumed handoffs.",
        );
    for (const row of terminalEvents)
      if (
        !archivedEvents.some(
          (candidate) =>
            candidate.message_id === row.message_id && candidate.kind === "manual_handoff",
        )
      )
        throw new Error(
          "This backup predates recorded handoff history. Restore cannot erase consumed handoffs.",
        );
    // Detect owner-crossing primary-key collisions before changing any rows.
    // Deleted target rows may be replaced, but existing suppressions survive.
    for (const table of tables) {
      if (!names(table).includes("id")) continue;
      const desired = [
        ...a.tables[table].map((row) => transform(table, row)),
        ...(table === "delivery_events" ? auditEvents : []),
      ];
      const seen = new Set<unknown>();
      for (const row of desired) {
        if (seen.has(row.id)) throw new Error(`Conflicting ${table} identities`);
        seen.add(row.id);
      }
      for (let offset = 0; offset < desired.length; offset += 500) {
        const batch = desired.slice(offset, offset + 500);
        const existing = await sql.query<Row>(
          `select id, user_id${table === "suppressions" ? ", kind, value" : ""} from ${quote(table)} where id in (${batch.map((_, i) => `$${i + 1}`).join(", ")})`,
          batch.map((row) => row.id),
        );
        for (const row of existing) {
          if (row.user_id !== owner)
            throw new Error(`Archive ${table} identity belongs to another workspace`);
          if (table === "suppressions") {
            const candidate = batch.find((item) => item.id === row.id)!;
            if (candidate.kind !== row.kind || candidate.value !== row.value)
              throw new Error("Archive suppression identity conflicts with existing suppression");
          }
        }
      }
    }
    check();
    // Preserve contact-specific opt-outs across replacement when a mailbox is known.
    const suppressedContacts = await sql.query<{ email_display: string; reason: string }>(
      "select c.email_display, s.reason from suppressions s join contacts c on c.user_id = s.user_id and c.id = s.value where s.user_id = $1 and s.kind = 'contact'",
      [owner],
    );
    const derivedSuppressions: { id: string; email: string; reason: string }[] = [];
    for (const contact of suppressedContacts) {
      const email = contact.email_display.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const id = createHash("sha256")
          .update(`prospector:${owner}:sup:email:${email}`)
          .digest("hex")
          .slice(0, 24);
        const archived = a.tables.suppressions
          .map((row) => transform("suppressions", row))
          .find((row) => row.id === id);
        if (archived && (archived.kind !== "email" || archived.value !== email))
          throw new Error("Derived suppression identity conflicts with archive suppression");
        const [existing] = await sql.query<Row>(
          "select user_id, kind, value from suppressions where id = $1",
          [id],
        );
        if (
          existing &&
          (existing.user_id !== owner || existing.kind !== "email" || existing.value !== email)
        )
          throw new Error("Derived suppression identity conflicts with an existing suppression");
        derivedSuppressions.push({ id, email, reason: contact.reason });
      }
    }
    check();
    for (const item of derivedSuppressions)
      await sql.query(
        "insert into suppressions (id, user_id, kind, value, reason) values ($1, $2, 'email', $3, $4) on conflict (user_id, kind, value) do nothing",
        [item.id, owner, item.email, item.reason],
      );
    for (const table of [...tables].reverse().filter((table) => table !== "suppressions")) {
      check();
      await sql.query(`delete from ${quote(table)} where user_id = $1`, [owner]);
    }
    await options.afterDelete?.();
    check();
    // Disable the schedule without retrieving or changing any stored credentials.
    await sql.query(
      "update operator_secrets set value = '0' where user_id = $1 and name = 'schedule_enabled'",
      [owner],
    );
    for (const table of tables) {
      for (const original of a.tables[table]) {
        check();
        const row = transform(table, original);
        const cols = ["user_id", ...names(table)];
        await sql.query(
          `insert into ${quote(table)} (${cols.map(quote).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})${table === "suppressions" ? " on conflict (user_id, kind, value) do nothing" : ""}`,
          [owner, ...names(table).map((key) => row[key])],
        );
      }
      await options.afterTable?.(table);
      check();
    }
    for (const event of auditEvents) {
      check();
      await sql.query(
        "insert into delivery_events (id, user_id, message_id, kind, note, created_at) values ($1, $2, $3, $4, $5, $6)",
        [event.id, owner, event.message_id, event.kind, event.note, event.created_at],
      );
    }
    await sql.query(
      "insert into operating_state (user_id, monthly_budget_cents) values ($1, 0) on conflict (user_id) do nothing",
      [owner],
    );
    check();
  });
}
