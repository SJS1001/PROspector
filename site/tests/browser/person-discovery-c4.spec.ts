import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const port = required("PROSPECTOR_BROWSER_PORT"), origin = required("PROSPECTOR_BROWSER_ORIGIN"), state = required("PROSPECTOR_BROWSER_STATE"), runtimeRoot = required("PROSPECTOR_BROWSER_RUNTIME_ROOT");
let server: ChildProcess | undefined;
let serverOutput = "";
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await stopServer(server); });

test("synthetic Approved Prospect reaches governed intents, survives restart, and never leaves loopback", async ({ page, request, context, browser }) => {
  const external: string[] = [];
  await context.route("**/*", async (route) => { const url = new URL(route.request().url()); if (url.origin === origin) return route.continue(); external.push(url.origin); return route.abort("blockedbyclient"); });
  const seed = await request.post(`${origin}/api/local-demo/person-discovery-c4`, { headers: { origin, "sec-fetch-site": "same-origin" } });
  expect(seed.status()).toBe(200);
  expect(await seed.json()).toEqual({ status: "ready", prospectId: "c4-approved-prospect" });
  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find suitable people" })).toBeVisible();
  await expect(page.getByText("No known person")).toBeVisible();
  await assertNoOverlay(page);
  await assertAxe(page);
  await page.getByRole("button", { name: "Find suitable people" }).click();
  await expect(page.getByRole("heading", { name: "Suggested people" })).toBeVisible();
  await expect(page.getByText("Jordan Synthetic", { exact: true })).toBeVisible();
  await expect(page.getByText("Suggested person — not yet a contact").first()).toBeVisible();
  const jordan = page.locator("li").filter({ has: page.getByText("Jordan Synthetic", { exact: true }) });
  await jordan.getByText("Review bounded evidence").click();
  await expect(jordan.getByText("Synthetic public-role evidence generated locally for C4 acceptance only.")).toBeVisible();
  await jordan.getByRole("radio").check();
  await page.getByRole("radio", { name: "Create new person" }).check();
  await page.getByRole("checkbox", { name: "I confirm this explicit decision." }).check();

  const secondContext = await browser.newContext({ baseURL: origin, acceptDownloads: false, serviceWorkers: "block" });
  await secondContext.route("**/*", async (route) => { const url = new URL(route.request().url()); if (url.origin === origin) return route.continue(); external.push(url.origin); return route.abort("blockedbyclient"); });
  const second = await secondContext.newPage();
  await second.goto(`${origin}/contacts`);
  await expect(second.getByText("Jordan Synthetic", { exact: true })).toBeVisible();
  await second.locator('input[name="person-candidate"]').first().check();
  await second.getByRole("radio", { name: "Create new person" }).check();
  await second.getByRole("checkbox", { name: "I confirm this explicit decision." }).check();
  let postsOne = 0, postsTwo = 0;
  await page.route("**/api/contacts/person-discovery", async (route) => { if (route.request().method() === "POST") postsOne += 1; return route.continue(); });
  await second.route("**/api/contacts/person-discovery", async (route) => { if (route.request().method() === "POST") postsTwo += 1; return route.continue(); });
  const responseOne = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/contacts/person-discovery"));
  const responseTwo = second.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/contacts/person-discovery"));
  await Promise.all([page.getByRole("button", { name: "Record decision" }).click(), second.getByRole("button", { name: "Record decision" }).click()]);
  const statuses = [(await responseOne).status(), (await responseTwo).status()].sort();
  expect(statuses).toEqual([200, 409]);
  expect([postsOne, postsTwo]).toEqual([1, 1]);
  await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Decision recorded" })).toBeVisible();
  await secondContext.close();

  await page.getByLabel("Contact channel").selectOption("email");
  await page.getByRole("button", { name: "Record initial verification intent" }).click();
  await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeVisible();
  await page.getByLabel("Contact channel").selectOption("phone");
  await page.getByRole("button", { name: "Record initial verification intent" }).click();
  await expect(page.getByText("A person link is not verification.")).toBeVisible();
  await expect(page.getByText("Generated, directory, domain, or MX data is never eligible.")).toBeVisible();
  await expect(page.locator(".person-discovery-workspace [role='status']")).toBeFocused();
  await assertNoOverlay(page);

  await stopServer(server); server = await startServer();
  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeVisible();
  await expect(page.getByText("Jordan Synthetic", { exact: true }).first()).toBeVisible();
  await assertNoOverlay(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator(".person-discovery-workspace")).toBeVisible();
  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
  }));
  expect(reflow.scrollWidth, JSON.stringify(reflow)).toBeLessThanOrEqual(reflow.clientWidth + 1);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName !== "BODY")).toBe(true);
  await assertAxe(page);
  expect(external).toEqual([]);
});

async function assertNoOverlay(page: Page) { await expect(page.locator("vite-error-overlay")).toHaveCount(0); await expect(page.getByText(/Hydration failed|UNHANDLED SCRIPT ERROR/)).toHaveCount(0); }
async function assertAxe(page: Page) { const result = await new AxeBuilder({ page }).analyze(); expect(result.violations.filter((entry) => ["critical", "serious"].includes(entry.impact ?? ""))).toEqual([]); }
async function startServer() { serverOutput = ""; const child = spawn(process.execPath,[resolve(process.cwd(),"node_modules","vite","bin","vite.js"),"--config","vite.config.ts","--port",port,"--host","127.0.0.1","--strictPort"],{cwd:process.cwd(),env:{...process.env,PROSPECTOR_LOCAL_STATE_PATH:state,PROSPECTOR_BROWSER_RUNTIME_ROOT:runtimeRoot},detached:true,stdio:["ignore","pipe","pipe"]}); child.stdout?.on("data",(chunk)=>{serverOutput+=chunk}); child.stderr?.on("data",(chunk)=>{serverOutput+=chunk}); try { for(let attempt=0;attempt<160;attempt+=1){ if(child.exitCode!==null)throw new Error(`c4_server_exited:${serverOutput}`); try{const response=await fetch(`${origin}/contacts`);if(response.status===200)return child}catch{} await new Promise((done)=>setTimeout(done,100)); } throw new Error(`c4_server_not_ready:${serverOutput}`); } catch(error){await stopServer(child);throw error;} }
async function stopServer(child?:ChildProcess){if(!child||child.exitCode!==null||child.pid===undefined)return;try{process.kill(-child.pid,"SIGTERM")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}const closed=await Promise.race([new Promise<void>((done)=>child.once("close",()=>done())),new Promise<"timeout">((done)=>setTimeout(()=>done("timeout"),2000))]);if(closed==="timeout"&&child.exitCode===null){try{process.kill(-child.pid,"SIGKILL")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}await new Promise<void>((done)=>child.once("close",()=>done()));}}
function required(name:string){const value=process.env[name];assert.ok(value,`${name}_required`);return value;}
