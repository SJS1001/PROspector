import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// The parent owns process/database lifecycle and both outbound network fences.
// Every product transition below goes through the rendered owner interface.
export const fictionalAnswers = [
  "Fictional Quarry",
  "Fictional Plant Diagnostic",
  "A fictional, owner-led diagnostic of processing plant recovery and throughput constraints.",
  "No autonomous controls, invented savings, borrowed proof, or guaranteed results.",
  "An eight-week fictional diagnostic delivered by Fictional Person with plant-owner supervision.",
  "Only labelled fictional evidence; no real customer proof or performance result is established.",
  "Assess recovery and throughput constraints; never promise a guaranteed financial or operational result.",
  "Fictional Person owns commercial truth and confirms every change.",
  "Explicit manual discovery and HTTPS retrieval through instrumented fictional stubs; no silent failover.",
  "English-language operating processing plants with documented recovery or throughput constraints.",
  "Operating plants with pain and timing signals; exploration-only and greenfield-only sites are disqualified.",
  "Plant champion, GM and VP Processing are suggestions until a published mailbox exists.",
  "Retrieved company pages and regulators; no directories, invented evidence, or private data.",
  "Fictional English-language operating plants only.",
  "Manual owner-triggered runs only, America/Toronto; no automatic work.",
  "I acknowledge guidance is advisory; exact approval and suppression checks remain required.",
];

export { parseCsv } from "./csv.mjs";
import { parseCsvBytes } from "./csv.mjs";

export async function downloadCsv(page, expectedEmails, validateRows = () => {}) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CRM CSV", exact: true }).click();
  const download = await pending;
  assert.match(download.suggestedFilename(), /\.csv$/);
  const stream = await download.createReadStream();
  assert.ok(stream, "Browser download must expose its actual bytes");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const rows = parseCsvBytes(bytes);
  assert.deepEqual(rows[0], [
    "prospect_id",
    "contact_id",
    "account_name",
    "full_name",
    "role",
    "email",
    "phone",
    "source",
  ]);
  assert.equal(
    rows.length,
    expectedEmails.length + 1,
    "Only current eligible contacts may be exported",
  );
  for (const row of rows.slice(1)) {
    assert.equal(row.length, 8);
    assert.ok(row[0] && row[1], "Stable prospect and contact identity must be present");
    assert.equal(row[2], "Fictional Quarry");
    assert.match(row[7], /Published on https:\/\/fictionalquarry\.example\//);
    assert.doesNotMatch(row.join(" "), /suggestion\.invalid|password|api[_ -]?key/i);
    for (const cell of row)
      assert.doesNotMatch(cell.trimStart(), /^[=+\-@]/, "No executable spreadsheet formula");
  }
  assert.deepEqual(
    rows
      .slice(1)
      .map((row) => row[5])
      .sort(),
    [...expectedEmails].sort(),
  );
  validateRows(rows.slice(1));
  const identities = rows.slice(1).map((row) => `${row[0]}:${row[1]}`);
  assert.equal(new Set(identities).size, identities.length);
  return {
    filename: download.suggestedFilename(),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rows: rows.length - 1,
    identities,
  };
}

