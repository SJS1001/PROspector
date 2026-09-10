#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const githubHostedLabels = /^(?:ubuntu-(?:latest|slim|[0-9.]+(?:-arm)?)|windows-(?:latest|[0-9]+)|macos-(?:latest|[0-9]+(?:-(?:large|xlarge|intel))?)|github-hosted)$/i;

function keyValue(pair) {
  return isScalar(pair.key) && typeof pair.key.value === "string" ? pair.key.value : undefined;
}

function pairFor(mapping, key) {
  return mapping.items.find((pair) => keyValue(pair) === key);
}

function lineFor(node, lineCounter) {
  return node?.range ? lineCounter.linePos(node.range[0]).line : 1;
}

function rawScalarIsLiteral(node, source) {
  if (!isScalar(node) || typeof node.value !== "string" || node.anchor) return false;
  if (node.value.includes("${{")) return false;
  const raw = source.slice(node.range[0], node.range[1]);
  if (node.type === "QUOTE_DOUBLE") return raw === `"${node.source}"`;
  if (node.type === "QUOTE_SINGLE") return raw === `'${node.source}'`;
  return node.type === "PLAIN" && raw === node.source;
}

function staticRunnerLabels(node, source) {
  if (isAlias(node) || node?.anchor) return undefined;
  const values = isSeq(node) ? node.items : [node];
  if (values.length === 0) return undefined;
  if (values.some((value) => !rawScalarIsLiteral(value, source))) return undefined;
  return values.map((value) => value.value);
}

export function inspectWorkflow(source, filename = "workflow") {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    merge: false,
    schema: "core",
    uniqueKeys: true,
  });
  const violations = document.errors.map(
    (error) => `${filename}:${error.linePos?.[0]?.line ?? 1}: invalid YAML: ${error.message.split(" at line ")[0]}`,
  );
  if (violations.length > 0) return violations;

  if (!isMap(document.contents)) return [`${filename}:1: workflow must be a YAML mapping`];
  const jobsPair = pairFor(document.contents, "jobs");
  if (!jobsPair || !isMap(jobsPair.value)) {
    return [`${filename}:${lineFor(jobsPair?.value, lineCounter)}: workflow jobs must be a YAML mapping`];
  }

  for (const jobPair of jobsPair.value.items) {
    const jobName = keyValue(jobPair) ?? "<invalid-job-name>";
    const job = jobPair.value;
    const jobLine = lineFor(job, lineCounter);
    if (!isMap(job)) {
      violations.push(`${filename}:${jobLine}: job ${jobName} must be a YAML mapping`);
      continue;
    }

    const usesPair = pairFor(job, "uses");
    if (usesPair) {
      violations.push(`${filename}:${lineFor(usesPair.value, lineCounter)}: reusable-workflow job ${jobName} is prohibited`);
      continue;
    }

    const runsOnPair = pairFor(job, "runs-on");
    if (!runsOnPair) {
      violations.push(`${filename}:${jobLine}: job ${jobName} must declare runs-on`);
      continue;
    }

    const runnerLine = lineFor(runsOnPair.value, lineCounter);
    const labels = staticRunnerLabels(runsOnPair.value, source);
    if (!labels) {
      violations.push(`${filename}:${runnerLine}: runs-on must be a static literal label or label list`);
      continue;
    }
    if (!labels.includes("self-hosted")) {
      violations.push(`${filename}:${runnerLine}: runs-on must contain the exact self-hosted label`);
    }
    if (labels.some((label) => githubHostedLabels.test(label))) {
      violations.push(`${filename}:${runnerLine}: GitHub-hosted runner label is prohibited`);
    }
  }

  return violations;
}

export async function verifyRepository(repositoryRoot) {
  const workflowDirectory = path.join(repositoryRoot, ".github", "workflows");
  let entries;
  try {
    entries = await readdir(workflowDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const violations = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const filename = path.join(".github", "workflows", entry.name);
    const source = await readFile(path.join(workflowDirectory, entry.name), "utf8");
    violations.push(...inspectWorkflow(source, filename));
  }
  return violations;
}

async function main() {
  const repositoryRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const violations = await verifyRepository(repositoryRoot);
  if (violations.length > 0) {
    console.error("CI runner policy violation:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log("CI runner policy verified: no GitHub-hosted workflow jobs found.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
