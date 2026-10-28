import { ImapFlow } from "imapflow";
import { jevClassifyInbox } from "@/lib/server/jev-tasks";
import { putSecret, resolveJev } from "@/lib/server/secrets";
import { idFor } from "@/lib/server/seed";
import type { Sql } from "@/lib/db";

const UNSUB = /unsubscrib|opt[ -]?out|remove me|do not contact|stop emailing/i;
const BOUNCE = /mailer-daemon|postmaster|mail delivery|undeliverable|delivery status notification/i;

type SentRow = { id: string; to_email: string; prospect_id: string; subject: string };

function kindFor(from: string, subject: string, body: string) {
  const blob = `${from} ${subject} ${body}`;
  if (BOUNCE.test(blob)) return "bounce" as const;
  if (UNSUB.test(blob)) return "unsubscribe" as const;
  return "reply" as const;
}

export async function scanGmailInbox(opts: { sql: Sql; userId: string; user: string; pass: string }) {
  const sent = await opts.sql<SentRow>`
    select id, to_email, prospect_id, subject from outreach_messages
    where user_id = ${opts.userId} and status = ${"sent"}
  `;
  if (sent.length === 0) {
    await putSecret(opts.sql, opts.userId, "inbox_scanned_at", new Date().toISOString());
    return { scanned: 0, matched: 0 };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
  });
  await client.connect();
  try {
    await client.mailboxOpen("INBOX");
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    let scanned = 0;
    let matched = 0;
    const jev = await resolveJev(opts.sql, opts.userId);
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      scanned += 1;
      const from = (msg.envelope?.from ?? []).map((item) => item.address ?? "").join(" ").toLowerCase();
      const subject = msg.envelope?.subject ?? "";
      const body = msg.source ? msg.source.toString("utf8").slice(0, 8_000) : "";
      let kind = kindFor(from, subject, body);
      if (jev.apiKey) {
        try {
          const judged = await jevClassifyInbox({
            apiKey: jev.apiKey,
            baseUrl: jev.baseUrl,
            from,
            subject,
            body,
          });
          if (judged && judged.confidence >= 0.55) kind = judged.kind;
        } catch {
          // Regex classification remains the fail-closed path.
        }
      }
      const target = sent.find((row) => {
        const email = row.to_email.toLowerCase();
        return from.includes(email) || body.toLowerCase().includes(email) || (row.subject && subject.includes(row.subject.slice(0, 40)));
      });
      if (!target) continue;
      const eventId = idFor(opts.userId, `evt:${target.id}:${kind}:imap`);
      const inserted = await opts.sql<{ id: string }>`
        insert into delivery_events (id, user_id, message_id, kind, note)
        values (
          ${eventId}, ${opts.userId}, ${target.id}, ${kind},
          ${`Inbox scan: ${kind} · ${subject.slice(0, 120)}`}
        )
        on conflict (id) do nothing
        returning id
      `;
      if (inserted.length === 0) continue;
      matched += 1;
      if (kind === "unsubscribe" || kind === "bounce") {
        await opts.sql`
          insert into suppressions (id, user_id, kind, value, reason)
          values (
            ${idFor(opts.userId, `sup:email:${target.to_email}`)},
            ${opts.userId}, ${"email"}, ${target.to_email.toLowerCase()},
            ${`${kind} detected in Gmail inbox`}
          )
          on conflict (user_id, kind, value) do nothing
        `;
        await opts.sql`
          update outreach_messages
          set status = ${"blocked"}, blocked_reason = ${`${kind} detected in inbox.`}
          where user_id = ${opts.userId} and prospect_id = ${target.prospect_id} and status in (${"draft"}, ${"approved"})
        `;
      }
    }
    await putSecret(opts.sql, opts.userId, "inbox_scanned_at", new Date().toISOString());
    return { scanned, matched };
  } finally {
    await client.logout().catch(() => undefined);
  }
}
