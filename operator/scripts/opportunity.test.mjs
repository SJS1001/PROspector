import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createServer } from "vite";

test("opportunity explanations use article evidence and preserve uncertainty", async (t) => {
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": join(process.cwd(), "src") } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  t.after(() => server.close());
  const { extractText } = await server.ssrLoadModule("/src/lib/server/retrieve.ts");
  const { parseOpportunity } = await server.ssrLoadModule("/src/lib/server/opportunity.ts");
  const { opportunitySchema } = await server.ssrLoadModule("/src/lib/domain/opportunity.ts");
  const html = `<html><head><title>Plant &amp; technology</title></head><body><nav>Download Subscribe Recovery Expansion Plant Plant</nav><main><article><header>Share Subscribe</header><div class="entry-content"><p>Acme operates a copper concentrator in Chile.</p><p>The plant uses existing analytics to improve copper recovery and throughput.</p></div><aside>Related stories 2026</aside></article></main><footer>Cookie preferences</footer></body></html>`;
  const extracted = extractText(html);
  await t.test(
    "removes nested navigation and retains article paragraphs and decoded entities",
    () => {
      assert.equal(extracted.title, "Plant & technology");
      assert.equal(
        extracted.text,
        "Acme operates a copper concentrator in Chile. The plant uses existing analytics to improve copper recovery and throughput.",
      );
    },
  );
  const page = {
    ...extracted,
    url: "https://example.com/story",
    hash: "a".repeat(64),
    retrievedAt: "2026-10-29T19:00:00.000Z",
  };
  const draft = {
    company: {
      text: "Acme processes copper.",
      quote: "Acme operates a copper concentrator in Chile.",
    },
    situation: {
      text: "Existing analytics are improving recovery.",
      quote: "The plant uses existing analytics to improve copper recovery and throughput.",
    },
    problem: null,
    possibleFit: "If a decision remains slow despite existing analytics, ONE could investigate it.",
    nextQuestion: "Which decisions are still delayed?",
  };
  await t.test("successful technology use can leave the problem unconfirmed", () => {
    const brief = parseOpportunity(JSON.stringify(draft), page, "ONE");
    assert.equal(brief.problem, null);
    assert.equal(brief.sourceUrl, page.url);
    assert.equal(brief.sourceHash, page.hash);
    assert.ok(opportunitySchema.safeParse(brief).success);
  });
  await t.test("invented support, missing fields and raw URLs cannot become an explanation", () => {
    for (const invalid of [
      {
        ...draft,
        problem: {
          text: "They need ONE.",
          quote: "The plant has unresolved issues and is buying software.",
        },
      },
      { ...draft, company: null },
      { ...draft, nextQuestion: "Visit https://fake.example" },
      { ...draft, possibleFit: "x".repeat(401) },
      { ...draft, problem: undefined },
    ])
      assert.throws(() => parseOpportunity(JSON.stringify(invalid), page, "ONE"));
  });
  await t.test("unsafe saved source links and malformed archive explanations are rejected", () => {
    const brief = parseOpportunity(JSON.stringify(draft), page, "ONE");
    assert.equal(
      opportunitySchema.safeParse({ ...brief, sourceUrl: "javascript:alert(1)" }).success,
      false,
    );
    assert.equal(opportunitySchema.safeParse({ ...brief, company: "bad" }).success, false);
  });
});
