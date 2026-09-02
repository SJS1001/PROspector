# Plan 02-99 checked migration manifest

**Captured:** 2026-09-02

**Checked source:** `8b28210bf78d0b50e93c3df8f820810d9b7865f9`

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
| 0008 | `0008_controlled_enrichment.sql` | `c56fc8e67fe08ffa69853dfabb5e38db396b99d037edba0ef64fa50bcbb97690` |
| 0009 | `0009_gorgeous_captain_universe.sql` | `5bb2599bbf04792617d93740af0b1a40ca980ef4700b96aef9de7d24842c04d3` |

## Verification contract

The release candidate must contain exactly these ten SQL files in this lexical
order and no other migration. Before any remote apply, recompute every digest
from `site/drizzle/` and compare it byte-for-byte with this table. A missing,
additional, renamed, reordered, or digest-mismatched file stops the release.

This manifest proves only the checked local migration bytes. It does not prove
that any migration was applied, that a target uses these files, or that the
resulting schema or data is correct. Those remain separately authorized and
externally evidenced Plan 02-99 checkpoints.
