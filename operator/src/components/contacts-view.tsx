import { uiLabel } from "@/lib/domain/plain-language";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote, WorkspaceLoadError } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mutationMessage, useRequestEnrichmentGrant, useWorkspace } from "@/lib/workspace";
import type { Contact } from "@/lib/domain/types";

export function ContactsView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Reading contacts…</p>;
  if (isError || !data) return <WorkspaceLoadError message="Contacts could not be loaded." />;

  const visible = data.contacts.filter((item) => item.prospectState === "approved");

  return (
    <div className="grid gap-6">
      <PageHeading
        title="Contacts"
        action={
          visible.length ? (
            <Link to="/outreach">
              <Button variant="outline">Open outreach</Button>
            </Link>
          ) : undefined
        }
      />

      {visible.length === 0 ? (
        <Panel className="p-8">
          <h2 className="font-display text-xl">No contacts to review yet</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Approve a prospect to see its contacts.
          </p>
          <Link to="/review" className="mt-4 inline-block">
            <Button variant="outline">Review prospects</Button>
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-3">
          {visible.map((item) => (
            <ContactCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <details className="rounded-[12px] border border-line bg-cream p-5">
        <summary className="cursor-pointer text-sm font-medium">Contact sources</summary>
        <p className="mt-3 text-sm text-muted">
          Searches find publicly listed contact details. Paid contact lookups are unavailable.
        </p>
      </details>
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
        <Badge tone={tone}>{uiLabel(item.emailKind)}</Badge>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          {uiLabel(item.role)}
        </span>
      </div>
      <h2 className="mt-3 font-display text-lg">{item.fullName}</h2>
      <p className="text-xs text-muted">{item.accountName}</p>
      <p className="mt-3 break-all font-mono text-xs">{item.emailDisplay}</p>
      {item.phoneDisplay ? (
        <p className="mt-1 text-sm">
          <a className="text-teal underline" href={`tel:${item.phoneDisplay}`}>
            {item.phoneDisplay}
          </a>
          <span className="ml-2 text-2xs text-subtle">Opens your phone app.</span>
        </p>
      ) : null}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Source and confidence</summary>
        <p className="mt-2 text-xs text-muted">{item.source}</p>
        {item.publishedUrl ? (
          <p className="mt-1 break-all font-mono text-[11px] text-muted">{item.publishedUrl}</p>
        ) : null}
        <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-subtle">
          Confidence {item.confidence}
        </p>
      </details>
      {suggestion ? (
        <p className="mt-3 text-xs text-amber">Suggestion only. Cannot send or export.</p>
      ) : item.emailKind === "public_source" ? (
        <p className="mt-3 text-xs text-muted">
          Unverified email address. You can draft a message, but cannot export this contact.
        </p>
      ) : null}
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
        {grant.isPending ? "Retrieving…" : "Find published contact details"}
      </Button>
      {grant.error ? (
        <div className="mt-3">
          <ErrorNote message={mutationMessage(grant.error)} />
        </div>
      ) : null}
    </article>
  );
}
