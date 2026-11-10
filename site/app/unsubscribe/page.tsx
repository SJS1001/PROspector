import { UnsubscribeForm } from "./unsubscribe-form";

type UnsubscribeProps = { searchParams?: Promise<{ token?: string | string[] }> };
const TOKEN = /^[A-Za-z0-9_-]{32,256}$/u;

/** Public unsubscribe page. It reads nothing: the token is checked only when the
 * recipient confirms, and every answer is the same generic message. */
export default async function UnsubscribePage({ searchParams }: UnsubscribeProps = {}) {
  const requested = searchParams ? (await searchParams).token : undefined;
  const token = typeof requested === "string" && TOKEN.test(requested) ? requested : "";
  return (
    <main className="unsubscribe-page">
      <section className="panel" aria-labelledby="unsubscribe-heading">
        <h1 id="unsubscribe-heading">Unsubscribe</h1>
        <p>Confirm below to stop further outreach to the address this link was sent to.</p>
        <UnsubscribeForm token={token} />
      </section>
    </main>
  );
}
