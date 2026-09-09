#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "README.md",
  "PRIMARY-SOURCE-RESEARCH.md",
  "PLAYBOOK.md",
  "UX-SPEC.md",
  "VALIDATION.md",
  "VALIDATION-RESULTS.md",
  "MANIFEST.sha256",
  "EVIDENCE-CROSSWALK.md",
  "CONTRIBUTING.md",
  "RED-TEAM-REPORT.md",
  "RED-TEAM-TRIAGE.md",
  "examples/HVAC-SERVICE.jsonld",
  "examples/HYBRID-HVAC-BUSINESS.jsonld",
  "examples/SERVICE-AREA-HVAC-BUSINESS.jsonld",
  "examples/SERVICE-PAGE-BRIEF.md",
  "examples/REVIEW-REQUEST-SOP.md",
];

const failures = [];

function fail(message) {
  failures.push(message);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(absolute)));
    else output.push(absolute);
  }
  return output;
}

function githubSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function headingAnchors(markdown) {
  const counts = new Map();
  const anchors = new Set();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = githubSlug(match[1]);
    const count = counts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  return anchors;
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function collectStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

for (const relative of requiredFiles) {
  if (!existsSync(path.join(packageRoot, relative))) fail(`missing required file: ${relative}`);
}

const files = await walk(packageRoot);
const markdownFiles = files.filter((file) => file.endsWith(".md"));
const jsonLdFiles = files.filter((file) => file.endsWith(".jsonld"));
const markdownCache = new Map();

for (const file of markdownFiles) markdownCache.set(file, await readFile(file, "utf8"));

for (const [file, markdown] of markdownCache) {
  if (/[ \t]+$/m.test(markdown)) fail(`${path.relative(packageRoot, file)}: trailing whitespace`);
  if (/\n\n$/.test(markdown)) fail(`${path.relative(packageRoot, file)}: extra blank line at EOF`);

  for (const target of markdownLinks(markdown)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [rawPath, rawAnchor] = target.split("#", 2);
    const targetFile = rawPath ? path.resolve(path.dirname(file), decodeURI(rawPath)) : file;
    if (!existsSync(targetFile)) {
      fail(`${path.relative(packageRoot, file)}: missing local target ${target}`);
      continue;
    }
    if (rawAnchor && targetFile.endsWith(".md")) {
      const targetMarkdown = markdownCache.get(targetFile) ?? (await readFile(targetFile, "utf8"));
      if (!headingAnchors(targetMarkdown).has(rawAnchor)) {
        fail(`${path.relative(packageRoot, file)}: missing heading anchor ${target}`);
      }
    }
  }
}

for (const file of jsonLdFiles) {
  const relative = path.relative(packageRoot, file);
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`${relative}: invalid JSON: ${error.message}`);
    continue;
  }
  if (JSON.stringify(value).includes("aggregateRating")) fail(`${relative}: self-serving aggregateRating is prohibited`);
  for (const text of collectStrings(value)) {
    if (!text.startsWith("http") || text.startsWith("https://schema.org")) continue;
    try {
      const host = new URL(text).hostname;
      if (!host.endsWith(".invalid")) fail(`${relative}: non-placeholder URL ${text}`);
    } catch {
      fail(`${relative}: malformed URL ${text}`);
    }
  }
}

const hybrid = JSON.parse(await readFile(path.join(packageRoot, "examples/HYBRID-HVAC-BUSINESS.jsonld"), "utf8"));
const serviceArea = JSON.parse(await readFile(path.join(packageRoot, "examples/SERVICE-AREA-HVAC-BUSINESS.jsonld"), "utf8"));
if (!hybrid.address) fail("hybrid example must contain a fictional public address");
if (serviceArea.address) fail("service-area example must not expose a street address");

const readme = markdownCache.get(path.join(packageRoot, "README.md"));
const usedIds = new Set([...readme.matchAll(/\b([PRSOEX]\d+)\b/g)].map((match) => match[1]));
const definedIds = new Set([
  ...[...readme.matchAll(/^- \*\*([PRSOEX]\d+):\*\*/gm)].map((match) => match[1]),
  ...[...readme.matchAll(/\[([E]\d+) —/g)].map((match) => match[1]),
]);
for (const id of usedIds) if (!definedIds.has(id)) fail(`README.md: undefined evidence ID ${id}`);

const crosswalk = markdownCache.get(path.join(packageRoot, "EVIDENCE-CROSSWALK.md"));
for (const heading of ["README guidance", "Playbook", "UX specification", "Examples and governance", "Coverage rule"]) {
  if (!crosswalk.includes(`## ${heading}`)) fail(`EVIDENCE-CROSSWALK.md: missing scope ${heading}`);
}

const manifestText = await readFile(path.join(packageRoot, "MANIFEST.sha256"), "utf8");
const manifestEntries = new Map();
for (const [index, line] of manifestText.trimEnd().split("\n").entries()) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) {
    fail(`MANIFEST.sha256:${index + 1}: malformed entry`);
    continue;
  }
  if (manifestEntries.has(match[2])) fail(`MANIFEST.sha256: duplicate path ${match[2]}`);
  manifestEntries.set(match[2], match[1]);
}

const manifestedFiles = files
  .map((file) => path.relative(packageRoot, file))
  .filter((relative) => relative !== "MANIFEST.sha256" && relative !== "VALIDATION-RESULTS.md")
  .sort();
for (const relative of manifestedFiles) {
  const expected = manifestEntries.get(relative);
  if (!expected) {
    fail(`MANIFEST.sha256: missing path ${relative}`);
    continue;
  }
  const actual = createHash("sha256")
    .update(await readFile(path.join(packageRoot, relative)))
    .digest("hex");
  if (actual !== expected) fail(`MANIFEST.sha256: digest mismatch for ${relative}`);
}
for (const relative of manifestEntries.keys()) {
  if (!manifestedFiles.includes(relative)) fail(`MANIFEST.sha256: unexpected path ${relative}`);
}

const allText = files
  .filter((file) => !file.endsWith("VALIDATION-RESULTS.md"))
  .map((file) => existsSync(file) ? file : null)
  .filter(Boolean);
for (const file of allText) {
  const text = await readFile(file, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    fail(`${path.relative(packageRoot, file)}: private-key material detected`);
  }
  if (/\b(?:sk|api)[-_][A-Za-z0-9]{24,}\b/.test(text)) {
    fail(`${path.relative(packageRoot, file)}: credential-like token detected`);
  }
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} package validation error(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS: ${requiredFiles.length} required files present`);
console.log(`PASS: ${markdownFiles.length} Markdown files have valid local targets and anchors`);
console.log(`PASS: ${jsonLdFiles.length} JSON-LD files parse and satisfy placeholder/privacy controls`);
console.log(`PASS: ${usedIds.size} used README evidence IDs are defined`);
console.log(`PASS: ${manifestEntries.size} final artifact files match MANIFEST.sha256`);
console.log("PASS: crosswalk scopes and basic secret-pattern controls are present");
