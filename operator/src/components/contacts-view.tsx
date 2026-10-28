import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mutationMessage, useRequestEnrichmentGrant, useWorkspace } from "@/lib/workspace";
import type { Contact } from "@/lib/domain/types";

export function ContactsView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Reading contacts…</p>;
  if (isError || !data) return <ErrorNote message="Contacts could not be loaded." />;

  const visible = data.contacts.filter((item) => item.prospectState === "approved");
  const hidden = data.contacts.length - visible.length;

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Enriched contacts only after approval"
        title="Contacts"
        copy="Explicitly search published pages for a mailbox. Paid contact reveal is unavailable in this release; guessed addresses stay suggestions."
      />

      {visible.length === 0 ? (
        <Panel className="p-8">
          <h2 className="font-display text-xl">No enriched contacts yet</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Approve a passed prospect in Review. Suggestions for that account then become visible
            here, still labelled as suggestions until a verified mailbox exists.
          </p>
          {hidden > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {hidden} synthetic suggestions remain hidden behind unapproved prospects.
            </p>
          ) : null}
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((item) => (
            <ContactCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <Panel className="p-6">
        <h2 className="text-lg font-medium">Next: outreach</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          After message approval, you can hand it to Gmail compose. Delivery is unconfirmed.
        </p>
        <Link to="/outreach" className="mt-4 inline-block">
          <Button variant="outline">Open outreach</Button>
        </Link>
      </Panel>
    </div>
  );
}

function ContactCard({ item }: { item: Contact }) {
  const grant = useRequestEnrichmentGrant();
  const suggestion = item.emailKind === "suggestion";
  const tone = suggestion ? "warn" : item.emailKind === "public_source" ? "lime" : "ok";

  return (
    <article className="rounded-[12px] border border-line bg-cream p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge tone={tone}>{item.emailKind.replace("_", " ")}</Badge>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{item.role}</span>
      </div>
      <h2 className="mt-3 font-display text-lg">{item.fullName}</h2>
      <p className="text-xs text-muted">{item.accountName}</p>
      <p className="mt-3 font-mono text-xs">{item.emailDisplay}</p>
      {item.phoneDisplay ? (
        <p className="mt-1 text-sm">
          <a className="text-teal underline" href={`tel:${item.phoneDisplay}`}>
            {item.phoneDisplay}
          </a>
          <span className="ml-2 text-2xs text-subtle">Opens your phone. PROspector does not place the call.</span>
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted">{item.source}</p>
      {item.publishedUrl ? (
        <p className="mt-1 break-all font-mono text-[11px] text-muted">{item.publishedUrl}</p>
      ) : null}
      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-subtle">
        Confidence {item.confidence}
      </p>
      {suggestion ? (
        <p className="mt-3 text-xs text-amber">
          Contact Suggestion — not sendable, not exportable. Run a public-source reveal to look for a published mailbox.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Public-source only. Mailbox not verified. Eligible for a message draft, not for CRM file export.
        </p>
      )}
      <Button
        className="mt-4"
        variant="outline"
        disabled={grant.isPending}
        onClick={() =>
          grant.mutate({
            prospectId: item.prospectId,
            reason: "Owner request for public-source reveal.",
          })
        }
      >
        {grant.isPending ? "Retrieving…" : "Run public-source reveal"}
      </Button>
      {grant.error ? <div className="mt-3"><ErrorNote message={mutationMessage(grant.error)} /></div> : null}
    </article>
  );
}
