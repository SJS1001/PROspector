import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, copyFile, chmod, rm, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./control.mjs";

if (process.platform !== "darwin") throw new Error("App launcher requires macOS.");
const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, "..");
const uid = process.getuid();
const label = "com.sjs.prospector.local";
const menuLabel = "com.sjs.prospector.launcher";
const app = join(homedir(), "Applications", "App launcher.app");
const support = join(homedir(), "Library/Application Support/PROspector");
const logs = join(homedir(), "Library/Logs/PROspector");
const agents = join(homedir(), "Library/LaunchAgents");
const build = await mkdtemp(join(tmpdir(), "prospector-launcher-"));
const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const string = (value) => `<string>${xml(value)}</string>`;
const plist = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${body}</dict></plist>\n`;
const item = (key, value) => `<key>${key}</key>${value}`;
const array = (items) => `<array>${items.map(string).join("")}</array>`;
const checked = async (file, args) => {
  const result = await run(file, args);
  if (result.code) throw new Error(`${file.split("/").pop()} failed (${result.code}).`);
};
try {
  const existing = await run("/bin/launchctl", ["print", `gui/${uid}/${label}`]);
  if (/^\s*pid = \d+$/m.test(existing.stdout))
    throw new Error("Click Stop in App launcher before installing an update.");
  await readFile(join(root, ".output/server/index.mjs"));
  // Compile before changing an existing installation.
  execFileSync(
    "/usr/bin/swiftc",
    [
      "-parse-as-library",
      "-O",
      "-target",
      `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx14.0`,
      "-framework",
      "SwiftUI",
      "-framework",
      "AppKit",
      join(source, "AppLauncher.swift"),
      "-o",
      join(build, "AppLauncher"),
    ],
    { stdio: "inherit" },
  );
  for (const directory of [support, logs, join(support, "backups"), agents]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  const log = join(logs, "local-app.log");
  await writeFile(log, "", { flag: "a", mode: 0o600 });
  await chmod(log, 0o600);
  // Unload only our menu app and the stopped service. No unrelated process is killed.
  await run("/bin/launchctl", ["bootout", `gui/${uid}/${menuLabel}`]);
  if (!existing.code) await checked("/bin/launchctl", ["bootout", `gui/${uid}/${label}`]);
  const resources = join(app, "Contents/Resources");
  await mkdir(resources, { recursive: true });
  await mkdir(join(app, "Contents/MacOS"), { recursive: true });
  await copyFile(join(build, "AppLauncher"), join(app, "Contents/MacOS/AppLauncher"));
  await copyFile(join(source, "control.mjs"), join(resources, "control.mjs"));
  await writeFile(
    join(resources, "config.json"),
    JSON.stringify(
      {
        node: process.execPath,
        root,
        uid,
        label,
        url: "http://127.0.0.1:8080",
        data: join(support, "operator"),
        log,
        guide: join(source, "README.md"),
        backups: join(support, "backups"),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await writeFile(
    join(app, "Contents/Info.plist"),
    plist(
      item("CFBundleIdentifier", string("com.sjs.prospector.launcher")) +
        item("CFBundleName", string("App launcher")) +
        item("CFBundleDisplayName", string("App launcher")) +
        item("CFBundleExecutable", string("AppLauncher")) +
        item("CFBundlePackageType", string("APPL")) +
        item("CFBundleShortVersionString", string("1.0")) +
        item("CFBundleVersion", string("1")) +
        item("LSMinimumSystemVersion", string("14.0")) +
        item("LSUIElement", "<true/>") +
        item("NSHighResolutionCapable", "<true/>"),
    ),
  );
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", app], { stdio: "inherit" });
  const servicePath = join(agents, `${label}.plist`);
  await writeFile(
    servicePath,
    plist(
      item("Label", string(label)) +
        item("ProgramArguments", array([process.execPath, join(root, "scripts/local-start.mjs")])) +
        item("WorkingDirectory", string(root)) +
        item(
          "EnvironmentVariables",
          `<dict>${item("HOME", string(homedir()))}${item("PATH", string(`${dirname(process.execPath)}:/usr/bin:/bin`))}${item("OPERATOR_DATA_DIR", string(join(support, "operator")))}${item("OPERATOR_ACCESS_MODE", string("local"))}</dict>`,
        ) +
        item("RunAtLoad", "<false/>") +
        item("KeepAlive", "<false/>") +
        item("ExitTimeOut", "<integer>30</integer>") +
        item("StandardOutPath", string(log)) +
        item("StandardErrorPath", string(log)) +
        item("Umask", "<integer>63</integer>"),
    ),
    { mode: 0o600 },
  );
  const menuPath = join(agents, `${menuLabel}.plist`);
  await writeFile(
    menuPath,
    plist(
      item("Label", string(menuLabel)) +
        item("ProgramArguments", array([join(app, "Contents/MacOS/AppLauncher"), "--login"])) +
        item("RunAtLoad", "<true/>") +
        item("KeepAlive", "<false/>"),
    ),
    { mode: 0o600 },
  );
  await checked("/bin/launchctl", ["bootstrap", `gui/${uid}`, servicePath]);
  await checked("/bin/launchctl", ["bootstrap", `gui/${uid}`, menuPath]);
  console.log(
    `Installed ${app}\nThe menu bar launcher opens at login. Click Start PROspector to run the app.`,
  );
} finally {
  await rm(build, { recursive: true, force: true });
}
