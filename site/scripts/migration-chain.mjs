// Canonical migration source of truth.
//
// The checked `drizzle/meta/_journal.json` written by drizzle-kit is the single
// authority for which migrations exist and in what order. Every local
// bootstrap, acceptance lane, and readiness check derives its chain from here
// so that adding a migration cannot leave one consumer silently pinned to an
// older head. Nothing in this module reads a hosted target, a credential, or
// any state outside the checked `drizzle/` directory.

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATION_DIRECTORY = fileURLToPath(new URL("../drizzle/", import.meta.url));
export const MIGRATION_JOURNAL_RELATIVE_PATH = "meta/_journal.json";

const MIGRATION_FILENAME = /^(\d{4})_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/u;
const MIGRATION_TAG = /^(\d{4})_[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/**
 * Read and fully validate the checked migration chain.
 *
 * Fails closed on any journal/directory disagreement rather than returning a
 * partial chain: a truncated chain is exactly the defect this module exists to
 * prevent.
 *
 * @param {string} directory absolute path of a `drizzle`-shaped directory
 * @returns {readonly string[]} ordered `.sql` filenames, index 0 first
 */
export function readMigrationChain(directory = MIGRATION_DIRECTORY) {
  const journalPath = resolve(directory, MIGRATION_JOURNAL_RELATIVE_PATH);
  let journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch (cause) {
    throw new Error("migration_chain_journal_unreadable", { cause });
  }
  if (journal === null || typeof journal !== "object" || Array.isArray(journal)) {
    throw new Error("migration_chain_journal_invalid");
  }
  if (journal.dialect !== "sqlite") throw new Error("migration_chain_dialect_invalid");
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("migration_chain_journal_invalid");
  }

  const byIndex = new Map();
  const tags = new Set();
  for (const entry of journal.entries) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("migration_chain_journal_invalid");
    }
    const { idx, tag } = entry;
    if (!Number.isSafeInteger(idx) || idx < 0) throw new Error("migration_chain_index_invalid");
    if (typeof tag !== "string" || !MIGRATION_TAG.test(tag)) throw new Error("migration_chain_tag_invalid");
    if (byIndex.has(idx)) throw new Error(`migration_chain_duplicate_index:${idx}`);
    if (tags.has(tag)) throw new Error(`migration_chain_duplicate_tag:${tag}`);
    if (Number.parseInt(tag.slice(0, 4), 10) !== idx) throw new Error(`migration_chain_prefix_mismatch:${tag}`);
    byIndex.set(idx, tag);
    tags.add(tag);
  }

  const chain = [];
  for (let index = 0; index < byIndex.size; index += 1) {
    const tag = byIndex.get(index);
    if (tag === undefined) throw new Error(`migration_chain_index_gap:${index}`);
    chain.push(`${tag}.sql`);
  }

  const present = new Set(readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name));
  for (const filename of chain) {
    if (!MIGRATION_FILENAME.test(filename)) throw new Error(`migration_chain_filename_invalid:${filename}`);
    if (!present.delete(filename)) throw new Error(`migration_chain_file_missing:${filename}`);
  }
  for (const orphan of present) throw new Error(`migration_chain_orphan_file:${orphan}`);

  return Object.freeze(chain);
}

/**
 * Assert that a pinned prefix still matches the head of the canonical chain.
 *
 * Fixtures may deliberately stop short of the head, but they may never claim a
 * migration the canonical chain does not have, or reorder one that it does.
 *
 * @param {readonly string[]} prefix
 * @param {string} label
 * @param {readonly string[]} chain
 */
export function assertCanonicalPrefix(prefix, label, chain = CANONICAL_MIGRATION_FILENAMES) {
  assert.deepEqual(
    [...prefix],
    chain.slice(0, prefix.length),
    `${label} must be an exact prefix of the canonical migration chain`,
  );
}

export const CANONICAL_MIGRATION_FILENAMES = readMigrationChain();
export const CANONICAL_MIGRATION_COUNT = CANONICAL_MIGRATION_FILENAMES.length;
export const CANONICAL_MIGRATION_HEAD = CANONICAL_MIGRATION_FILENAMES[CANONICAL_MIGRATION_COUNT - 1];
