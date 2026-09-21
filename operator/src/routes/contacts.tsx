import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ContactsView } from "@/components/contacts-view";

export const Route = createFileRoute("/contacts")({ component: ContactsPage });

function ContactsPage() {
  return (
    <Shell>
      <ContactsView />
    </Shell>
  );
}
