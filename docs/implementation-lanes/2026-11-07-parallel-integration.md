# Isolated local integration — 2026-11-07

## Scope and source provenance

Base `origin/main`: `96981f4`. Worktree `/workspace/PROspector-integration`,
branch `integrate/parallel-local-20261107`. Six exact live PR heads verified
before local integration; original branches remain untouched and PRs unmerged.

| PR | Exact source HEAD | Local merge |
|---|---|---|
|143|0a6ead95b2dd3511b593f56511cf922d87554754|adc761c|
|144|39f4d86164a27db46f76c695d97b1e5a93466457|57a85b8|
|145|ae264220b3aaca33766c8469cdb55cb06be6c134|25490ff|
|146|69b3c6b24ad38b9f51f6c5add75fb6e243f38b26|aa7b745|
|147|bc2d4639c9f7337ae540f0f1e144ac1fa41bd3b5|51e0c36|
|148|bc28f56f79141f4bd553d9e33569afcd8fbdde7d|be0e077|

## Conflict decisions

- PR144 and PR145 each conflict with the already imported PR143 STATE metadata.
  Retain PR143's existing STATE bytes; do not invent integration progress or
  acceptance credit in shared planning metadata. Unique lane evidence here is
  authoritative for this integration attempt.
- PR145's ingestion test insertion conflicts with PR143's renamed reject
  re-entry scenario. Keep **both** the interleaved-capability test and PR143's
  Material Signal / ordinary-evidence rejection / sourced-disproof assertions.
  Preserve full-chain fixture migration setup from PR145. No case dropped.
- Other merges clean. Shared `tests/helpers/d1.mjs` and runtime runner unchanged
  from base. No dependency changes; node_modules installed independently.

## Exclusions and gates

Old PRs #112–124 were not integrated. In particular #118's unauthorized Phase7
persistence and alternate 0021 migration are excluded; there is no migration
collision to fix by importing that branch. The only new migration is PR145's
0021 runner-ingestion-integrity, preserving its snapshot/journal and runtime pins.

Shared runtime/init reliability repairs are separately owned and **not yet
included**. Await parent-coordinated repair commit before any canonical full gate.
No canonical suite started here. Existing individual PR145–148 full gates failed
exit 1; focused evidence is not a full-gate pass, and branch readiness is unproven.

## Combined local validation

Code candidate: `be0e077` (six local merge commits above).

- Combined 12-suite focused run **pending**:
  `/tmp/prospector-integration-focused.log`, actual exit on completion at
  `/tmp/prospector-integration-focused.exit` (shell 546438).
- Covers profile contract/integration, queue admission, runner assignment,
  ingestion/lifecycle, migration chain, runtime pins, UI/component interactions,
  Phase7 handoff eligibility, and Phase5 synthetic prerequisite plan.
- Lint running independently: `/tmp/prospector-integration-lint.log` (shell 546439).
- `git diff --check`: pass.
- No browser pass claimed; pinned-browser setup is separately owned.

Local integration only: no main mutation, remote PR merge, history rewrite,
force-push, hosted/provider/live-data/export/schedule/outbound effects, or phase
acceptance. All governance, immutable authority, exact approvals, and suppression
controls remain unchanged.
