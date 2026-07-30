# Phase 1: User Setup Required

**Generated:** 2026-07-29  
**Phase:** 01-private-pilot-boundary  
**Status:** Complete

The deployment needs one server-only value identifying the sole pilot owner. Do not commit the value or expose it to client code.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [x] | `PILOT_OWNER_EMAIL` | The exact email of the approved account asserted by Codex Sites authentication | Codex Sites runtime environment/secret configuration |

## Dashboard Configuration

- [x] **Configure the sole pilot owner**
  - Location: Codex Sites project → Runtime environment variables
  - Set: `PILOT_OWNER_EMAIL` to the approved owner account email
  - Notes: Use the identity asserted by Sites. Do not add it to `.env`, Git, browser state, logs, API responses, or audit details.

## Verification

After hosted configuration, Codex will verify:

```bash
# Automated by the deployment proof:
# 1. Approved account receives the owner interview state.
# 2. Missing/mismatched identity receives the neutral 404 body.
# 3. No owner email appears in capability or denial responses.
```

Expected results:

- The approved owner can use the private interview.
- Every other identity receives `private_workspace_unavailable`.
- Denied requests create no workspace, CSRF, interview, knowledge, or audit rows.

---

**Once hosted proof passes:** Mark status as "Complete" at the top of this file.
