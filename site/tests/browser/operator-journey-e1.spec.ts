import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const port = required("PROSPECTOR_BROWSER_PORT"), origin = required("PROSPECTOR_BROWSER_ORIGIN"), state = required("PROSPECTOR_BROWSER_STATE"), runtimeRoot = required("PROSPECTOR_BROWSER_RUNTIME_ROOT");
const REVIEW = "/?view=review-queue";
const UNKNOWN = "The outcome could not be verified. Nothing will be retried automatically.";
const STALE = "This candidate changed in another tab. Your action was not applied.";
let server: ChildProcess | undefined;
let serverOutput = "";
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await stopServer(server); });

test("a qualified Prospect survives CSRF expiry and a lost response, then one tab wins the review", async ({ page, request, context, browser }) => {
  const external: string[] = [];
  await denyExternal(context, external);
  const seed = await request.post(`${origin}/api/local-demo/operator-journey-e1`, { headers: { origin, "sec-fetch-site": "same-origin" } });
  expect(seed.status()).toBe(200);
  expect(await seed.json()).toEqual({ status: "ready", prospectId: "e1-qualified-prospect", assessmentId: "e1-assessment" });

  await page.goto(REVIEW);
  await expect(page.getByRole("heading", { name: "Qualified Prospect Review Queue" })).toBeVisible();
  await openQueue(page);
  await assertNoOverlay(page);
  await assertAxe(page);

  // Reflow parity with the other lanes, on the task this lane owns. 320px is
  // WCAG 1.4.10: a 1280x1024 window at 400% zoom is 320 CSS pixels wide.
  for (const width of [760, 480, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Review Queue", exact: true })).toBeVisible();
    const reflow = await measureReflow(page);
    expect(reflow.scrollWidth, `${width}px: ${JSON.stringify(reflow)}`).toBeLessThanOrEqual(reflow.clientWidth + 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertTextResizeHolds(page);
  await assertVisibleFocus(page);

  // 1. CSRF expiry. The token the page holds is dropped before the mutation, so
  // the server rejects it. The owner must be told the outcome is unverified and
  // nothing may be retried or applied behind their back.
  await context.clearCookies();
  const expired = await submitApproval(page, "csrf expiry probe");
  expect(expired.posts).toBe(1);
  expect(expired.statuses).toEqual([403]);
  await assertAnnounced(page, UNKNOWN);

  // 2. Lost response. The request leaves the browser and never comes back; the
  // same fail-closed notice must appear, still with exactly one attempt.
  await page.reload();
  await openQueue(page);
  let aborted = 0;
  await page.route("**/api/prospecting**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    aborted += 1;
    return route.abort("connectionreset");
  });
  const lost = await submitApproval(page, "lost response probe", { expectResponses: false });
  expect(aborted).toBe(1);
  expect(lost.posts).toBe(1);
  await assertAnnounced(page, UNKNOWN);
  await page.unroute("**/api/prospecting**");

  // 3. Two tabs, one decision. Both load the same authoritative revision; the
  // loser must be told its action was not applied, not silently retried.
  await page.reload();
  await openQueue(page);
  const secondContext = await browser.newContext({ baseURL: origin, acceptDownloads: false, serviceWorkers: "block" });
  await denyExternal(secondContext, external);
  const second = await secondContext.newPage();
  await second.goto(REVIEW);
  await openQueue(second);

  let postsOne = 0, postsTwo = 0;
  await page.route("**/api/prospecting**", async (route) => { if (route.request().method() === "POST") postsOne += 1; return route.continue(); });
  await second.route("**/api/prospecting**", async (route) => { if (route.request().method() === "POST") postsTwo += 1; return route.continue(); });
  await fillApproval(page, "first tab approves");
  await fillApproval(second, "second tab approves");
  const responseOne = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/prospecting"));
  const responseTwo = second.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/prospecting"));
  await Promise.all([
    page.getByRole("button", { name: "Approve prospect" }).click(),
    second.getByRole("button", { name: "Approve prospect" }).click(),
  ]);
  const statusOne = (await responseOne).status(), statusTwo = (await responseTwo).status();
  expect([statusOne, statusTwo].sort()).toEqual([200, 409]);
  expect([postsOne, postsTwo]).toEqual([1, 1]);
  // The loser is told its action was not applied; neither tab retries.
  const loser = statusOne === 409 ? page : second;
  await assertAnnounced(loser, STALE);
  await loser.waitForTimeout(500);
  expect([postsOne, postsTwo]).toEqual([1, 1]);
  await secondContext.close();

  // The decided Prospect leaves the queue, and a restart proves the decision is
  // durable rather than client state.
  await stopServer(server); server = await startServer();
  await page.goto(REVIEW);
  await selectProfile(page);
  await expect(page.getByText("No qualified prospects to review")).toBeVisible();
  await expect(page.getByText("Passed · score 8")).toHaveCount(0);
  await assertNoOverlay(page);
  await assertAxe(page);
  expect(external).toEqual([]);
});

/** Issue #11's local-handoff stage, driven through the supported screen rather
 * than the endpoint. The seam under test is the refusal: `projectCrmHandoff`
 * consults `recheckForCrmExport`, which never returns an unblocked recheck, so
 * no row is ever admitted. A preview that merely rendered would prove nothing —
 * this asserts the empty admission, the unadmitted framing, and the absence of
 * every export affordance. */
test("the fictional CRM handoff preview admits nothing, offers no download, and persists nothing", async ({ page, context }) => {
  const external: string[] = [];
  await denyExternal(context, external);

  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
  });

  await page.goto("/local-demo");
  const section = page.getByRole("region", { name: "CRM handoff CSV preview" });
  await expect(section).toBeVisible();
  // The screen must say what this is before it is run, not only afterwards.
  await expect(section.getByText("FICTIONAL · NOT APPROVED FOR EXPORT")).toBeVisible();

  const response = page.waitForResponse((entry) =>
    entry.request().method() === "POST" && entry.url().includes("/api/local-demo/crm-handoff-preview"));
  await section.getByRole("button", { name: "Preview fictional CSV rows" }).click();
  const preview = await response;

  expect(preview.status()).toBe(200);
  const headers = preview.headers();
  expect(headers["cache-control"]).toBe("no-store");
  // A handoff that offered a file would be an export. It must not even be shaped
  // like one.
  expect(headers["content-disposition"]).toBeUndefined();

  // The real decision. Zero rows are admitted, and the refused count accounts
  // for every demo row — asserted from the screen, not from the payload.
  const summary = section.getByText(/demo rows would be admitted for a real export/);
  await expect(summary).toBeVisible();
  const counts = (await summary.innerText()).replace(/\s+/gu, " ");
  const parsed = counts.match(/(\d+) of (\d+) demo rows would be admitted for a real export; (\d+) are refused/u);
  expect(parsed, `unexpected admission summary: ${counts}`).not.toBeNull();
  const [, admitted, total, refused] = parsed!;
  expect(admitted, counts).toBe("0");
  expect(refused, counts).toBe(total);
  expect(Number(total)).toBeGreaterThan(0);
  await expect(section.getByText("Fictional and unapproved.")).toBeVisible();

  // The bytes shown are the fictional rows, and they are visibly the preview
  // rather than an approved export.
  await expect(section.getByLabel("Fictional CSV preview bytes")).toContainText("fictional.buyer@example.test");

  // No export affordance anywhere on the screen: nothing to save, nothing to
  // open, nothing that would leave the browser.
  await expect(page.locator('a[download], [download], a[href^="blob:"], a[href^="data:"]')).toHaveCount(0);
  expect(posts).toEqual(["/api/local-demo/crm-handoff-preview"]);

  await assertNoOverlay(page);
  await assertAxe(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(section).toBeVisible();
  const reflow = await measureReflow(page);
  expect(reflow.scrollWidth, `320px: ${JSON.stringify(reflow)}`).toBeLessThanOrEqual(reflow.clientWidth + 1);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Nothing was persisted: after a runtime restart the screen is back to its
  // pre-run state and no preview survives. The lane's zero-effect verifier
  // proves the same at the database and object-store level.
  await stopServer(server); server = await startServer();
  await page.goto("/local-demo");
  await expect(page.getByRole("region", { name: "CRM handoff CSV preview" })).toBeVisible();
  await expect(page.getByText("Fictional and unapproved.")).toHaveCount(0);
  await expect(page.getByLabel("Fictional CSV preview bytes")).toHaveCount(0);
  expect(external).toEqual([]);
});

/** The queue is Profile-scoped, so the journey selects the ready Profile the
 * way an operator would before any prospect is listed. */
async function selectProfile(target: Page) {
  await target.getByLabel("Customer Profile").selectOption({ label: "Operating · ready" });
  await expect(target.getByText("Selected Profile Operating.")).toBeVisible();
}
async function openQueue(target: Page) {
  await selectProfile(target);
  await expect(target.getByRole("heading", { name: "Review Queue", exact: true })).toBeVisible();
  await expect(target.getByText("Passed · score 8")).toBeVisible();
}

/** Fill the owner reason so the decision controls become enabled. */
async function fillApproval(target: Page, reason: string) {
  await target.getByLabel("Owner reason").fill(reason);
  await expect(target.getByRole("button", { name: "Approve prospect" })).toBeEnabled();
}

/** Submit one approval and report exactly how many POSTs left the browser. */
async function submitApproval(target: Page, reason: string, options: { expectResponses?: boolean } = {}) {
  const statuses: number[] = [];
  let posts = 0;
  const onRequest = (request: { method(): string; url(): string }) => {
    if (request.method() === "POST" && request.url().includes("/api/prospecting")) posts += 1;
  };
  const onResponse = (response: { request(): { method(): string }; url(): string; status(): number }) => {
    if (response.request().method() === "POST" && response.url().includes("/api/prospecting")) statuses.push(response.status());
  };
  target.on("request", onRequest);
  target.on("response", onResponse);
  try {
    await fillApproval(target, reason);
    await target.getByRole("button", { name: "Approve prospect" }).click();
    await expect(target.getByText(UNKNOWN)).toBeVisible();
    if (options.expectResponses !== false) expect(statuses.length).toBeGreaterThan(0);
    // Settle long enough that a retry, if one existed, would have been issued.
    await target.waitForTimeout(500);
  } finally {
    target.off("request", onRequest);
    target.off("response", onResponse);
  }
  return { posts, statuses };
}

/** Issue #11 asks for screen-reader announcements, not merely visible text. A
 * fail-closed notice must reach assistive technology, so it has to sit inside a
 * live region that also carries the assertive role the runtime assigns to
 * unknown and stale outcomes. */
async function assertAnnounced(target: Page, message: string) {
  const announced = target.locator('[aria-live="polite"][role="alert"]').filter({ hasText: message });
  await expect(announced).toHaveCount(1);
  await expect(announced).toBeVisible();
}

/** Issue #11 asks for visible focus. Every tab stop must paint an indicator:
 * a rule that removes the outline without replacing it fails here. */
async function assertVisibleFocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let stops = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        label: (element.textContent ?? "").trim().slice(0, 40),
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    if (!focused) continue;
    stops += 1;
    const described = JSON.stringify(focused);
    expect(focused.focusVisible, `keyboard focus is not :focus-visible: ${described}`).toBe(true);
    const indicated = focused.outlineStyle !== "none" || focused.boxShadow !== "none";
    expect(indicated, `focused control paints no indicator: ${described}`).toBe(true);
  }
  // Keyboard navigation must actually reach the task's controls.
  expect(stops, "no control was reachable by keyboard").toBeGreaterThan(2);
}

