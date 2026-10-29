import {
  existsSync,
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve, relative } from "node:path";

export function localDataDir() {
  const override = process.env.OPERATOR_DATA_DIR;
  if (override !== undefined) {
    if (!override || !isAbsolute(override))
      throw new Error("OPERATOR_DATA_DIR must be an absolute path");
    return resolve(override);
  }
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "PROspector", "operator");
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && !isAbsolute(xdg)) throw new Error("XDG_DATA_HOME must be an absolute path");
  return join(xdg || join(homedir(), ".local", "share"), "prospector", "operator");
}

// Check every existing component before creating anything; never follow symlinks.
function checkPath(path) {
  const root = parse(path).root;
  let current = root;
  for (const part of path.slice(root.length).split("/").filter(Boolean)) {
    current = join(current, part);
    try {
      const st = lstatSync(current);
      if (st.isSymbolicLink() || !st.isDirectory())
        throw new Error(`Unsafe data directory component: ${current}`);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      mkdirSync(current, { mode: 0o700 });
    }
  }
}
export function ensurePrivateDataDir(dir = localDataDir()) {
  if (!isAbsolute(dir)) throw new Error("Data directory must be an absolute path");
  assertOutsideCheckout(dir);
  checkPath(dir);
  chmodSync(dir, 0o700);
  return dir;
}
function privatePath(name) {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\"))
    throw new Error("Invalid private file name");
  return join(ensurePrivateDataDir(), name);
}
export function readPrivateFile(name) {
  const path = privatePath(name);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || st.mode & 0o077) throw new Error("Unsafe private file");
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function writePrivateFile(name, data) {
  const path = privatePath(name);
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}
// Keep this file permanently: unlinking a locked inode permits a second owner.
// SQLite holds an OS lock for the lifetime of the transaction. The OS releases
// it on process death/reboot, without stale PID checks or deleting lock files.
export function acquireDatabaseLock(dir = localDataDir()) {
  const path = join(ensurePrivateDataDir(dir), ".database.lock");
  try {
    // Only close our own newly created descriptor. Opening/closing an existing
    // lock file can release POSIX locks held by this process's SQLite handle.
    const fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    closeSync(fd);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
  const st = lstatSync(path);
  if (st.isDirectory())
    throw new Error(
      "Legacy database lock found. Stop the older app before upgrading; consult the recovery guide if it crashed.",
    );
  if (!st.isFile() || st.nlink !== 1 || st.mode & 0o077)
    throw new Error("Unsafe database lock file");
  const guard = new DatabaseSync(path);
  try {
    guard.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
  } catch (err) {
    guard.close();
    if (err.errcode === 5 || err.errcode === 6) {
      const locked = new Error(
        "Local database is locked by another running app. Stop that app, then try again.",
      );
      locked.code = "OPERATOR_DATABASE_LOCKED";
      throw locked;
    }
    throw err;
  }
  let released = false;
  const release = () => {
    if (!released) {
      guard.close();
      released = true;
    }
  };
  process.once("exit", release);
  return () => {
    process.removeListener("exit", release);
    release();
  };
}
export function isDatabaseLocked(dir = localDataDir()) {
  try {
    acquireDatabaseLock(dir)();
    return false;
  } catch (err) {
    if (err.code === "OPERATOR_DATABASE_LOCKED") return true;
    throw err;
  }
}
function secureTree(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    const st = lstatSync(child);
    if (st.isSymbolicLink()) throw new Error(`Unsafe database entry: ${child}`);
    if (st.isDirectory()) {
      chmodSync(child, 0o700);
      secureTree(child);
    } else if (st.isFile() && st.nlink === 1) chmodSync(child, 0o600);
    else throw new Error(`Unsafe database entry: ${child}`);
  }
}
export function databasePath() {
  const dir = ensurePrivateDataDir();
  const path = join(dir, "database");
  checkPath(path);
  chmodSync(path, 0o700);
  secureTree(path);
  return path;
}

export function assertOutsideCheckout(path) {
  let checkout = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(checkout, ".git")) && dirname(checkout) !== checkout)
    checkout = dirname(checkout);
  if (dirname(checkout) === checkout) checkout = resolve(process.cwd());
  const rel = relative(checkout, resolve(path));
  if (!rel || (!rel.startsWith(".." + "/") && rel !== ".." && !isAbsolute(rel)))
    throw new Error("Private operator data must be outside the checkout.");
}