export async function runWorkflow({
  context,
  page,
  origin,
  password,
  restart,
  snapshot,
  mutateFixture,
  assertIdle,
  evidence = {},
}) {
  page.setDefaultTimeout(30_000);
  const task = () => page.locator("#operator-task");
  const go = async (route) => {
    await page.goto(`${origin}${route}`);
    await task().waitFor();
  };
  const visible = async (locator) => {
    await locator.waitFor({ state: "visible" });
  };
  const click = async (name) => page.getByRole("button", { name, exact: true }).click();
  const unlock = async () => {
    await page.goto(origin);
    await page.getByLabel("Owner password").or(task()).first().waitFor();
    if (await page.getByLabel("Owner password").isVisible()) {
      await page.getByLabel("Owner password").fill(password);
      await click("Unlock workspace");
      await task().waitFor();
    }
  };
  console.log("Browser checkpoint: owner unlock");
  await unlock();
  await go("/knowledge");
  for (let index = 0; index < fictionalAnswers.length; index++) {
    await visible(task().getByText(new RegExp(`^Question ${index + 1} ·`)));
    await task()
      .getByRole("textbox", { name: /^Answer/ })
      .fill(fictionalAnswers[index]);
    await click("Submit answer for confirmation");
    await click("Confirm submitted answer");
  }
  await visible(page.getByText("Confirmed knowledge is in force.", { exact: true }));
  console.log("Browser checkpoint: interview confirmed");
  evidence.interview = { submitted: 16, confirmed: 16, fictional: true };

  await go("/discovery");
  await click("Activate product configuration");
  await click("Confirm");
  await visible(page.getByRole("button", { name: "Discover markets", exact: true }));
  // Exercise the explicit manual discovery control as well as initial activation.
  await click("Discover markets");
  await click("Confirm");
  const proposal = task()
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "Explore", exact: true }) })
    .first();
  await visible(proposal);
  await proposal
    .getByLabel("Reason", { exact: true })
    .fill("Fictional evidence fits the confirmed diagnostic capability.");
  await proposal.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByLabel("Audience", { exact: true }).fill("Fictional operating processing plants");
  await page.getByLabel("Likely buyer", { exact: true }).fill("Fictional Person, plant GM");
  await page.getByLabel("Offer", { exact: true }).fill("eight-week-diagnostic");
  await click("Confirm draft play");
  await visible(page.getByText(/Audience: Fictional operating processing plants/));
  console.log("Browser checkpoint: discovery confirmed");
  evidence.discovery = { productActivated: true, manualRun: true, draftPlayConfirmed: true };

  const csvEvidence = [];
  let lastHuntAt = 0;
  for (const cycle of [1, 2]) {
    console.log(`Browser checkpoint: workflow ${cycle} prospects`);
    await go("/prospects");
    if (cycle === 1) await click("Activate profile configuration");
    else {
      const remaining = 20_100 - (Date.now() - lastHuntAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      await click("Find Prospects");
    }
    lastHuntAt = Date.now();
    await click("Confirm");
    try {
      await visible(task().getByText(`Fictional Plant ${cycle}`, { exact: true }));
    } finally {
      const text = await task().innerText();
      evidence.prospectProbe = {
        cycle,
        plantOne: await task().getByText("Fictional Plant 1", { exact: true }).count(),
        plantTwo: await task().getByText("Fictional Plant 2", { exact: true }).count(),
        alerts: await page.getByRole("alert").count(),
        alertMessages: (await page.getByRole("alert").allTextContents()).map((text) =>
          text === "item.startedAt.startsWith is not a function" ? text : "unclassified-ui-error",
        ),
        classifications: [
          "Unreviewed fictional prompt",
          "Unknown fictional page",
          "retrieval failed",
          "already in this workspace",
          "succeeded",
          "failed",
        ].filter((value) => text.includes(value)),
      };
    }
    await go("/review");
    const review = task()
      .locator("article")
      .filter({ hasText: `Fictional Plant ${cycle}` });
    await visible(review);
    await review
      .getByLabel("Reason", { exact: true })
      .fill(
        "Fictional retrieved evidence passes the application rubric and fits the confirmed profile.",
      );
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await review.waitFor({ state: "detached" });

    console.log(`Browser checkpoint: workflow ${cycle} contacts`);
    await go("/contacts");
    const email = `person${cycle}@fictionalquarry.example`;
    // Suggestions share their account label. Click their actual UI controls until
    // the current prospect's published source appears; never insert a contact.
    const reveals = page.getByRole("button", { name: "Run public-source reveal", exact: true });
    const revealCount = await reveals.count();
    for (let index = 0; index < revealCount; index++) {
      if (await task().getByText(email, { exact: true }).isVisible()) break;
      const response = page.waitForResponse(
        (item) => item.request().method() === "POST" && new URL(item.url()).origin === origin,
      );
      await reveals.nth(index).click();
      await (await response).finished();
      await page.reload();
      await visible(task().getByRole("heading", { name: "Contacts", exact: true }));
    }
    await visible(task().getByText(email, { exact: true }));
    await go("/outreach");
    const approved = task()
      .locator("article")
      .filter({ hasText: `Fictional Plant ${cycle}` });
    await approved.getByRole("button", { name: "Prepare package", exact: true }).click();
    const packageCard = task()
      .locator("article")
      .filter({ has: page.getByRole("button", { name: "Approve package", exact: true }) });
    await visible(packageCard);
    assert.match(await packageCard.innerText(), /Digest [a-f0-9]{64}/);
    await packageCard.getByRole("button", { name: "Approve package", exact: true }).click();
    await click(`Draft message to ${email}`);
    const message = task()
      .locator("article")
      .filter({ has: page.getByText(email, { exact: true }) });
    await visible(message);
    assert.match(await message.innerText(), /Digest [a-f0-9]{64}/);
    const subject = await message.getByRole("heading", { level: 3 }).innerText();
    const body = await message.locator("p.whitespace-pre-wrap").innerText();
    assert.equal(
      await message.getByRole("button", { name: "Approve this message", exact: true }).isDisabled(),
      true,
    );
    await message.getByRole("checkbox").check();
    await message.getByRole("button", { name: "Approve this message", exact: true }).click();
    let stale;
    if (cycle === 2) {
      assert.equal(
        typeof mutateFixture,
        "function",
        "Parent must provide stopped-database fictional fixture mutation",
      );
      const approvedTab = async () => {
        const tab = await context.newPage();
        await tab.goto(`${origin}/outreach`);
        await tab
          .locator("article")
          .filter({ has: tab.getByText(email, { exact: true }) })
          .getByRole("button", { name: "Open in Gmail", exact: true })
          .waitFor();
        return tab;
      };
      const rejectStaleHandoff = async (tab) => {
        const gmailRequests = [];
        const record = (request) => {
          if (request.url().startsWith("https://mail.google.com/"))
            gmailRequests.push(request.url());
        };
        context.on("request", record);
        try {
          const popupPromise = context.waitForEvent("page");
          await tab.getByRole("button", { name: "Open in Gmail", exact: true }).click();
          const blank = await popupPromise;
          const alert = tab
            .getByRole("alert")
            .filter({ hasText: /Approve|changed|eligible|review/i });
          await alert.waitFor();
          assert.deepEqual(gmailRequests, [], "Changed authority must refuse Gmail navigation");
          assert.equal(blank.isClosed(), true, "Denied handoff closes its reserved popup");
        } finally {
          context.off("request", record);
          await tab.close();
        }
      };
      // These parent callbacks alter only the disposable acceptance database.
      // They are test fault injection, never a production reset/retry path.
      const invalidatedTab = await approvedTab();
      await mutateFixture("invalidate-message");
      await rejectStaleHandoff(invalidatedTab);
      await page.reload();
      await click(`Draft message to ${email}`);
      await message.getByRole("checkbox").check();
      await message.getByRole("button", { name: "Approve this message", exact: true }).click();
      const suppressedTab = await approvedTab();
      await mutateFixture("add-probe-suppression");
      try {
        await rejectStaleHandoff(suppressedTab);
        // Suppression after approval must also remove the recipient from CSV.
        await go("/settings");
        evidence.suppressionBeforeHandoff = {
          denied: true,
          newGmailRequests: 0,
          csv: await downloadCsv(page, ["person1@fictionalquarry.example"]),
        };
      } finally {
        // Removes only the exact harness-created probe; ordinary suppressions
        // cannot be removed by this browser workflow or production interface.
        await mutateFixture("remove-probe-suppression");
      }
      await go("/outreach");
      evidence.changedAfterApproval = {
        denied: true,
        freshDraftAndApprovalRequired: true,
        newGmailRequests: 0,
      };
      stale = await context.newPage();
      await stale.goto(`${origin}/outreach`);
      await stale
        .locator("article")
        .filter({ has: stale.getByText(email, { exact: true }) })
        .getByRole("button", { name: "Open in Gmail", exact: true })
        .waitFor();
    }
    console.log(`Browser checkpoint: workflow ${cycle} handoff`);
    const popupPromise = context.waitForEvent("page");
    const composePromise = context.waitForEvent("request", {
      predicate: (request) => request.url().startsWith("https://mail.google.com/"),
    });
    await message.getByRole("button", { name: "Open in Gmail", exact: true }).click();
    const popup = await popupPromise;
    const compose = new URL((await composePromise).url());
    assert.equal(compose.searchParams.get("to"), email);
    assert.equal(compose.searchParams.get("su"), subject);
    assert.equal(compose.searchParams.get("body"), body);
    await visible(message.getByText("Handed off · delivery unconfirmed", { exact: true }));
    assert.equal(
      await message.getByRole("button", { name: "Open in Gmail", exact: true }).count(),
      0,
    );
    await popup.close();
    if (stale) {
      const attemptedGmail = [];
      const record = (request) => {
        if (request.url().startsWith("https://mail.google.com/"))
          attemptedGmail.push(request.url());
      };
      context.on("request", record);
      const blankPromise = context.waitForEvent("page");
      await stale.getByRole("button", { name: "Open in Gmail", exact: true }).click();
      const blank = await blankPromise;
      await stale
        .getByText("No new Gmail handoff is available for this message.", { exact: true })
        .waitFor();
      assert.deepEqual(attemptedGmail, [], "A stale tab cannot replay a compose URL");
      assert.equal(blank.isClosed(), true, "Refused replay closes its reserved popup");
      context.off("request", record);
      await stale.close();
      evidence.staleTab = { replayRefused: true, newGmailRequests: 0 };
    }
    await page.reload();
    await visible(task().getByText("Handed off · delivery unconfirmed", { exact: true }).first());
    await assertIdle(page);
    await go("/settings");
    csvEvidence.push(
      await downloadCsv(
        page,
        Array.from({ length: cycle }, (_, i) => `person${i + 1}@fictionalquarry.example`),
      ),
    );
    if (cycle === 1) {
      evidence.beforeRestart = await snapshot("workflow-before-restart");
      await restart();
      await unlock();
      evidence.afterRestart = await snapshot("workflow-after-restart");
      assert.deepEqual(
        evidence.afterRestart,
        evidence.beforeRestart,
        "Canonical fictional records must survive full restart",
      );
      await go("/outreach");
      await visible(task().getByText("Handed off · delivery unconfirmed", { exact: true }));
    }
  }
  evidence.workflows = {
    completed: 2,
    afterRestart: true,
    gmailDelivery: "unconfirmed",
    csv: csvEvidence,
  };
  await go("/outreach");
  await page.getByLabel("Kind", { exact: true }).selectOption("email");
  await page.getByLabel("Email", { exact: true }).fill("person2@fictionalquarry.example");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Fictional owner suppression for browser acceptance.");
  await click("Add suppression");
  await visible(
    task().getByText("Fictional owner suppression for browser acceptance.", { exact: true }),
  );
  await go("/settings");
  evidence.suppression = {
    emailExcluded: true,
    csv: await downloadCsv(page, ["person1@fictionalquarry.example"]),
  };
  const edge = await mutateFixture("csv-edge-contacts");
  const expectedNames = [
    "'=1+1",
    "' \t+1",
    "'\u0001-1",
    "'\ufeff@SUM(1,1)",
    'Fictional "Person", Quarry\né',
    "'\nFictional Person",
  ];
  assert.equal(edge.names.length, expectedNames.length);
  await go("/settings");
  evidence.csvEdgeCases = await downloadCsv(
    page,
    [
      "person1@fictionalquarry.example",
      ...expectedNames.map((_, i) => `edge${i}@fictionalquarry.example`),
    ],
    (rows) => {
      for (const [index, name] of expectedNames.entries()) {
        const row = rows.find((r) => r[5] === `edge${index}@fictionalquarry.example`);
        assert.equal(
          row[3],
          name,
          "CSV quoting/formula neutralization must match exact parsed bytes",
        );
        assert.equal(
          row[7],
          'Published on https://fictionalquarry.example/evidence/1, "fictional"\nUnicode é',
        );
      }
    },
  );
  return evidence;
}

export default runWorkflow;
