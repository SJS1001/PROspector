#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const requested = process.argv[2];
if (!requested) {
  console.error("Usage: node validate-package.mjs <output-directory>");
  process.exit(2);
}

const root = path.resolve(requested);
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Output directory does not exist: ${root}`);
  process.exit(2);
}

const failures = [];
const warnings = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "dist", ".next"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(absolute)));
    else output.push(absolute);
  }
  return output;
}

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function anchors(markdown) {
  const result = new Set();
  const counts = new Map();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(match[1]);
    const count = counts.get(base) ?? 0;
    result.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  return result;
}

function links(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function strings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, output));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => strings(item, output));
  }
  return output;
}

const files = await walk(root);
const markdownFiles = files.filter((file) => file.endsWith(".md"));
const jsonFiles = files.filter((file) => /\.json(?:ld)?$/.test(file));
const markdown = new Map();

if (markdownFiles.length + jsonFiles.length === 0) {
  failures.push("no Markdown, JSON, or JSON-LD files found");
}

for (const file of markdownFiles) markdown.set(file, await readFile(file, "utf8"));

const externalUrls = new Set();
for (const [file, text] of markdown) {
  const relative = path.relative(root, file);
  if (/[ \t]+$/m.test(text)) failures.push(`${relative}: trailing whitespace`);
  if (/\n\n$/.test(text)) failures.push(`${relative}: extra blank line at EOF`);

  for (const target of links(text)) {
    if (/^https?:/.test(target)) {
      externalUrls.add(target);
      continue;
    }
    if (/^mailto:/.test(target)) continue;
    const [rawPath, rawAnchor] = target.split("#", 2);
    const targetFile = rawPath ? path.resolve(path.dirname(file), decodeURI(rawPath)) : file;
    if (!existsSync(targetFile)) {
      failures.push(`${relative}: missing local link ${target}`);
      continue;
    }
    if (rawAnchor && targetFile.endsWith(".md")) {
      const targetText = markdown.get(targetFile) ?? (await readFile(targetFile, "utf8"));
      if (!anchors(targetText).has(rawAnchor)) {
        failures.push(`${relative}: missing heading anchor ${target}`);
      }
    }
  }

  const textLines = text.split("\n");
  for (const [index, line] of textLines.entries()) {
    const guarantee = /\b(?:guaranteed rankings?|guaranteed leads?|guaranteed revenue)\b/i.test(line);
    const context = textLines.slice(Math.max(0, index - 5), index + 1).join(" ");
    const prohibition = /\b(?:no|not|never|avoid|reject(?:ed|ion)?|prohibit(?:ed)?|do not|don't)\b/i.test(context);
    if (guarantee && !prohibition) warnings.push(`${relative}:${index + 1}: inspect guarantee language`);
  }
}

for (const file of jsonFiles) {
  const relative = path.relative(root, file);
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    failures.push(`${relative}: invalid JSON: ${error.message}`);
    continue;
  }

  if (file.endsWith(".jsonld") && JSON.stringify(value).includes("aggregateRating")) {
    failures.push(`${relative}: aggregateRating is prohibited in contractor templates`);
  }
  if (/service-area/i.test(path.basename(file)) && value.address) {
    failures.push(`${relative}: address-hidden service-area template contains an address`);
  }
  if (/hybrid/i.test(path.basename(file)) && !value.address) {
    warnings.push(`${relative}: hybrid template has no public-address object`);
  }
  for (const valueString of strings(value)) {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(valueString)) {
      failures.push(`${relative}: private-key material detected`);
    }
  }
}

for (const file of files) {
  const relative = path.relative(root, file);
  const text = await readFile(file, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    failures.push(`${relative}: private-key material detected`);
  }
  if (/\b(?:sk|api)[-_][A-Za-z0-9]{24,}\b/.test(text)) {
    failures.push(`${relative}: credential-like token detected`);
  }
}

console.log(`Checked ${markdownFiles.length} Markdown and ${jsonFiles.length} JSON/JSON-LD files.`);
console.log(`Found ${externalUrls.size} external URLs; live reachability and source fit require separate review.`);

for (const warning of [...new Set(warnings)].sort()) console.warn(`WARN: ${warning}`);

if (failures.length) {
  console.error(`FAIL: ${new Set(failures).size} error(s)`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS: structural package validation completed.");
