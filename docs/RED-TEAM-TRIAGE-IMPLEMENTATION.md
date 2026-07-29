# Implementation Red-Team Triage

Date: 2026-07-29

Reviewed repository commit: `ec2f9a0`

Reviewed deployed site source: `04ace2d04da5493b354ec9cf806c811257b85fc9`

Two adversarial reviews attacked product truthfulness and security separately.
Both returned **BLOCKED**. The findings below are accepted unless stated
otherwise.

## Product findings

| Finding | Triage | Disposition |
|---|---|---|
| No Wave gate is satisfied | Valid blocker | Wave 0 remains explicitly blocked. No real leads, personal data, credentials, schedules, or external authority may enter the pilot. |
| Synthetic state appeared operational | Valid blocker | Fixed after review: a persistent fixture banner was added; Runner/run/export claims were replaced with truthful disabled status; live counts are zero. |
| Local-only clicks appeared to make governance decisions | Valid blocker | Fixed after review: approval, defer, interview, discovery, prospect, and export actions are disabled until they are persisted, authorized, revision-safe, and audited. |
| Draft/unqualified fixtures appeared actionable | Valid high | Fixed after review: all action controls are disabled and qualification/readiness labels explicitly say fixture/sample/not operationally qualified. |
| Source-string test was presented as behavioral coverage | Valid high | Fixed in naming and documentation: it is now explicitly a build/source smoke. Behavioral coverage remains a Wave 0 blocker. |
| Schema is partial and unconstrained | Valid high | Not waived. It is an exploratory fixture schema and cannot accept live writes. Workspace-aware repositories, constraints, and concurrency tests are required before Wave 1. |
| No workflow reaches D1/R2 | Valid high | Not waived. The next vertical slice starts only after Wave 0 host/integration inputs are available. |
| Capability truth was absent from the reviewed commit | Valid high | Fixed by this report, the Wave 0 Capability Report, the implementation-plan status, and the ADR-0004 checkpoint. |

## Security findings

| Finding | Triage | Disposition |
|---|---|---|
| Mandatory Wave 0 controls are absent | Valid blocker | User/external inputs are required; see `WAVE-0-CAPABILITY-REPORT.md`. The private fixture may remain deployed, but production activation is prohibited. |
| Synthetic UI created operator-safety risk | Valid high | Fixed as described above and covered by the build/source smoke. A deployed authenticated screenshot/browser check remains required. |
| Tests prove none of the Wave 0 security contract | Valid high | Not waived. Required suites are listed in the capability report and implementation plan; no security gate is claimed. |

## Loop result

The implementation red-team loop converged on an honest **fixture-only private
pilot**, not a completed operational system. All locally fixable blocker/high
findings about misleading behavior are corrected. Remaining blocker/high
findings require new authority or external configuration and therefore stop the
loop at Wave 0 without broadening scope:

1. controlled Google OAuth test account/client;
2. hosted scheduler and Runner callback proof or a compatible host decision;
3. authenticated multi-principal D1/R2 isolation and durability proof;
4. export/restore and recovery implementation plus owner-supplied drill input.

Until those inputs exist, “complete” means the planning, adversarial consensus,
private fixture deployment, and truthful capability report are complete. It
does not mean the product roadmap or any Wave gate is complete.