/** Issue #11 asks for zoom. WCAG 1.4.4 is text scaled to 200% with no
 * horizontal scrolling; 1.4.10 is covered by the 320px pass above. */
async function assertTextResizeHolds(page: Page) {
  await page.addStyleTag({ content: "html{font-size:200%}" });
  try {
    await expect(page.getByRole("heading", { name: "Review Queue", exact: true })).toBeVisible();
    const reflow = await measureReflow(page);
    expect(reflow.scrollWidth, `200% text: ${JSON.stringify(reflow)}`).toBeLessThanOrEqual(reflow.clientWidth + 1);
  } finally {
    await page.evaluate(() => {
      for (const style of [...document.querySelectorAll("style")]) {
        if (style.textContent === "html{font-size:200%}") style.remove();
      }
    });
  }
}

async function denyExternal(target: BrowserContext, external: string[]) {
  await target.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    external.push(url.origin);
    return route.abort("blockedbyclient");
  });
}
async function measureReflow(page: Page) {
  return page.evaluate(() => {
    const pathOf = (element: HTMLElement) => {
      const parts: string[] = [];
      for (let node: HTMLElement | null = element; node && parts.length < 6; node = node.parentElement) {
        parts.unshift(node.tagName + (node.className ? `.${String(node.className).split(" ").join(".")}` : ""));
      }
      return parts.join(" > ");
    };
    return ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .filter((element) => {
        // Content inside a horizontal scroller is intentionally wider than the
        // viewport and does not widen the document.
        for (let node: HTMLElement | null = element.parentElement; node; node = node.parentElement) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return false;
        }
        return true;
      })
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: (element.textContent ?? "").trim().slice(0, 40),
        path: pathOf(element),
        right: element.getBoundingClientRect().right,
      })),
    });
  });
}
async function assertNoOverlay(page: Page) { await expect(page.locator("vite-error-overlay")).toHaveCount(0); await expect(page.getByText(/Hydration failed|UNHANDLED SCRIPT ERROR/)).toHaveCount(0); }
async function assertAxe(page: Page) { const result = await new AxeBuilder({ page }).analyze(); expect(result.violations.filter((entry) => ["critical", "serious"].includes(entry.impact ?? ""))).toEqual([]); }
async function startServer() { serverOutput = ""; const child = spawn(process.execPath,[resolve(process.cwd(),"node_modules","vite","bin","vite.js"),"--config","vite.config.ts","--port",port,"--host","127.0.0.1","--strictPort"],{cwd:process.cwd(),env:{...process.env,PROSPECTOR_LOCAL_STATE_PATH:state,PROSPECTOR_BROWSER_RUNTIME_ROOT:runtimeRoot},detached:true,stdio:["ignore","pipe","pipe"]}); child.stdout?.on("data",(chunk)=>{serverOutput+=chunk}); child.stderr?.on("data",(chunk)=>{serverOutput+=chunk}); try { for(let attempt=0;attempt<160;attempt+=1){ if(child.exitCode!==null)throw new Error(`e1_server_exited:${serverOutput}`); try{const response=await fetch(`${origin}${REVIEW}`);if(response.status===200)return child}catch{} await new Promise((done)=>setTimeout(done,100)); } throw new Error(`e1_server_not_ready:${serverOutput}`); } catch(error){await stopServer(child);throw error;} }
async function stopServer(child?:ChildProcess){if(!child||child.exitCode!==null||child.pid===undefined)return;try{process.kill(-child.pid,"SIGTERM")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}const closed=await Promise.race([new Promise<void>((done)=>child.once("close",()=>done())),new Promise<"timeout">((done)=>setTimeout(()=>done("timeout"),2000))]);if(closed==="timeout"&&child.exitCode===null){try{process.kill(-child.pid,"SIGKILL")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}await new Promise<void>((done)=>child.once("close",()=>done()));}}
function required(name:string){const value=process.env[name];assert.ok(value,`${name}_required`);return value;}
