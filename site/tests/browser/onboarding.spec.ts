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

test("blank generic onboarding reaches confirmed fit and survives a runtime restart", async ({ page, request }) => {
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
  while (!confirmedFit) {
    expect(reviewedSteps, "the authoritative onboarding queue exceeded the browser contract").toBeLessThan(MAX_SUPPORTED_ONBOARDING_STEPS);
    await expect(page.getByText("No recommendation was generated. Owner input is required.")).toBeVisible();
    const questionPrompt = await page.locator(".active-question-card h2").textContent();
    const isFitQuestion = /^What should PROspector know about the Customer Profile/.test(questionPrompt ?? "");
    const answerValue = isFitQuestion
      ? "Confirmed fit for synthetic bulk terminal operators"
      : `Synthetic owner answer ${reviewedSteps + 1}`;
    await page.getByLabel("Owner-confirmed value").fill(answerValue);
    await page.getByLabel("Reason").fill("Synthetic browser acceptance evidence only");
    await page.getByRole("button", { name: "Submit answer for confirmation" }).click();
    await expect(page.getByRole("heading", { name: "Confirm submitted answer" })).toBeVisible();
    await page.getByLabel("Accept").check();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    reviewedSteps += 1;
    await expect(page.getByRole("heading", { name: "Confirmed result" })).toBeVisible();
    const progress = await page.getByText(/\d+ of \d+ interview slots reviewed\./).textContent();
    const totalSlots = Number(/\d+ of (\d+) interview slots reviewed\./.exec(progress ?? "")?.[1]);
    expect(Number.isSafeInteger(totalSlots) && totalSlots > 0).toBe(true);
    expect(totalSlots, "queue expansion requires an explicit browser-bound review").toBeLessThanOrEqual(MAX_SUPPORTED_ONBOARDING_STEPS);
    confirmedFit = isFitQuestion;
    if (confirmedFit) break;
    await page.getByRole("button", { name: "Continue interview" }).click();
  }

  expect(reviewedSteps).toBeGreaterThan(0);
  expect(confirmedFit, "the rendered authoritative progression must reach confirmed Profile fit").toBe(true);
  await expect(page.getByRole("heading", { name: "Consensus knowledge" })).toBeVisible();
  await expect(page.getByText("Northstar", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bulk Terminal Operators", { exact: true }).first()).toBeVisible();
  await assertAxe(page);
  expect(deniedRequests).toEqual([]);

  await stopServer(server);
  server = await startServer();
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
  await assertAxe(page);
  expect(deniedRequests).toEqual([]);
});

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
