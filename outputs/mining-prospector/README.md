# Mining prospector — nightly digest archive

Output of the scheduled `mining-prospector` agent (see `SKILL.md`). Each digest
covers one night's lead sweep for ONE for Mining.

## Provenance

These files were recovered from the Codex run directories under
`~/Documents/Codex/2026-09-04/` and committed here on 2026-09-09. Several
digests carry a "GitHub push skipped" banner: the GitHub connector for this
repository was not authorized during those runs, so the agent wrote locally
instead of pushing. This commit closes that gap.

## Coverage

26 digests spanning 2026-08-06 to 2026-09-03. Dates are not contiguous —
2026-08-15, 08-22, and 08-29 to 08-31 have no digest, because no run produced
one. Two dates have two digests each from separate runs; those keep a
`--run<N>` suffix rather than one being picked as canonical:

- `digest-2026-08-16--run16.md`, `digest-2026-08-16--run18.md`
- `digest-2026-09-02--run2.md`, `digest-2026-09-02--run3.md`

`assets/` holds the August prospecting review PDF and its preview image.
