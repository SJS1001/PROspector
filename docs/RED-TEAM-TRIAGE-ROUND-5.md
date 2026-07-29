# Red-Team Triage — Round 5

Date: 2026-07-29

Target: corrected Consensus Interview at application commit `4807bed`, private
Sites version 5, source `d5552cdcd7c1539ced00429ea657770f47594d84`.

## Accepted findings and corrections

| Prior finding | Resolution |
|---|---|
| Stale fixture-only boundary | Approved and documented one narrow, low-sensitivity owner-policy exception. Broader Wave 0 remains blocked. |
| One click fabricated Answer → Confirmation | Added persisted `awaiting_confirmation`; confirmation is a separate owner action. |
| Policy falsely claimed to drive scoring | UI and docs now state that scoring integration remains disabled. |
| Premise mislabeled as evidence | Added explicit premise, inference, and provenance fields; full question payload is source-digested. |
| Idempotency keys were not request-bound | Answer and confirmation store and compare canonical operation digests. |
| No load recovery | Added an authoritative-state retry action. |
| Guessable owner hash | Replaced it with HMAC-SHA-256 using a Sites-only secret. |
| CSRF contract absent | Added unpredictable, expiring, one-time, owner-bound tokens plus replay tests. Stable provider-session binding remains unproven and is not claimed. |
| Tests bypassed route/auth boundary | Added injectable handler tests for missing/spoofed identity, trusted identity, CSRF, cross-owner IDs, and the successful lifecycle. The thin route reads identity only through `getChatGPTUser`. |
| Body limit allocated before enforcement | Added streaming byte enforcement before body assembly. |
| Unexpected failures appeared as client errors | Unexpected handler errors now return HTTP 500. |

## Remaining constraints

- Hosted authenticated initialize/submit/reload/confirm/reload proof still
  requires the visible owner browser session.
- A second invited user is required for hosted cross-principal isolation proof.
- Composite database constraints, provider-session rotation, self-service
  deletion, and owner-identity migration remain future hardening work.
- No scoring consumer, scheduler, research runner, Gmail integration, live lead
  import, CSV export, or calling function is authorized by this slice.

## Local evidence

- Lint and production build: pass.
- Five tests: pass, including Miniflare-backed D1 concurrency and handler CSRF.
- Production dependency audit: zero vulnerabilities.
- React Doctor: 100/100, no issues.
