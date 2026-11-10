import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type BrowserContext } from "@playwright/test";

// Phase 7 owner screens (Morning Brief, Handoff & Recovery) in a real browser at
// desktop and phone width. Runs inside the operator-journey-e1 lane so it reuses
// that lane's disposable synthetic runtime and signed-in synthetic owner. Read
// only: it issues GET navigations and never presses a control.
const port = required("PROSPECTOR_BROWSER_PORT"), origin = required("PROSPECTOR_BROWSER_ORIGIN"), state = required("PROSPECTOR_BROWSER_STATE"), runtimeRoot = required("PROSPECTOR_BROWSER_RUNTIME_ROOT");
const SHOTS = resolve(process.cwd(), ".local", "phase7-surfaces");
const VIEWPORTS = [{ name: "desktop", width: 1280, height: 800 }, { name: "phone", width: 375, height: 812 }] as const;
const MIN_TARGET = 44;
let server: ChildProcess | undefined;
let serverOutput = "";
test.beforeAll(async () => { await mkdir(SHOTS, { recursive: true }); server = await startServer(); });
test.afterAll(async () => { await stopServer(server); });

const SCREENS = [
  { id: "morning-brief", url: "/?view=morning-brief", heading: "Morning Brief", workspace: ".morning-brief-workspace" },
  { id: "exports", url: "/?view=exports", heading: "Handoff & Recovery", workspace: "#operator-task" },
] as const;

for (const viewport of VIEWPORTS) for (const screen of SCREENS) {
  test(`${screen.id} renders cleanly at ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page, context }) => {
    const external: string[] = [], consoleProblems: string[] = [], requests: string[] = [];
    await denyExternal(context, external);
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleProblems.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
    page.on("request", (request) => { if (request.method() !== "GET") requests.push(`${request.method()} ${request.url()}`); });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(screen.url);
    await expect(page.getByRole("heading", { level: 1, name: screen.heading, exact: true })).toBeVisible();
    const workspace = page.locator(screen.workspace);
    await expect(workspace).toBeVisible();

    if (screen.id === "morning-brief") {
      // Settled: either profile briefs or the honest unavailable/empty state, never the spinner.
      await expect(page.getByText("Loading current weekly outcome and readiness evidence…")).toHaveCount(0);
      await expect(workspace.locator("button, form, input, select, textarea, [role='button']")).toHaveCount(0);
      await expect(workspace.getByText("Handoff & Recovery screen").first()).toBeVisible();
    } else {
      await expect(page.getByText("Loading", { exact: false }).first()).toBeHidden();
      await expect(workspace.getByRole("heading", { name: "CSV CRM Handoff" })).toBeVisible();
      await expect(workspace.getByRole("heading", { name: "Workspace Recovery" })).toBeVisible();
      // Blocked / unavailable states: every mutating control is disabled and says why.
      await expect(workspace.getByRole("button", { name: "Create CSV handoff" })).toBeDisabled();
      await expect(workspace.getByRole("button", { name: "Create encrypted workspace archive" })).toBeDisabled();
      await expect(workspace.getByRole("button", { name: "Run read-only dry run" })).toBeDisabled();
      await expect(workspace.getByRole("button", { name: "Restore verified archive" })).toBeDisabled();
      await expect(workspace.getByText(/blocked|unavailable/i).first()).toBeVisible();
      const alerts = await workspace.locator("[role='alert']").allInnerTexts();
      expect(alerts.length, "blocked states are announced").toBeGreaterThan(0);
      for (const text of alerts) expect(text).not.toMatch(/\b(error|failed|could not)\b/i);
    }

    // No horizontal page overflow.
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.innerWidth);

    // Interactive targets inside the screen are at least 44px tall (visible ones).
    const short = await workspace.evaluate((root, min) => {
      const out: string[] = [];
      for (const element of root.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, textarea, summary, [role='button']")) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (Math.round(box.height) < min) out.push(`${element.tagName.toLowerCase()} "${(element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
      return out;
    }, MIN_TARGET);
    expect(short, "targets shorter than 44px").toEqual([]);

    // Nothing in the workspace is clipped horizontally by its own box.
    const clipped = await workspace.evaluate((root) => {
      const bound = document.documentElement.clientWidth;
      return [...root.querySelectorAll<HTMLElement>("*")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > bound + 1 || r.left < -1); }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`);
    });
    expect(clipped, "elements outside the viewport").toEqual([]);

    await page.screenshot({ path: resolve(SHOTS, `${screen.id}-${viewport.name}.png`), fullPage: true });
    expect(consoleProblems, "console errors/warnings").toEqual([]);
    expect(requests, "non-GET requests").toEqual([]);
    expect(external).toEqual([]);
  });
}

async function denyExternal(target: BrowserContext, external: string[]) {
  await target.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    external.push(url.origin);
    return route.abort("blockedbyclient");
  });
}
async function startServer() { serverOutput = ""; const child = spawn(process.execPath,[resolve(process.cwd(),"node_modules","vite","bin","vite.js"),"--config","vite.config.ts","--port",port,"--host","127.0.0.1","--strictPort"],{cwd:process.cwd(),env:{...process.env,PROSPECTOR_LOCAL_STATE_PATH:state,PROSPECTOR_BROWSER_RUNTIME_ROOT:runtimeRoot},detached:true,stdio:["ignore","pipe","pipe"]}); child.stdout?.on("data",(chunk)=>{serverOutput+=chunk}); child.stderr?.on("data",(chunk)=>{serverOutput+=chunk}); try { for(let attempt=0;attempt<160;attempt+=1){ if(child.exitCode!==null)throw new Error(`p7_server_exited:${serverOutput}`); try{const response=await fetch(`${origin}/?view=morning-brief`);if(response.status===200)return child}catch{} await new Promise((done)=>setTimeout(done,100)); } throw new Error(`p7_server_not_ready:${serverOutput}`); } catch(error){await stopServer(child);throw error;} }
async function stopServer(child?:ChildProcess){if(!child||child.exitCode!==null||child.pid===undefined)return;try{process.kill(-child.pid,"SIGTERM")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}const closed=await Promise.race([new Promise<void>((done)=>child.once("close",()=>done())),new Promise<"timeout">((done)=>setTimeout(()=>done("timeout"),2000))]);if(closed==="timeout"&&child.exitCode===null){try{process.kill(-child.pid,"SIGKILL")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}await new Promise<void>((done)=>child.once("close",()=>done()));}}
function required(name:string){const value=process.env[name];assert.ok(value,`${name}_required`);return value;}
