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
  const { extractText, publicationDate } = await server.ssrLoadModule(
    "/src/lib/server/retrieve.ts",
  );
  const { parseOpportunity } = await server.ssrLoadModule("/src/lib/server/opportunity.ts");
  const { opportunitySchema } = await server.ssrLoadModule("/src/lib/domain/opportunity.ts");
  const { opportunityRejection } = await server.ssrLoadModule("/src/lib/server/search-strategy.ts");
  await t.test("publication metadata is distinct from retrieval and modification dates", () => {
    assert.equal(
      publicationDate('<meta property="article:published_time" content="2026-06-10T12:00:00Z">'),
      "2026-06-10",
    );
    assert.equal(
      publicationDate(
        '<script type="application/ld+json">{"@graph":[{"datePublished":"2026-06-09"}]}</script>',
      ),
      "2026-06-09",
    );
    assert.equal(
      publicationDate('<meta property="article:modified_time" content="2026-10-29">'),
      null,
    );
    assert.equal(publicationDate('<time datetime="2026-02-31">bad</time>'), null);
    assert.equal(
      publicationDate('<time class="updated" datetime="2026-10-29">Updated</time>'),
      null,
    );
    assert.equal(
      publicationDate('<time class="published" datetime="2026-10-20">Published</time>'),
      "2026-10-20",
    );
    assert.equal(publicationDate("<p>Retrieved today</p>"), null);
  });
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
  await t.test("retains late operating sections of long financial reports within a bound", () => {
    const late = "Kansanshi cleaner recovery remains under investigation with plant trials continuing.";
    const report = extractText(`<article><p>${"Financial summary. ".repeat(1200)}</p><p>${late}</p><p>${"Appendix. ".repeat(7000)}</p></article>`);
    assert.ok(report.text.includes(late));
    assert.equal(report.text.length, 64_000);
  });
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
  await t.test(
    "new search needs an evidenced problem, specific decision and recent dated source",
    () => {
      const now = new Date("2026-10-29T18:00:00Z");
      const good = {
        ...parseOpportunity(JSON.stringify(draft), page, "ONE"),
        problem: {
          text: "Recovery remains unstable.",
          quote: "Recovery remains unstable at the plant.",
        },
        decisionFit: {
          decision: "Which ore blend causes recovery losses?",
          dataToCheck: "Lab and historian data, if available.",
        },
        problemStatus: "ongoing",
        publishedOn: "2026-09-01",
      };
      assert.equal(opportunityRejection(good, now), null);
      for (const invalid of [
        undefined,
        { ...good, problem: null },
        { ...good, decisionFit: null },
        { ...good, problemStatus: "needs_update" },
        { ...good, problemStatus: undefined },
        { ...good, publishedOn: null },
        { ...good, publishedOn: "2023-01-01" },
        { ...good, publishedOn: "2027-01-01" },
      ])
        assert.ok(opportunityRejection(invalid, now));
      const parsed = parseOpportunity(
        JSON.stringify({ ...draft, decisionFit: good.decisionFit, publishedOn: "2026-09-01" }),
        page,
        "ONE",
      );
      assert.equal(parsed.publishedOn, null, "model cannot invent publication metadata");
    },
  );
  await t.test("unsafe saved source links and malformed archive explanations are rejected", () => {
    const brief = parseOpportunity(JSON.stringify(draft), page, "ONE");
    assert.equal(
      opportunitySchema.safeParse({ ...brief, sourceUrl: "javascript:alert(1)" }).success,
      false,
    );
    assert.equal(opportunitySchema.safeParse({ ...brief, company: "bad" }).success, false);
  });
});
