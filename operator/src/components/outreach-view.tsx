import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeading, Panel, ErrorNote } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mutationMessage,
  useAddSuppression,
  useApproveMessage,
  useApprovePackage,
  useOpenInGmail,
  usePrepareMessage,
  usePreparePackage,
  useRecordDeliveryEvent,
  useWorkspace,
} from "@/lib/workspace";
import type { Contact, OutreachMessage, OutreachPackage, Prospect, Suppression } from "@/lib/domain/types";

export function OutreachView() {
  const { data, isPending, isError } = useWorkspace();
  if (isPending) return <p className="text-sm text-muted">Reading outreach packages…</p>;
  if (isError || !data) return <ErrorNote message="Outreach could not be loaded." />;

  const approved = data.prospects.filter((item) => item.state === "approved");
  const packaged = new Set(data.packages.map((item) => item.prospectId));

  return (
    <div className="grid gap-6">
      <PageHeading
        eyebrow="Governed outreach"
        title="Packages, then messages, then Gmail"
        copy="Prepare and approve a package and message, then hand the approved message to Gmail compose. Delivery is not confirmed."
      />

      <Panel className="p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Sender</span>
        <h2 className="mt-2 text-lg font-medium">Your mailbox, your approval</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Open in Gmail creates a compose handoff after approval and a suppression recheck. You decide whether to send in Gmail.
        </p>
      </Panel>

      {approved.length === 0 ? (
        <Panel className="p-8">
          <h2 className="font-display text-xl">No approved prospects</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Approve a passed prospect in Review before a package can be prepared.
          </p>
          <Link to="/review" className="mt-4 inline-block">
            <Button variant="outline">Open review queue</Button>
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-4">
          <h2 className="font-display text-lg">Approved prospects</h2>
          {approved.map((item) => (
            <ApprovedProspectRow key={item.id} item={item} prepared={packaged.has(item.id)} />
          ))}
        </div>
      )}

      {data.packages.length > 0 ? (
        <div className="grid gap-4">
          <h2 className="font-display text-lg">Packages</h2>
          {data.packages.map((item) => (
            <PackageCard
              key={item.id}
              item={item}
              contacts={data.contacts.filter((contact) => contact.prospectId === item.prospectId)}
              messages={data.messages}
            />
          ))}
        </div>
      ) : null}

      {data.messages.length > 0 ? (
        <div className="grid gap-4">
          <h2 className="font-display text-lg">Messages</h2>
          {data.messages.map((item) => (
            <MessageCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {data.deliveryEvents.length > 0 ? (
        <Panel className="p-5">
          <h2 className="text-lg font-medium">Delivery events</h2>
          <ul className="mt-3 grid gap-2 text-sm text-muted">
            {data.deliveryEvents.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.kind} · {item.note}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <SuppressionPanel suppressions={data.suppressions} />
    </div>
  );
}

function ApprovedProspectRow({ item, prepared }: { item: Prospect; prepared: boolean }) {
  const prepare = usePreparePackage();
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-cream p-5">
      <div>
        <Badge tone="ok">Approved</Badge>
        <h3 className="mt-2 font-display text-lg">{item.accountName}</h3>
        <p className="text-xs text-muted">{item.targetName}</p>
      </div>
      <div className="grid gap-2">
        <Button
          disabled={prepare.isPending || prepared}
          onClick={() => prepare.mutate({ prospectId: item.id })}
        >
          {prepare.isPending ? "Preparing…" : prepared ? "Package prepared" : "Prepare package"}
        </Button>
        {prepare.error ? <ErrorNote message={mutationMessage(prepare.error)} /> : null}
      </div>
    </article>
  );
}

function PackageCard({ item, contacts, messages }: { item: OutreachPackage; contacts: Contact[]; messages: OutreachMessage[] }) {
  const approve = useApprovePackage();
  const draftMsg = usePrepareMessage();
  const draft = item.status === "draft";
  const eligible = contacts.filter((contact) => contact.emailKind !== "suggestion");
  return (
    <article className="grid gap-4 rounded-[12px] border border-line bg-cream p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">
            {item.accountName}
          </span>
          <h3 className="mt-2 font-display text-xl">{item.subject}</h3>
        </div>
        <Badge tone={draft ? "warn" : "ok"}>{item.status}</Badge>
      </header>
      <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{item.body}</p>
      <p className="break-all font-mono text-[11px] text-muted">Digest {item.digest}</p>
      <p className="text-xs text-muted">
        Package approval permits CRM eligibility only. Each email still needs its own approval.
      </p>
      <div className="flex flex-wrap gap-2">
        {draft ? (
          <Button disabled={approve.isPending} onClick={() => approve.mutate({ packageId: item.id, expectedDigest: item.digest })}>
            {approve.isPending ? "Approving…" : "Approve package"}
          </Button>
        ) : null}
      </div>
      {!draft ? (
        <div className="grid gap-2">
          <p className="text-xs text-muted">
            Draft a message only to a public-source or verified mailbox. Suggestions stay ineligible.
          </p>
          {eligible.length === 0 ? (
            <p className="text-xs text-amber">No eligible mailbox yet. Run a public-source reveal first.</p>
          ) : (
            eligible.map((contact) => {
              const handedOff = messages.some((message) => message.contactId === contact.id && ["handed_off", "handed_to_gmail", "sent"].includes(message.status));
              return <Button
                key={contact.id}
                variant="outline"
                disabled={draftMsg.isPending || handedOff}
                onClick={() => draftMsg.mutate({ packageId: item.id, contactId: contact.id })}
              >
                {handedOff ? `Already handed off: ${contact.emailDisplay}` : `Draft message to ${contact.emailDisplay}`}
              </Button>;
            })
          )}
        </div>
      ) : null}
      {approve.error || draftMsg.error ? (
        <ErrorNote message={mutationMessage(approve.error ?? draftMsg.error)} />
      ) : null}
    </article>
  );
}

function MessageCard({ item }: { item: OutreachMessage }) {
  const approve = useApproveMessage();
  const open = useOpenInGmail();
  const event = useRecordDeliveryEvent();
  const [ack, setAck] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  return (
    <article className="grid gap-3 rounded-[12px] border border-line bg-cream p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">{item.accountName}</span>
          <h3 className="mt-2 font-display text-lg">{item.subject}</h3>
          <p className="mt-1 font-mono text-xs">{item.toEmail}</p>
        </div>
        <Badge tone={item.status === "approved" || item.status === "handed_off" ? "ok" : item.status === "blocked" ? "danger" : "warn"}>
          {item.status === "handed_off" ? "Handed off · delivery unconfirmed" : item.status.replaceAll("_", " ")}
        </Badge>
      </header>
      <p className="whitespace-pre-wrap text-sm text-muted">{item.body}</p>
      <p className="break-all font-mono text-[11px] text-muted">Digest {item.digest}</p>
      {item.blockedReason ? <p className="text-xs text-muted">{item.blockedReason}</p> : null}
      {item.status === "draft" ? (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={ack}
            onChange={(event) => setAck(event.target.checked)}
          />
          <span>
            I acknowledge compliance guidance is advisory. This approval queues a Gmail compose handoff. It does not promise delivery.
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {item.status === "draft" ? (
          <Button
            disabled={approve.isPending || !ack}
            onClick={() => approve.mutate({ messageId: item.id, acknowledged: ack, expectedDigest: item.digest })}
          >
            Approve this message
          </Button>
        ) : null}
        {item.status === "approved" ? (
          <Button
            disabled={open.isPending}
            onClick={() => {
              setHandoffError(null);
              const popup = window.open("about:blank", "_blank");
              if (!popup) {
                setHandoffError("Allow popups to open Gmail, then try again.");
                return;
              }
              popup.opener = null;
              open.mutate(
                { messageId: item.id, expectedDigest: item.digest },
                {
                  onSuccess: (result) => {
                    if (!result.url) {
                      popup.close();
                      setHandoffError("No new Gmail handoff is available for this message.");
                      return;
                    }
                    try {
                      const destination = new URL(result.url);
                      if (destination.origin !== "https://mail.google.com") throw new Error("Invalid destination");
                      popup.location.replace(destination.href);
                    } catch {
                      popup.close();
                      setHandoffError("The Gmail handoff could not be opened.");
                    }
                  },
                  onError: () => popup.close(),
                },
              );
            }}
          >
            {open.isPending ? "Rechecking…" : "Open in Gmail"}
          </Button>
        ) : null}
        {item.status === "sent" || item.status === "handed_to_gmail" || item.status === "handed_off" ? (
          <>
            <Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ messageId: item.id, kind: "reply", note: "Owner recorded a reply." })}>
              Record reply
            </Button>
            <Button variant="outline" disabled={event.isPending} onClick={() => event.mutate({ messageId: item.id, kind: "bounce", note: "Owner recorded a bounce." })}>
              Record bounce
            </Button>
            <Button variant="danger" disabled={event.isPending} onClick={() => event.mutate({ messageId: item.id, kind: "unsubscribe", note: "Owner recorded unsubscribe." })}>
              Record unsubscribe
            </Button>
          </>
        ) : null}
      </div>
      {handoffError ? <ErrorNote message={handoffError} /> : null}
      {approve.error || open.error ? (
        <ErrorNote message={mutationMessage(approve.error ?? open.error)} />
      ) : null}
    </article>
  );
}

function SuppressionPanel({ suppressions }: { suppressions: Suppression[] }) {
  const add = useAddSuppression();
  const [kind, setKind] = useState("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  return (
    <Panel className="p-6">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">Hard stop</span>
      <h2 className="mt-2 font-display text-lg">Suppressions</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        An email or domain on this list overrides approval. Nothing is sent from this site either way.
      </p>
      <form
        className="mt-5 grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(
            { kind, value, reason },
            {
              onSuccess: () => {
                setValue("");
                setReason("");
              },
            },
          );
        }}
      >
        <label className="grid gap-1 text-xs text-muted">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="field"
          >
            <option value="email">Email</option>
            <option value="domain">Domain</option>
            <option value="phone">Phone</option>
            <option value="contact">Contact id</option>
            <option value="org">Organization</option>
            <option value="all">All outreach</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          {kind === "domain" ? "Domain" : "Email"}
          <input
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm text-ink"
            placeholder={kind === "domain" ? "example.com" : "name@example.com"}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Reason
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-11 rounded-[10px] border border-line bg-cream px-3 text-sm text-ink"
            placeholder="Why this suppression?"
          />
        </label>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? "Saving…" : "Add suppression"}
        </Button>
      </form>
      {add.error ? <div className="mt-3"><ErrorNote message={mutationMessage(add.error)} /></div> : null}
      {suppressions.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No suppressions recorded.</p>
      ) : (
        <ul className="mt-5 grid gap-2">
          {suppressions.map((item) => (
            <li key={item.id} className="rounded-[10px] border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="danger">{item.kind}</Badge>
                <span className="font-mono text-xs">{item.value}</span>
              </div>
              <p className="mt-2 text-xs text-muted">{item.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
