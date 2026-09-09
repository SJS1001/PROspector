# Validation results

**Artifact snapshot:** 2026-08-27

**Scope:** the local documentation, examples, and validation tooling under
`docs/hvac-aeo-seo/`. This receipt does not validate a live contractor,
frontend, Business Profile, hosted system, data flow, credential, legal status,
ranking, citation, lead, booking, sale, or revenue result.

## Artifact checks

| Check | Result | Evidence |
|---|---|---|
| Required package files | Pass | `node docs/hvac-aeo-seo/scripts/validate.mjs` |
| Markdown relative targets and heading anchors | Pass | Package validator reads every Markdown file and validates local files/fragments. |
| JSON-LD syntax | Pass | All three `.jsonld` examples parse with `JSON.parse`. |
| JSON-LD privacy/placeholders | Pass | URLs are `.invalid`, the hybrid example has a fictional public address, the service-area example has no address, and no `aggregateRating` exists. |
| Evidence-ID definitions | Pass | Every `P/R/S/O/E/X` ID used in the README has a definition. |
| Normative evidence crosswalk | Pass | Required README, playbook, UX, examples/governance, and coverage scopes exist; independent review remains the semantic check. |
| Untracked-file whitespace | Pass | Every file was checked with `git diff --no-index --check /dev/null <file>`; this avoids the false assurance of ordinary `git diff` on untracked files. |
| Credential-pattern screening | Pass | Package validator found no private-key header or common long API-token pattern. This is a narrow safety check, not a general secret scanner. |

## External source-link check

The final live check extracted 104 unique external Markdown URLs and followed
redirects with a 15–20 second timeout on 2026-08-27.

- 103 returned a response below HTTP 400 using HEAD with GET fallback. OpenAI's
  publisher FAQ returned a successful HEAD response but HTTP 403 to a separate
  GET probe; its current content was also verified through live web retrieval at
  the same URL.
- The U.S. Department of Energy heat-pump page returned HTTP 404 to the Node
  client while official web search resolved the exact URL and current page
  content. It is retained as a documented transport/rendering exception:
  `https://www.energy.gov/energysaver/heat-pump-systems`.
- No unexpected redirect to a non-owning or commercial domain was accepted as
  source evidence; the final probe reported zero cross-host redirects.

Live reachability does not prove that a source supports the nearby claim. The
primary-source review and independent red team separately checked source-to-
claim fit and surfaced corrections.

## Repository checks

| Command | Result | Relevance |
|---|---|---|
| `node --version` | Pass: `v24.16.0` | Exceeds the repository's Node 22.13 minimum. |
| `npm test` from `site/` | Pass: exit 0 | Confirms the existing application remains healthy; it is not package validation. |
| `npm run lint` from `site/` | Pass: exit 0 | Confirms existing application lint; it is not source-to-claim validation. |

## Independent challenge

A fresh reviewer with no authoring context attacked the integrated package as
written analysis and an executable plan/spec. The exact original report is
preserved in [`RED-TEAM-REPORT.md`](RED-TEAM-REPORT.md); every finding and
ground-truth decision is in [`RED-TEAM-TRIAGE.md`](RED-TEAM-TRIAGE.md).

The original verdict was `BLOCKED` because the package called itself validated
without a durable package receipt and because it lacked evidence-class,
emergency, privacy, and Business Profile change-control gates. The unsupported
status claim and every valid documentation finding were remediated. One low
finding was rejected after line-level ground truth because the alleged duplicate
did not exist.

After the receipt, crosswalk, link set, and digest were corrected, the same
independent reviewer performed a final read-only closure check and returned
`RESOLVED`: the validator and manifest reproduced, the 104-link receipt matched,
the crosswalk pointed to the correct research section, implementation tests were
not misrepresented as executed, and no BLOCKER or HIGH finding remained.

## Intentionally open checks

The following remain incomplete until a real contractor implementation and the
required authority exist:

- quarterly recheck of volatile platform and regulatory sources after this
  snapshot;
- local fire, emergency, gas-utility, legal, privacy, recording, telemarketing,
  accessibility, trade-license, permit, rebate, and claims approval;
- live UI accessibility, mobile, error, recovery, emergency-route, privacy,
  security, and task testing;
- authorized Business Profile change dry run and recovery/suspension exercise;
- approved production data flow and synthetic privacy/security negative tests;
- contractor fact, credential, profile, call, booking, lead-quality, sale, and
  revenue evidence;
- field evidence that any tactic improves qualified outcomes.

These checks are not replaceable by fixtures, prose, a digest, or passing local
tests.

## Artifact digest

[`MANIFEST.sha256`](MANIFEST.sha256) records the SHA-256 digest of 15 final
artifact files. It intentionally excludes itself and this receipt to avoid a
self-referential digest. The package validator recomputes every listed digest,
rejects missing or extra manifest paths, and returned:

```text
PASS: 16 required files present
PASS: 12 Markdown files have valid local targets and anchors
PASS: 3 JSON-LD files parse and satisfy placeholder/privacy controls
PASS: 41 used README evidence IDs are defined
PASS: 15 final artifact files match MANIFEST.sha256
PASS: crosswalk scopes and basic secret-pattern controls are present
```

The manifest file's own SHA-256 is:

```text
b98b115d74d8681eb3d937ef55e211811fd7af881dfebee7877185d3afb63f90  docs/hvac-aeo-seo/MANIFEST.sha256
```

Reproduce with:

```sh
node docs/hvac-aeo-seo/scripts/validate.mjs
shasum -a 256 docs/hvac-aeo-seo/MANIFEST.sha256
```
