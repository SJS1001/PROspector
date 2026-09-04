# Plan 02-99 checked migration manifest

**Captured:** 2026-09-02

**Checked source:** `46d082e962c4acc1771e92ad300d61913d50ead4`

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

## Verification contract

The release candidate must contain exactly these ten SQL files in this lexical
order and no other migration. Before any remote apply, recompute every digest
from `site/drizzle/` and compare it byte-for-byte with this table. A missing,
additional, renamed, reordered, or digest-mismatched file stops the release.

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
