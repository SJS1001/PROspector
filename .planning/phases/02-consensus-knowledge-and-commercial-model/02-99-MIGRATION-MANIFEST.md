# Plan 02-99 checked migration manifest

**Captured:** 2026-09-02 (`0000`-`0009`), extended 2026-09-07 (`0010`-`0019`)

**Checked source:** `46d082e962c4acc1771e92ad300d61913d50ead4` for `0000`-`0009`;
`071b95b78afe765d8f6f5312063518cd913ed10e` for the appended `0010`-`0019` rows

**Algorithm:** SHA-256

## Ordered release chain

| Order | Migration | SHA-256 |
|---:|---|---|
| 0000 | `0000_jittery_meteorite.sql` | `b4222c0f98e04e42e66e25ce3bc677f5f8b594027a923e830941046850246bfc` |
| 0001 | `0001_true_spencer_smythe.sql` | `e0d746ea49c7431c95a0685e61709199b7d3c20e38aaa724e48cc6b0309e7b4d` |
| 0002 | `0002_eager_supreme_intelligence.sql` | `7a84f3ae552bbfef6ea25719a203acb7992e8d21921bb7501bcbfffaf4bfb1d3` |
| 0003 | `0003_acoustic_magik.sql` | `5edfe8b1b7e66ad32ac09e3b351def95ca969d787f0491f9c0e51a5735a15c02` |
| 0004 | `0004_consensus_knowledge.sql` | `b93c71d2225aa537527b118c417d99f64b04e8f17bacf49148f3d33f562cb051` |
| 0005 | `0005_even_mastermind.sql` | `a6854e0c123ae8aa6086dab9089f5a74cf469e0484c3671af3345e4937ec88c9` |
| 0006 | `0006_private-proof-run-binding.sql` | `c195583cffa7507cd8b52f76894abef431912683a98d9b0b8f225a2441d5ff4d` |
| 0007 | `0007_profile_prospecting.sql` | `ed769453ae7d13b1a2bbbfadb26152a2e32468f7f19b9a33eceab496c5254638` |
| 0008 | `0008_controlled_enrichment.sql` | `32089363b5668f8b43c01f8bee936da6f384bfe37615d9fd3790e7cc9847f9c6` |
| 0009 | `0009_gorgeous_captain_universe.sql` | `e139a0bd7dee8c7395f9403b569fcc12f6610bb531f3439f42918419b025a548` |

## Checked ahead of the release chain

These migrations are checked local bytes only. Stage 2 applied `0000`
through `0009`; nothing after `0009` has hosted evidence, so no candidate
may offer these to a remote apply until a separate owner authorization
moves them into the release chain above. Their digests are recorded here so
the working tree is still proved byte-for-byte, not merely counted.

The local lanes do apply these, so a fresh local database is larger than the
release chain's expected schema. `02-99-EXPECTED-SCHEMA.md` records the
release chain's shape and is the document `greenfield:target:prepare` pins;
`02-99-EXPECTED-SCHEMA-0019.md` records the whole checked chain's shape and is
pinned by nothing. Neither supersedes the other.

| Order | Migration | SHA-256 |
|---:|---|---|
| 0010 | `0010_governed_outreach.sql` | `0c0c50f6faf6827da1e43398192a7260552e0f857b60c1123dd9e970e6f1ea27` |
| 0011 | `0011_enrichment_candidate_lineage.sql` | `9a122e9fbf152e0f7839c6c6eb2bb74f4cb47a1490f32f041690f2c8fece0e72` |
| 0012 | `0012_governed_outreach_outbox.sql` | `829948ceb285fdcf106061d46c13510135dbb08f3279774c30bcbc6b836930ca` |
| 0013 | `0013_governed_outreach_lease.sql` | `ebbcd016aa86fea3cf11bffd9b51c2256ee63442a72efa4b6e181f9b1fbe6689` |
| 0014 | `0014_governed-outreach-authority.sql` | `f54848e7f214c5d12bc054000e83221643a10be8a96dac07af1d259053db6fc3` |
| 0015 | `0015_governed-outreach-pre-call.sql` | `8fdfa06b2a88b77a6f70e69ed6bec7ac46fc0e1c4c2a4c9a29986ee285c98d5d` |
| 0016 | `0016_governed-outreach-attempt-preparation.sql` | `ab58afef463913b2e237c221938aa803d45395f1b94ebc56a0bbaf0bf6705bd1` |
| 0017 | `0017_governed-outreach-preparation-recovery.sql` | `dbe772a793bc837f9110093d0a16ec0ba1c8ba74c49ed38946133baa1f35b65d` |
| 0018 | `0018_massive_blizzard.sql` | `16738c847a37fb8d07bb2873a241917bd9ce495a6562899c5bd0af34e21b32ae` |
| 0019 | `0019_person_discovery.sql` | `2a33b9a91aa905280ee1c35a0438570d4416fdcf60cd65e2c8a8edded0f0d1be` |

## Verification contract

A release candidate may offer exactly the SQL files in **Ordered release
chain**, in that lexical order, and no other migration. That set is pinned:
extending it is a separate owner decision under this plan, never a consequence
of the working tree growing. The candidate bounds its own
`migrations_pattern` to those exact filenames rather than a directory wildcard,
so an unreleased migration cannot reach `wrangler d1 migrations apply` even
though it sits in the same directory.

The working tree may run ahead of that set. Files beyond it must appear in
**Checked ahead of the release chain**, continue the same contiguous numbering
with no gap, duplicate, or reorder, and match their recorded digests. Before
any remote apply, recompute every digest in both tables from `site/drizzle/`
and compare byte-for-byte. A missing, additional, renamed, reordered, or
digest-mismatched file stops the release.

This manifest proves only the checked local migration bytes. It does not prove
that any migration was applied, that a target uses these files, or that the
resulting schema or data is correct. Those remain separately authorized and
externally evidenced Plan 02-99 checkpoints.

The `0008` and `0009` bytes at this source normalize trigger guards from nested
`SELECT CASE ... END;` expressions to equivalent `SELECT RAISE ... WHERE`
expressions. This preserves SQLite false/true/NULL behavior and leaves the
expected schema inventory unchanged while ensuring each trigger statement has
only its one outer `END;` compound terminator. The changed bytes have not been
applied remotely. Canonical preflight and a new target candidate remain
required before any separately authorized resume.

## 2026-09-07 extension

Rows `0010` through `0019` were appended because the checked chain had grown to
twenty migrations while this manifest still recorded ten. The ten pre-existing
rows are unchanged: each digest was independently recomputed from
`site/drizzle/` at the extension source and reproduced the recorded value
byte-for-byte, so no row was rewritten or recomputed into the table.

The appended migrations were not applied remotely and carry no hosted
evidence. Only Stage 2's separately recorded remote apply of `0000` through
`0009` has hosted evidence; every migration after `0009` is checked local bytes
awaiting its own separately authorized apply, and the recorded remote journal
therefore remains at ten rows until that happens.

Across the twenty files the chain declares 317 `CREATE TRIGGER` statements and
317 `END;` compound terminators, preserving the one-outer-terminator importer
property established for `0008` and `0009`.
