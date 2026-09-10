#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const githubHostedLabel = /(?:^|[\s[,'"])(?:ubuntu-(?:latest|slim|[0-9.]+(?:-arm)?)|windows-(?:latest|[0-9]+)|macos-(?:latest|[0-9]+(?:-(?:large|xlarge|intel))?)|github-hosted)(?=$|[\s\],}'"])/i;

function stripYamlComment(line) {
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "'" && !doubleQuoted) singleQuoted = !singleQuoted;
    if (character === '"' && !singleQuoted && line[index - 1] !== "\\") {
      doubleQuoted = !doubleQuoted;
    }
    if (character === "#" && !singleQuoted && !doubleQuoted) {
      return line.slice(0, index);
    }
  }

  return line;
}

export function inspectWorkflow(source, filename = "workflow") {
  const lines = source.split(/\r?\n/);
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const uncommented = stripYamlComment(lines[index]);
    const match = uncommented.match(/^(\s*)(.*?)(?:["']runs-on["']|\bruns-on)\s*:\s*(.*)$/);
    if (!match) continue;

    const indentation = match[1].length;
    const inlineKey = match[2].trim() !== "";
    const declaration = [match[3]];
    let cursor = index + 1;

    while (!inlineKey && cursor < lines.length) {
      const continuation = stripYamlComment(lines[cursor]);
      if (continuation.trim() === "") {
        cursor += 1;
        continue;
      }
      const continuationIndent = continuation.match(/^\s*/)[0].length;
      if (continuationIndent <= indentation) break;
      declaration.push(continuation.trim());
      cursor += 1;
    }

    const runnerDeclaration = declaration.join(" ");
    if (!/\bself-hosted\b/i.test(runnerDeclaration)) {
      violations.push(`${filename}:${index + 1}: runs-on must statically include self-hosted`);
    }
    if (githubHostedLabel.test(runnerDeclaration)) {
      violations.push(`${filename}:${index + 1}: GitHub-hosted runner label is prohibited`);
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

  console.log("CI runner policy verified: no GitHub-hosted runs-on declarations found.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
