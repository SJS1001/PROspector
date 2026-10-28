import { createHash } from "node:crypto";
import type { Sql } from "../db";

// One current eligibility predicate for draft, approval, handoff and CSV.
// All joins include ownership; all suppression scopes win before data leaves.
const eligible = `p.user_id = $1 and p.status = 'approved' and p.approved_at is not null
  and r.state = 'approved' and r.outcome = 'Passed'
  and c.email_kind in ('verified', 'public_source')
  and c.email_display ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$'
  and lower(c.email_display) not like '%.invalid'
  and c.source <> '' and c.published_url ~ '^https?://'
  and not exists (select 1 from suppressions s where s.user_id = $1 and (
    s.kind = 'all'
    or (s.kind = 'email' and lower(trim(s.value)) = lower(trim(c.email_display)))
    or (s.kind = 'domain' and lower(trim(s.value)) = split_part(lower(c.email_display), '@', 2))
    or (s.kind = 'contact' and s.value = c.id)
    or (s.kind = 'org' and lower(trim(s.value)) = lower(trim(r.account_name)))
    or (s.kind = 'phone' and coalesce(c.phone_display, '') <> ''
      and regexp_replace(s.value, '[^0-9]', '', 'g') = regexp_replace(c.phone_display, '[^0-9]', '', 'g'))))`;
const joins = `from outreach_packages p
  join prospects r on r.id = p.prospect_id and r.user_id = p.user_id
  join contacts c on c.prospect_id = r.id and c.user_id = p.user_id`;
type Candidate = {
  package_id: string;
  prospect_id: string;
  contact_id: string;
  package_digest: string;
  package_approved_at: string;
  to_email: string;
  subject: string;
  body: string;
};
const fields = `p.id as package_id, p.prospect_id, c.id as contact_id, p.digest as package_digest,
  p.approved_at::text as package_approved_at, c.email_display as to_email, p.subject, p.body`;
export function packageDigest(subject: string, body: string, prospectId: string) {
  return createHash("sha256").update(JSON.stringify({ subject, body, prospectId })).digest("hex");
}
export function messageDigest(row: Candidate) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}
function assertPackage(row: Candidate | undefined): asserts row is Candidate {
  if (!row || row.package_digest !== packageDigest(row.subject, row.body, row.prospect_id)) {
    throw new Error(
      "The package or contact is no longer eligible. Review current approvals and suppression.",
    );
  }
}
export async function prepareManualMessage(
  sql: Sql,
  userId: string,
  packageId: string,
  contactId: string,
  id: string,
) {
  const [row] = await sql.query<Candidate>(
    `select ${fields} ${joins} where ${eligible} and p.id = $2 and c.id = $3`,
    [userId, packageId, contactId],
  );
  assertPackage(row);
  const digest = messageDigest(row);
  // The same snapshot and eligibility are checked again by the write. Terminal
  // handoffs never become drafts again, including legacy sent/compose states.
  const changed = await sql.query(
    `insert into outreach_messages
    (id, user_id, package_id, prospect_id, contact_id, to_email, subject, body, digest, status)
    select $4, $1, p.id, p.prospect_id, c.id, c.email_display, p.subject, p.body, $5, 'draft'
    ${joins} where ${eligible} and p.id = $2 and c.id = $3
      and p.digest = $6 and p.approved_at::text = $7 and c.email_display = $8 and p.subject = $9 and p.body = $10
    on conflict (id) do update set to_email = excluded.to_email, subject = excluded.subject,
      body = excluded.body, digest = excluded.digest, status = 'draft', acknowledged = false,
      approved_at = null, gmail_url = null, blocked_reason = null
    where outreach_messages.user_id = $1
      and outreach_messages.package_id = excluded.package_id
      and outreach_messages.prospect_id = excluded.prospect_id
      and outreach_messages.contact_id = excluded.contact_id
      and outreach_messages.status in ('draft', 'approved', 'blocked')
      and outreach_messages.dispatched_at is null
      and not exists (select 1 from delivery_events e where e.user_id = $1 and e.message_id = $4 and e.kind = 'manual_handoff')
    returning id`,
    [
      userId,
      packageId,
      contactId,
      id,
      digest,
      row.package_digest,
      row.package_approved_at,
      row.to_email,
      row.subject,
      row.body,
    ],
  );
  if (!changed.length)
    throw new Error(
      "This message was already handed off or eligibility changed. It cannot be reset.",
    );
}
const messageJoins = `${joins} join outreach_messages m on m.package_id = p.id
  and m.user_id = p.user_id and m.prospect_id = r.id and m.contact_id = c.id`;
