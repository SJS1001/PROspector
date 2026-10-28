import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function startServer() {
  const child = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  child.on("exit", (code) => {
    if (code) app.exit(code);
  });
}

async function waitForPreview() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch("http://127.0.0.1:8080/");
      if (res.ok) return;
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

app.whenReady().then(async () => {
  startServer();
  await waitForPreview();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#0c0c0d",
    title: "PROspector",
    webPreferences: { sandbox: true },
  });
  await win.loadURL("http://127.0.0.1:8080/");
});
