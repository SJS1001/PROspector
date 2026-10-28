import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createKeyboardJourney } from "./usability.mjs";

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

export async function downloadCsv(page, expectedEmails, validateRows = () => {}, activate) {
  const pending = page.waitForEvent("download");
  const button = page.getByRole("button", { includeHidden: true, name: "Download CRM CSV", exact: true });
  if (activate) await activate(button, "Download CRM CSV");
  else await button.click(); // Unit consumer doubles and separate non-journey callers.
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
  await page.setViewportSize({ width: 360, height: 800 });
  const keyboard = createKeyboardJourney(page, evidence);
  const { layout } = keyboard;
  const task = () => page.locator("#operator-task");
  const go = async (route) => {
    if (route === "/brief") route = "/"; // Today is the visible dashboard entry.
    const link = page.locator('nav[aria-label="Workspace"]').locator(`a[href="${route}"]`);
    await keyboard.activate(link, `workspace navigation ${route}`);
    await page.waitForURL((url) => url.pathname === route);
    // URL updates can precede the new route shell; wait for its content before tabbing.
    const heading = { "/knowledge": "Company & product", "/discovery": "Target markets", "/prospects": "Searches & prospects", "/review": "Review prospects", "/contacts": "Contacts", "/outreach": "Outreach", "/settings": "Settings", "/": "Today" }[route];
    await task().getByRole("heading", { includeHidden: true, name: heading, exact: true }).waitFor();
    await keyboard.skip();
    await layout(`screen ${route}`);
  };
  const visible = async (locator) => {
    await keyboard.expose(locator);
    await locator.waitFor({ state: "visible" });
  };
  const click = async (name) => keyboard.activate(page.getByRole("button", { includeHidden: true, name, exact: true }), name);
  const csv = (emails, validateRows) => downloadCsv(page, emails, validateRows, keyboard.activate);
  const unlock = async () => {
    await page.goto(origin);
    await page.getByLabel("Owner password").or(task()).first().waitFor();
    if (await page.getByLabel("Owner password").isVisible()) {
      await keyboard.type(page.getByLabel("Owner password"), password, "owner password after restart");
      await click("Unlock workspace");
      await task().waitFor();
    }
  };
  console.log("Browser checkpoint: keyboard owner unlock");
  await page.goto(origin);
  const passwordField = page.locator("#owner-password");
  await passwordField.waitFor({ state: "visible" });
  await layout("owner unlock");
  await keyboard.reach(passwordField, "owner password");
  await page.keyboard.type("Fictional incorrect keyboard password");
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("button", { includeHidden: true, name: "Unlock workspace", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  await page.locator('#owner-password-error[role="alert"]').waitFor();
  await page.waitForFunction(() => {
    const field = document.querySelector("#owner-password");
    return field === document.activeElement && field.value === "";
  });
  await layout("owner password error");
  assert.equal(await passwordField.getAttribute("aria-invalid"), "true");
  assert.equal(await passwordField.getAttribute("aria-describedby"), "owner-password-error");
  await page.keyboard.type(password);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await task().waitFor();
  evidence.keyboardUnlock = {
    wrongPasswordRefocused: true,
    passwordCleared: true,
    keyboardRecovery: true,
  };
  await visible(task().getByRole("heading", { includeHidden: true, name: "Today", exact: true }));
  await keyboard.skip();
  await layout("home");
  await go("/knowledge");
  for (let index = 0; index < fictionalAnswers.length; index++) {
    await visible(task().getByText(new RegExp(`^Question ${index + 1} ·`)));
    await layout(`interview answer ${index + 1}`);
    await keyboard.type(task().getByRole("textbox", { includeHidden: true, name: /^Answer/ }), fictionalAnswers[index], `answer ${index + 1}`);
    await click("Submit answer for confirmation");
    await visible(page.getByRole("button", { includeHidden: true, name: "Confirm submitted answer", exact: true }));
    await layout(`interview proposed ${index + 1}`);
    await click("Confirm submitted answer");
  }
  await visible(task().getByRole("heading", { includeHidden: true, name: "Fictional Quarry", exact: true }));
  console.log("Browser checkpoint: interview confirmed");
  evidence.interview = { submitted: 16, confirmed: 16, fictional: true };

  // The completed screen leads with saved business facts. Optional research and
  // limits stay keyboard-accessible without reopening the interview.
  assert.equal(await task().getByRole("textbox", { includeHidden: true, name: /^Answer/ }).count(), 0);
  await visible(task().getByRole("heading", { includeHidden: true, name: "Fictional Plant Diagnostic", exact: true }));
  const savedDetails = task().locator('details:has(> summary:text-is("Details"))');
  const savedDetailsSummary = savedDetails.locator(":scope > summary");
  assert.equal(await savedDetails.evaluate((node) => node.open), false, "Supporting details start collapsed");
  await keyboard.activate(savedDetailsSummary, "Open Company details", "Space");
  const limits = savedDetails.locator('details:has(> summary:text-is("Product limits & permitted claims"))');
  const limitsSummary = limits.locator(":scope > summary");
  assert.equal(await limits.evaluate((node) => node.open), false, "Saved limits start collapsed");
  await keyboard.activate(limitsSummary, "Review saved product limits", "Space");
  assert.equal(await limits.evaluate((node) => node.open), true);
  await visible(limits.getByText(fictionalAnswers[3], { exact: true }));
  await layout("saved Company disclosure open");
  await keyboard.activate(limitsSummary, "Close saved product limits");
  assert.equal(await limits.evaluate((node) => node.open), false);
  await keyboard.focused(limitsSummary, "Saved disclosure retains keyboard focus");
  await keyboard.activate(savedDetailsSummary, "Close Company details");
  assert.equal(await savedDetails.evaluate((node) => node.open), false);
  const correctedCompany = "Fictional Quarry reviewed";
  for (const [savedAnswer, proposedAnswer] of [[fictionalAnswers[0], correctedCompany], [correctedCompany, fictionalAnswers[0]]]) {
    await click("Edit company");
    await visible(task().getByRole("textbox", { includeHidden: true, name: /^Answer/ }));
    assert.equal(await task().getByRole("textbox", { includeHidden: true, name: /^Answer/ }).inputValue(), savedAnswer);
    await keyboard.type(task().getByRole("textbox", { includeHidden: true, name: /^Answer/ }), proposedAnswer, "corrected company answer");
    await click("Submit answer for confirmation");
    await visible(task().getByText(`Proposed: ${proposedAnswer}`, { exact: true }));
    await visible(task().getByRole("heading", { includeHidden: true, name: savedAnswer, exact: true }));
    await page.reload();
    await visible(task().getByText(`Proposed: ${proposedAnswer}`, { exact: true }));
    await visible(task().getByRole("heading", { includeHidden: true, name: savedAnswer, exact: true }));
    await click("Confirm submitted answer");
    await page.getByRole("button", { includeHidden: true, name: "Confirm submitted answer", exact: true }).waitFor({ state: "detached" });
    await page.reload();
    await visible(task().getByRole("heading", { includeHidden: true, name: proposedAnswer, exact: true }));
    assert.equal(await task().getByRole("textbox", { includeHidden: true, name: /^Answer/ }).count(), 0);
  }
  evidence.savedCompany = { summary: true, keyboardDisclosure: true, correctionProposals: 2, savedAnswerPreservedUntilConfirmation: true, changedAnswerSurvivesReload: true, fictionalNameRestoredForWorkflow: true };


  // Inline confirmations remain part of normal tab order. Both cancellation
  // methods must return focus to their opener without performing provider work.
  const confirmAction = async (name, checkpoint, exerciseCancellation = false) => {
    const opener = page.getByRole("button", { includeHidden: true, name, exact: true });
    if (exerciseCancellation) {
      for (const method of ["Cancel", "Escape"]) {
        await keyboard.activate(opener, name);
        await visible(page.getByRole("button", { includeHidden: true, name: "Confirm", exact: true }));
        await layout(`${checkpoint} cancellation ${method}`);
        if (method === "Cancel") await click("Cancel");
        else {
          await keyboard.reach(page.getByRole("button", { includeHidden: true, name: "Confirm", exact: true }), `${name} confirmation`);
          await page.keyboard.press("Escape");
        }
        await page.getByRole("button", { includeHidden: true, name: "Confirm", exact: true }).waitFor({ state: "detached" });
        await keyboard.focused(opener, `${name} focus after ${method}`);
        (evidence.confirmationCancellation ??= []).push({ checkpoint, method, openerFocused: true });
      }
    }
    await keyboard.activate(opener, name);
    await visible(page.getByRole("button", { includeHidden: true, name: "Confirm", exact: true }));
    await layout(`${checkpoint} confirmation`);
    await click("Confirm");
  };
  await go("/discovery");
  await confirmAction("Activate product configuration", "product activation", true);
  await visible(page.getByRole("button", { includeHidden: true, name: "Discover markets", exact: true }));
  // Exercise the explicit manual discovery control as well as initial activation.
  await confirmAction("Discover markets", "manual market discovery", true);
  const proposal = task()
    .locator("article")
    .filter({ has: page.getByRole("button", { includeHidden: true, name: "Explore", exact: true }) })
    .first();
  await visible(proposal);
  await layout("market proposals");
  await keyboard.type(proposal.getByRole("textbox", { includeHidden: true, name: "Reason", exact: true }), "Fictional evidence fits the confirmed diagnostic capability.", "market exploration reason");
  await keyboard.activate(proposal.getByRole("button", { includeHidden: true, name: "Explore", exact: true }), "Explore");
  await visible(page.getByLabel("Audience", { exact: true }));
  await layout("draft market play");
  await keyboard.type(page.getByLabel("Audience", { exact: true }), "Fictional operating processing plants", "Audience");
  await keyboard.type(page.getByLabel("Likely buyer", { exact: true }), "Fictional Person, plant GM", "Likely buyer");
  await keyboard.type(page.getByLabel("Offer", { exact: true }), "eight-week-diagnostic", "Offer");
  await click("Confirm draft play");
  await visible(page.getByText(/Audience: Fictional operating processing plants/));
  console.log("Browser checkpoint: discovery confirmed");
  evidence.discovery = { productActivated: true, manualRun: true, draftPlayConfirmed: true };

  const csvEvidence = [];
  let lastHuntAt = 0;
  for (const cycle of [1, 2]) {
    console.log(`Browser checkpoint: workflow ${cycle} prospects`);
    await go("/prospects");
    if (cycle === 1) await confirmAction("Activate profile configuration", "profile activation", true);
    else {
      const remaining = 20_100 - (Date.now() - lastHuntAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      await confirmAction("Find Prospects", "manual prospect run", true);
    }
    lastHuntAt = Date.now();
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
    await layout(`prospect results ${cycle}`);
    await go("/review");
    const review = task()
      .locator("details")
      .filter({ has: page.locator("summary").filter({ hasText: `Fictional Plant ${cycle}` }) })
      .filter({ has: page.getByRole("button", { includeHidden: true, name: "Approve", exact: true }) });
    await visible(review);
    await layout(`review candidate ${cycle}`);
    await keyboard.type(review.getByRole("textbox", { includeHidden: true, name: "Reason", exact: true }), "Fictional retrieved evidence passes the application rubric and fits the confirmed profile.", `review reason ${cycle}`);
    if (cycle === 1) {
      const mutations = [];
      const recordMutation = (request) => {
        if (request.method() === "POST" && new URL(request.url()).origin === origin) mutations.push(request.url());
      };
      page.on("request", recordMutation);
      try {
        for (const method of ["Cancel", "Escape"]) {
          const opener = review.getByRole("button", { includeHidden: true, name: "Reject", exact: true });
          const confirm = review.getByRole("button", { includeHidden: true, name: "Confirm rejection", exact: true });
          await keyboard.activate(opener, "Reject prospect");
          await visible(confirm);
          await keyboard.focused(confirm, "Rejection confirmation");
          await layout(`prospect rejection cancellation ${method}`);
          if (method === "Cancel") await keyboard.activate(review.getByRole("button", { includeHidden: true, name: "Cancel", exact: true }), "Cancel rejection");
          else {
            await keyboard.reach(confirm, "Rejection confirmation");
            await page.keyboard.press("Escape");
          }
          await confirm.waitFor({ state: "detached" });
          await keyboard.focused(opener, `Reject focus after ${method}`);
          await visible(review);
          assert.equal(await review.getByRole("textbox", { includeHidden: true, name: "Reason", exact: true }).inputValue(), "Fictional retrieved evidence passes the application rubric and fits the confirmed profile.");
          assert.deepEqual(mutations, [], "Cancelling rejection must not submit any mutation");
          (evidence.confirmationCancellation ??= []).push({ checkpoint: "prospect rejection", method, openerFocused: true, noMutation: true });
        }
      } finally {
        page.off("request", recordMutation);
      }
    }
    await keyboard.activate(review.getByRole("button", { includeHidden: true, name: "Approve", exact: true }), "Approve prospect");
    await review.waitFor({ state: "detached" });

    console.log(`Browser checkpoint: workflow ${cycle} contacts`);
    await go("/contacts");
    const email = `person${cycle}@fictionalquarry.example`;
    // Suggestions share their account label. Activate their actual UI controls until
    // the current prospect's published source appears; never insert a contact.
    const reveals = page.getByRole("button", { includeHidden: true, name: "Run public-source reveal", exact: true });
    const revealCount = await reveals.count();
    for (let index = 0; index < revealCount; index++) {
      if (await task().getByText(email, { exact: true }).isVisible()) break;
      const response = page.waitForResponse(
        (item) => item.request().method() === "POST" && new URL(item.url()).origin === origin,
      );
      await layout(`contact reveal ${cycle}-${index}`);
      await keyboard.activate(reveals.nth(index), `Run public-source reveal ${cycle}-${index}`);
      await (await response).finished();
      await page.reload();
      await visible(task().getByRole("heading", { includeHidden: true, name: "Contacts", exact: true }));
    }
    await visible(task().getByText(email, { exact: true }));
    await go("/outreach");
    const approved = task()
      .locator("article")
      .filter({ hasText: `Fictional Plant ${cycle}` });
    await keyboard.activate(approved.getByRole("button", { includeHidden: true, name: "Prepare package", exact: true }), "Prepare package");
    const packageCard = task()
      .locator("article")
      .filter({ has: page.getByRole("button", { includeHidden: true, name: "Approve package", exact: true }) });
    await visible(packageCard);
    await keyboard.expose(packageCard.getByRole("button", { includeHidden: true, name: "Approve package", exact: true }), "package approval");
    const packageCardVersion = packageCard.locator("summary").filter({ hasText: /^Version details$/ }).locator("..");
    assert.equal(await packageCardVersion.evaluate((node) => node.open), false, "Version details start collapsed");
    await keyboard.activate(packageCardVersion.locator("summary"), "Open version details");
    assert.match(await packageCard.innerText(), /Digest [a-f0-9]{64}/);
    await layout(`package review ${cycle}`);
    await keyboard.activate(packageCard.getByRole("button", { includeHidden: true, name: "Approve package", exact: true }), "Approve package");
    await click(`Draft message to ${email}`);
    const message = task()
      .locator("article")
      .filter({ has: page.getByText(email, { exact: true }) });
    await visible(message);
    await keyboard.expose(message.getByRole("checkbox", { includeHidden: true }), "message acknowledgement");
    const messageVersion = message.locator("summary").filter({ hasText: /^Version details$/ }).locator("..");
    assert.equal(await messageVersion.evaluate((node) => node.open), false, "Version details start collapsed");
    await keyboard.activate(messageVersion.locator("summary"), "Open version details");
    assert.match(await message.innerText(), /Digest [a-f0-9]{64}/);
    await layout("message-cycle-" + cycle);
    const subject = await message.getByRole("heading", { includeHidden: true, level: 3 }).innerText();
    const body = await message.locator("p.whitespace-pre-wrap").innerText();
    assert.equal(
      await message.getByRole("button", { includeHidden: true, name: "Approve this message", exact: true }).isDisabled(),
      true,
    );
    await keyboard.activate(message.getByRole("checkbox", { includeHidden: true }), "exact message acknowledgement", "Space");
    assert.equal(await message.getByRole("checkbox", { includeHidden: true }).isChecked(), true);
    await keyboard.activate(message.getByRole("button", { includeHidden: true, name: "Approve this message", exact: true }), "Approve this message");
    await visible(message.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }));
    await layout(`approved message ${cycle}`);
    let stale;
    if (cycle === 2) {
      assert.equal(
        typeof mutateFixture,
        "function",
        "Parent must provide stopped-database fictional fixture mutation",
      );
      // Negative authority probes deliberately use isolated tabs and pointer
      // activation. They are separate from the keyboard-only primary journey.
      const approvedTab = async () => {
        const tab = await context.newPage();
        await tab.goto(`${origin}/outreach`);
        const tabKeyboard = createKeyboardJourney(tab, evidence);
        await tabKeyboard.expose(tab.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }));
        await tab
          .locator("article")
          .filter({ has: tab.getByText(email, { exact: true }) })
          .getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true })
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
          await tab.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }).click();
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
      await keyboard.activate(message.getByRole("checkbox", { includeHidden: true }), "renewed exact message acknowledgement", "Space");
      assert.equal(await message.getByRole("checkbox", { includeHidden: true }).isChecked(), true);
      await keyboard.activate(message.getByRole("button", { includeHidden: true, name: "Approve this message", exact: true }), "Approve renewed message");
      const suppressedTab = await approvedTab();
      await mutateFixture("add-probe-suppression");
      try {
        await rejectStaleHandoff(suppressedTab);
        // Suppression after approval must also remove the recipient from CSV.
        await go("/settings");
        evidence.suppressionBeforeHandoff = {
          denied: true,
          newGmailRequests: 0,
          csv: await csv(["person1@fictionalquarry.example"]),
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
      await createKeyboardJourney(stale, evidence).expose(stale.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }));
      await stale
        .locator("article")
        .filter({ has: stale.getByText(email, { exact: true }) })
        .getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true })
        .waitFor();
    }
    console.log(`Browser checkpoint: workflow ${cycle} handoff`);
    const popupPromise = context.waitForEvent("page");
    const composePromise = context.waitForEvent("request", {
      predicate: (request) => request.url().startsWith("https://mail.google.com/"),
    });
    await keyboard.activate(message.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }), "Open in Gmail");
    const popup = await popupPromise;
    const compose = new URL((await composePromise).url());
    assert.equal(compose.searchParams.get("to"), email);
    assert.equal(compose.searchParams.get("su"), subject);
    assert.equal(compose.searchParams.get("body"), body);
    await visible(message.getByText("Handed off · delivery unconfirmed", { exact: true }));
    assert.equal(
      await message.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }).count(),
      0,
    );
    await popup.close();
    await layout(`handoff unconfirmed ${cycle}`);
    if (stale) {
      const attemptedGmail = [];
      const record = (request) => {
        if (request.url().startsWith("https://mail.google.com/"))
          attemptedGmail.push(request.url());
      };
      context.on("request", record);
      const blankPromise = context.waitForEvent("page");
      await stale.getByRole("button", { includeHidden: true, name: "Open in Gmail", exact: true }).click();
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
    await go("/brief");
    await layout(`brief after handoff ${cycle}`);
    await go("/settings");
    await visible(page.getByRole("button", { includeHidden: true, name: "Download workspace backup", exact: true }));
    await layout("settings-cycle-" + cycle);
    csvEvidence.push(
      await csv(
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
  await keyboard.expose(page.getByRole("button", { includeHidden: true, name: "Add suppression", exact: true }), "do-not-contact controls");
  evidence.suppressionForm = {
    selects: await page.locator("select").count(),
    namedKind: await page.getByRole("combobox", { includeHidden: true, name: /^Kind/ }).count(),
  };
  const suppressionForm = page.locator("form").filter({ has: page.getByRole("button", { includeHidden: true, name: "Add suppression", exact: true }) });
  const kind = suppressionForm.getByRole("combobox", { includeHidden: true, name: /^Kind/ });
  await keyboard.select(kind, "domain", "suppression Kind domain");
  await visible(suppressionForm.getByLabel("Domain", { exact: true }));
  await keyboard.select(kind, "email", "suppression Kind email");
  await keyboard.type(suppressionForm.getByLabel("Email", { exact: true }), "person2@fictionalquarry.example", "suppression email");
  await keyboard.type(suppressionForm.getByRole("textbox", { includeHidden: true, name: "Reason", exact: true }), "Fictional owner suppression for browser acceptance.", "suppression reason");
  await layout("completed suppression form");
  await click("Add suppression");
  await visible(
    task().getByText("Fictional owner suppression for browser acceptance.", { exact: true }),
  );
  await go("/settings");
  evidence.suppression = {
    emailExcluded: true,
    csv: await csv(["person1@fictionalquarry.example"]),
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
  evidence.csvEdgeCases = await csv(
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
  await go("/contacts");
  // This fixture was inserted directly while the runtime was stopped. Reload
  // to discard the client query cache before checking its new contact records.
  await page.reload();
  await task().getByRole("heading", { name: "Contacts", exact: true }).waitFor();
  const verifiedCards = task().locator("article").filter({ has: page.getByText("verified", { exact: true }) });
  await verifiedCards.first().waitFor();
  assert.ok(await verifiedCards.count() > 0, "Verified-contact check is non-vacuous");
  assert.equal(await verifiedCards.getByText(/Unverified mailbox/).count(), 0, "Verified contacts are not labeled unverified");
  await go("/settings");
  const connections = task().locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Connections & search settings$/ }) });
  assert.equal(await connections.evaluate((node) => node.open), false, "Connection settings start collapsed");
  await keyboard.activate(connections.locator(":scope > summary"), "Open connection settings");
  const fields = ["Provider", "Accounts per hunt (4–20)", "TypeSafe / Jev API key", "Apollo API key", "ZoomInfo API key", "Monthly spend cap in USD", "Gmail email address"];
  for (const label of fields) {
    const field = label === "Provider"
      ? connections.getByRole("combobox", { includeHidden: true, name: /^Provider/ })
      : connections.getByLabel(label, { exact: true });
    await keyboard.reach(field, `Connection setting: ${label}`);
    await layout(`Expanded connection setting: ${label}`);
    const section = field.locator("xpath=ancestor::details[1]");
    await keyboard.activate(section.locator(":scope > summary"), `Close connection setting: ${label}`);
  }
  await keyboard.activate(connections.locator(":scope > summary"), "Close connection settings");
  return evidence;
}

export default runWorkflow;