const exactMessage = `m.to_email = c.email_display and m.subject = p.subject and m.body = p.body`;
async function currentMessage(sql: Sql, userId: string, messageId: string, expectedDigest: string) {
  const [row] = await sql.query<Candidate & { digest: string; status: string }>(
    `select ${fields}, m.digest, m.status ${messageJoins} where ${eligible} and ${exactMessage} and m.id = $2`,
    [userId, messageId],
  );
  assertPackage(row);
  // Explicit field selection keeps the hash independent of extra SQL columns.
  const snapshot: Candidate = {
    package_id: row.package_id,
    prospect_id: row.prospect_id,
    contact_id: row.contact_id,
    package_digest: row.package_digest,
    package_approved_at: row.package_approved_at,
    to_email: row.to_email,
    subject: row.subject,
    body: row.body,
  };
  if (row.digest !== expectedDigest || row.digest !== messageDigest(snapshot)) {
    throw new Error(
      "This message or package approval changed. Prepare and approve the exact current draft.",
    );
  }
  return row;
}
export async function approveManualMessage(
  sql: Sql,
  userId: string,
  messageId: string,
  expectedDigest: string,
) {
  const row = await currentMessage(sql, userId, messageId, expectedDigest);
  const changed = await sql.query(
    `update outreach_messages target set status = 'approved', acknowledged = true, approved_at = now()
    where target.user_id = $1 and target.id = $2 and target.digest = $3
      and target.to_email = $6 and target.subject = $7 and target.body = $8
      and target.package_id = $9 and target.prospect_id = $10 and target.contact_id = $11 and target.status in ('draft', 'approved') and target.dispatched_at is null
    and not exists (select 1 from delivery_events e where e.user_id = $1 and e.message_id = $2 and e.kind = 'manual_handoff')
    and exists (select 1 ${messageJoins} where ${eligible} and ${exactMessage} and m.id = target.id
      and m.digest = $3 and p.digest = $4 and p.approved_at::text = $5 and m.to_email = $6 and m.subject = $7 and m.body = $8)
    returning id`,
    [
      userId,
      messageId,
      expectedDigest,
      row.package_digest,
      row.package_approved_at,
      row.to_email,
      row.subject,
      row.body,
      row.package_id,
      row.prospect_id,
      row.contact_id,
    ],
  );
  if (!changed.length)
    throw new Error("Approval refused: message already handed off or eligibility changed.");
}
export async function handoffManualMessage(
  sql: Sql,
  userId: string,
  messageId: string,
  expectedDigest: string,
): Promise<string | null> {
  const row = await currentMessage(sql, userId, messageId, expectedDigest);
  if (row.status === "handed_off") return null;
  if (row.status !== "approved")
    throw new Error("Approve this exact message before opening Gmail.");
  // This statement is the handoff linearization point. Only its CAS winner gets
  // a URL; a lost response stays unconfirmed and is never automatically replayed.
  const claimed = await sql.query(
    `with claimed as (
    update outreach_messages target set status = 'handed_off', gmail_url = null,
      lease_until = null, lease_token = null,
      blocked_reason = 'Manual compose handoff recorded. Delivery is unconfirmed; do not retry automatically.'
    where target.user_id = $1 and target.id = $2 and target.digest = $3
      and target.to_email = $6 and target.subject = $7 and target.body = $8
      and target.package_id = $9 and target.prospect_id = $10 and target.contact_id = $11 and target.status = 'approved'
      and target.acknowledged = true and target.approved_at is not null and target.dispatched_at is null
      and not exists (select 1 from delivery_events e where e.user_id = $1 and e.message_id = $2 and e.kind = 'manual_handoff')
      and exists (select 1 ${messageJoins} where ${eligible} and ${exactMessage} and m.id = target.id
        and m.digest = $3 and p.digest = $4 and p.approved_at::text = $5 and m.to_email = $6 and m.subject = $7 and m.body = $8)
    returning target.id)
    insert into delivery_events (id, user_id, message_id, kind, note)
    select 'manual-handoff:' || id, $1, id, 'manual_handoff', 'Compose handoff recorded; delivery unconfirmed.' from claimed
    returning message_id`,
    [
      userId,
      messageId,
      expectedDigest,
      row.package_digest,
      row.package_approved_at,
      row.to_email,
      row.subject,
      row.body,
      row.package_id,
      row.prospect_id,
      row.contact_id,
    ],
  );
  if (!claimed.length) return null;
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: row.to_email,
    su: row.subject,
    body: row.body,
  });
  return `https://mail.google.com/mail/?${params}`;
}
export function csvCell(value: unknown) {
  const text = String(value ?? "").replaceAll("\0", "");
  // Spreadsheet engines can ignore leading whitespace/control characters.
  let probe = text.trimStart();
  while (probe.length && probe.charCodeAt(0) < 32) probe = probe.slice(1).trimStart();
  const safe = /^[=+\-@]/u.test(probe) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function eligibleCrmContacts(sql: Sql, userId: string) {
  // JSON framing preserves leading U+FEFF that PGlite strips from plain text fields.
  const rows = await sql.query<{
    prospect_id: string;
    contact_id: string;
    account_name: string;
    full_name: string;
    role: string;
    email: string;
    phone: string;
    source: string;
    subject: string;
    body: string;
    digest: string;
  }>(
    `select p.prospect_id, c.id as contact_id, r.account_name, to_json(c.full_name) as full_name, c.role, c.email_display as email,
      coalesce(c.phone_display, '') as phone, c.source, p.subject, p.body, p.digest ${joins}
      where ${eligible} order by p.prospect_id, c.id`,
    [userId],
  );
  return rows.filter((row) => row.digest === packageDigest(row.subject, row.body, row.prospect_id));
}
export async function manualCrmCsv(sql: Sql, userId: string) {
  const rows = await eligibleCrmContacts(sql, userId);
  const header = "prospect_id,contact_id,account_name,full_name,role,email,phone,source";
  return (
    [
      header,
      ...rows.map((row) =>
        [
          row.prospect_id,
          row.contact_id,
          row.account_name,
          row.full_name,
          row.role,
          row.email,
          row.phone,
          row.source,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
