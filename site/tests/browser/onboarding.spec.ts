import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const port = required("PROSPECTOR_BROWSER_PORT");
const origin = required("PROSPECTOR_BROWSER_ORIGIN");
const state = required("PROSPECTOR_BROWSER_STATE");
const runtimeRoot = required("PROSPECTOR_BROWSER_RUNTIME_ROOT");
let server: ChildProcess | undefined;
let serverOutput = "";
const MAX_SUPPORTED_ONBOARDING_STEPS = 32;

test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await stopServer(server); });

test("acceptance runtime admits the fixed synthetic owner", async ({ request }) => {
  const admitted = await request.get(`${origin}/api/interview`);
  expect(admitted.status()).toBe(200);
  expect((await admitted.json()).status).toBe("uninitialized");
});

test("blank generic onboarding reaches active Product and Profile authority with zero external effects", async ({ page, request, context }) => {
  test.setTimeout(240_000);
  const deniedRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin === origin) return route.continue();
    deniedRequests.push(requested.origin);
    return route.abort("blockedbyclient");
  });

  await page.goto("/?view=knowledge");
  await expect(page.getByRole("heading", { name: "Set up your company and first product" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.locator(".knowledge-workspace")).toBeVisible();
  await expect(page.locator(".knowledge-workspace")).toBeInViewport();
  await expect(page.getByText("Prospecting, exports, providers, credentials, and outbound actions remain off.")).toBeVisible();
  await assertAxe(page);

  const deniedProbe = await page.evaluate(() => fetch("https://external.invalid/browser-acceptance-probe")
    .then(() => "unexpected-success", () => "blocked"));
  expect(deniedProbe).toBe("blocked");
  // CSP may reject this before Playwright routing observes it. If routing does
  // observe it, the route is still aborted and only this synthetic origin is allowed.
  expect(deniedRequests.every((value) => value === "https://external.invalid")).toBe(true);
  deniedRequests.length = 0;

  const attack = await request.post(`${origin}/api/knowledge`, {
    headers: {
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
      "x-prospector-intent": "knowledge-mutation",
    },
    data: { action: "initialize_owner_workspace", idempotencyKey: "0199aa00-0000-7000-8000-000000000001", companyName: "Forbidden", productName: "Forbidden" },
  });
  expect(attack.status()).toBe(403);
  expect(await attack.text()).toBe("Forbidden");

  const forged = await page.evaluate(async () => {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-prospector-intent": "knowledge-mutation" },
      body: JSON.stringify({ action: "initialize_owner_workspace", idempotencyKey: "0199aa00-0000-7000-8000-000000000002", companyName: "Forbidden", productName: "Forbidden", workspaceId: "forged" }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(forged).toEqual({ status: 409, body: { error: "command_conflict" } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Set up your company and first product" })).toBeVisible();

  // A blank workspace must carry no seeded tenant. The legacy Mining fixture
  // named a specific Company and Market Play, so their absence here is what
  // proves this operator started from nothing rather than from that seed.
  await expect(page.getByText(/Digitalrain|ONE for Mining/)).toHaveCount(0);
  await page.getByLabel("Company name").fill("Northstar");
  await page.getByLabel("First product name").fill("Harbor Pulse");
  await page.getByRole("button", { name: "Create private workspace" }).click();
  await expect(page.getByRole("heading", { name: "Add the first market you want to pursue" })).toBeVisible();
  await page.getByLabel("Market Play name").fill("Port Operations");
  await page.getByRole("button", { name: "Continue setup" }).click();
  await expect(page.getByRole("heading", { name: "Describe the first customer profile" })).toBeVisible();
  await page.getByLabel("Customer Profile name").fill("Bulk Terminal Operators");
  await page.getByRole("button", { name: "Continue setup" }).click();
  await expect(page.getByRole("heading", { name: "Start the fit interview" })).toBeVisible();
  await page.getByRole("button", { name: "Begin interview" }).click();

  let reviewedSteps = 0;
  let confirmedFit = false;
  let correctedProduct = false;
  let exercisedRescope = false;
  let exercisedReject = false;
  let exercisedStaleFence = false;
  while (true) {
    expect(reviewedSteps, "the authoritative onboarding queue exceeded the browser contract").toBeLessThan(MAX_SUPPORTED_ONBOARDING_STEPS);
    await expect(page.getByText("No recommendation was generated. Owner input is required.")).toBeVisible();
    const questionPrompt = await page.locator(".active-question-card h2").textContent();
    const isFitQuestion = /^What should PROspector know about fit for the Customer Profile/.test(questionPrompt ?? "");
    const answerValue = isFitQuestion
      ? "Confirmed fit for synthetic bulk terminal operators"
      : `Synthetic owner answer ${reviewedSteps + 1}`;
    await page.getByLabel("Owner-confirmed value").fill(answerValue);
    await page.getByLabel("Reason").fill("Synthetic browser acceptance evidence only");
    await page.getByRole("button", { name: "Submit answer for confirmation" }).click();
    await expect(page.getByRole("heading", { name: "Confirm submitted answer" })).toBeVisible();
    const isCompanyQuestion = /^What should PROspector know about identity for the Company/.test(questionPrompt ?? "");
    const isProductQuestion = / for the Product /.test(questionPrompt ?? "");
    const decision = isCompanyQuestion && !exercisedRescope
      ? "rescope"
      : isCompanyQuestion && !exercisedReject
        ? "reject"
        : isProductQuestion && !correctedProduct
          ? "correct"
          : "accept";
    await page.getByLabel(decision[0].toUpperCase() + decision.slice(1)).check();
    if (decision === "rescope") {
      const destination = page.getByLabel("Confirmed destination");
      const productOption = destination.locator("option").filter({ hasText: "Product · Northstar / Harbor Pulse" });
      const productId = await productOption.getAttribute("value");
      assert.ok(productId, "the rendered rescope control must expose the exact Product destination");
      await destination.selectOption(productId);
      await page.getByLabel("Reason").fill("This synthetic identity belongs to the Product scope.");
      exercisedRescope = true;
    } else if (decision === "correct") {
      await page.getByLabel("Corrected value").fill("Corrected synthetic Product authority");
      await page.getByLabel("Reason").fill("The owner corrected this Product policy before confirmation.");
      correctedProduct = true;
    } else if (decision === "reject") {
      exercisedReject = true;
    }
    const decisionButton = decision === "correct" ? "Record correction" : decision === "rescope" ? "Record rescope" : decision[0].toUpperCase() + decision.slice(1);
    await page.getByRole("button", { name: decisionButton, exact: true }).click();
    reviewedSteps += 1;
    await expect(page.getByRole("heading", { name: "Confirmed result" })).toBeVisible();
    confirmedFit ||= isFitQuestion;
    const interviewComplete = await page.getByText(/Local interview complete: all \d+ hierarchy slots/).isVisible();
    if (interviewComplete) break;

    const progress = await page.getByText(/\d+ of \d+ interview slots reviewed\./).textContent();
    const totalSlots = Number(/\d+ of (\d+) interview slots reviewed\./.exec(progress ?? "")?.[1]);
    expect(Number.isSafeInteger(totalSlots) && totalSlots > 0).toBe(true);
    expect(totalSlots, "queue expansion requires an explicit browser-bound review").toBeLessThanOrEqual(MAX_SUPPORTED_ONBOARDING_STEPS);

    if (isFitQuestion && !exercisedStaleFence) {
      await page.reload();
      await expect(page.getByRole("heading", { name: "Confirmed result" })).toBeVisible();
      const secondTab = await context.newPage();
      await secondTab.route("**/*", async (route) => {
        const requested = new URL(route.request().url());
        if (requested.origin === origin) return route.continue();
        deniedRequests.push(requested.origin);
        return route.abort("blockedbyclient");
      });
      await secondTab.goto("/?view=knowledge");
      await expect(secondTab.getByRole("heading", { name: "Confirmed result" })).toBeVisible();
      await Promise.all([
        page.getByRole("button", { name: "Continue interview" }).click(),
        secondTab.getByRole("button", { name: "Continue interview" }).click(),
      ]);
      await expect.poll(async () =>
        (await page.locator(".active-question-card").count()) +
        (await secondTab.locator(".active-question-card").count()),
      ).toBe(1);
      const mainLost = await page.getByText("This item changed in another tab. Your action was not applied.").isVisible();
      const staleTab = mainLost ? page : secondTab;
      await expect(staleTab.getByText("This item changed in another tab. Your action was not applied.")).toBeVisible();
      if (mainLost) {
        await page.getByRole("button", { name: "Load current version" }).click();
        await expect(page.locator(".active-question-card")).toBeVisible();
      }
      await secondTab.close();
      exercisedStaleFence = true;
    } else {
      await page.getByRole("button", { name: "Continue interview" }).click();
    }
  }

  expect(reviewedSteps).toBeGreaterThan(0);
  expect(confirmedFit, "the rendered authoritative progression must reach confirmed Profile fit").toBe(true);
  expect({ exercisedReject, exercisedRescope, correctedProduct, exercisedStaleFence }).toEqual({
    exercisedReject: true,
    exercisedRescope: true,
    correctedProduct: true,
    exercisedStaleFence: true,
  });
  await expect(page.getByRole("heading", { name: "Consensus knowledge" })).toBeVisible();
  await expect(page.getByText("Northstar", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bulk Terminal Operators", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Commercial Model" }).click();
  await expect(page.getByText("Synthetic owner answer", { exact: false }).last()).toBeVisible();
  await assertAxe(page);
  expect(deniedRequests).toEqual([]);

  await page.goto("/?view=market-discovery");
  await expect(page.getByRole("heading", { name: "Market Discovery" })).toBeVisible();
  const productPicker = page.getByLabel("Product picker");
  const productValue = await productPicker.locator("option").filter({ hasText: "Harbor Pulse" }).getAttribute("value");
  assert.ok(productValue, "the rendered Product picker must expose the interviewed Product");
  await productPicker.selectOption(productValue);
  await expect(page.getByText("9 of 9 confirmed")).toBeVisible();
  await page.getByRole("button", { name: "Make Product Ready" }).click();
  await expect(page.getByRole("heading", { name: "Product Ready" })).toBeVisible();
  await expect(page.getByText(/blocked missing capability/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Discover markets" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Latest Market Discovery run" }).locator("..").locator("code")).toBeVisible();
  await expect(page.getByText(/blocked missing capability/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Product Ready" })).toBeVisible();

  await page.goto("/?view=prospects");
  await expect(page.getByRole("heading", { name: "Profile Readiness and Prospect Workspace" })).toBeVisible();
  const profilePicker = page.getByLabel("Customer Profile");
  const profileValue = await profilePicker.locator("option").filter({ hasText: "Bulk Terminal Operators" }).getAttribute("value");
  assert.ok(profileValue, "the rendered Profile picker must expose the interviewed Customer Profile");
  await profilePicker.selectOption(profileValue);
  await expect(page.getByText("All required predecessor references are current.")).toBeVisible();
  await page.getByRole("button", { name: "Create Profile configuration candidate" }).click();
  await expect(page.getByRole("heading", { name: "Candidate — not active" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Candidate — not active" })).toBeVisible();
  await page.getByRole("button", { name: "Activate Profile configuration" }).click();
  await expect(page.getByRole("heading", { name: "Active Profile Effective Configuration" })).toBeVisible();
  await expect(page.getByText(/blocked missing capability/i).first()).toBeVisible();
  await assertAxe(page);
  expect(deniedRequests).toEqual([]);

  await stopServer(server);
  server = await startServer();
  await page.goto("/?view=prospects");
  await expect(page.getByRole("heading", { name: "Active Profile Effective Configuration" })).toBeVisible();
  await expect(page.getByText(/blocked missing capability/i).first()).toBeVisible();
  await page.goto("/?view=knowledge");
  await expect(page.getByRole("heading", { name: "Consensus knowledge" })).toBeVisible();
  await expect(page.getByText("Northstar", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Harbor Pulse", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Port Operations", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bulk Terminal Operators", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Knowledge Library" }).click();
  await page.getByRole("button", { name: /^Confirmed \(/ }).click();
  await expect(page.getByRole("heading", { name: "fit" })).toBeVisible();
  await expect(page.getByText("Confirmed fit for synthetic bulk terminal operators")).toBeVisible();
  // The owner-entered names survived the restart and no seeded tenant appeared
  // alongside them at any point in the journey.
  await expect(page.getByText(/Digitalrain|ONE for Mining/)).toHaveCount(0);
  await assertAxe(page);
  expect(deniedRequests).toEqual([]);

  // Reflow parity with the person-discovery lane: the operator shell and the
  // Knowledge workspace must both survive the two breakpoints the stylesheet
  // declares without a horizontal scrollbar, and keyboard focus must still be
  // reachable at the narrowest one.
  for (const width of [760, 480]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Consensus knowledge" })).toBeVisible();
    const reflow = await measureReflow(page);
    expect(reflow.scrollWidth, `${width}px: ${JSON.stringify(reflow)}`).toBeLessThanOrEqual(reflow.clientWidth + 1);
    await assertAxe(page);
  }
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName !== "BODY")).toBe(true);
  expect(deniedRequests).toEqual([]);
});

/** The widest right edge in the document, so an overflowing control is named
 * rather than reported only as a scrollbar. */
async function measureReflow(page: Page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
  }));
}

async function assertAxe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
}

async function startServer() {
  serverOutput = "";
  const child = spawn(process.execPath, [resolve(process.cwd(), "node_modules", "vite", "bin", "vite.js"), "--config", "vite.config.ts", "--port", port, "--host", "127.0.0.1", "--strictPort"], {
    cwd: process.cwd(),
    env: { ...process.env, PROSPECTOR_LOCAL_STATE_PATH: state, PROSPECTOR_BROWSER_RUNTIME_ROOT: runtimeRoot },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.once("error", (error) => { serverOutput += error.message; });
  try {
    await waitForServer(child);
    return child;
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

async function waitForServer(child: ChildProcess) {
  let lastAdmission = "no_response";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`browser_server_exited_${child.exitCode}: ${serverOutput}`);
    try {
      const response = await fetch(`${origin}/api/interview`);
      const body = await response.text();
      lastAdmission = `${response.status}:${body.slice(0, 500)}`;
      if (response.status === 200) return;
    } catch { /* retry loopback only */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`browser_server_not_admitted:${lastAdmission}: ${serverOutput}`);
}

async function stopServer(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  const closed = await Promise.race([
    new Promise<void>((resolve) => child.once("close", () => resolve())),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2_000)),
  ]);
  if (closed === "timeout" && child.exitCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    await new Promise<void>((resolve) => child.once("close", () => resolve()));
  }
}

function required(name: string) {
  const value = process.env[name];
  assert.ok(value, `${name}_required`);
  return value;
}
