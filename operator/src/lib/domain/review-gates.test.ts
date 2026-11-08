import assert from "node:assert/strict";
import test from "node:test";
import {
  deferDecisionReady,
  lockedTaskReason,
  reviewDecisionHint,
  reviewDecisionReady,
} from "./review-gates.ts";

test("review actions stay closed until the reason matches the server trim", () => {
  assert.equal(reviewDecisionReady(""), false);
  assert.equal(reviewDecisionReady("   "), false);
  assert.equal(reviewDecisionReady(" Owner reason "), true);
  assert.equal(deferDecisionReady("Owner reason", ""), false);
  assert.equal(deferDecisionReady("Owner reason", "not-a-date"), false);
  assert.equal(deferDecisionReady("Owner reason", "2026-11-08"), true);
});

test("the visible hint names the missing reason before the missing date", () => {
  assert.match(reviewDecisionHint("", "") ?? "", /reason/);
  assert.match(reviewDecisionHint("Owner reason", "") ?? "", /date/);
  assert.equal(reviewDecisionHint("Owner reason", "2026-11-08"), null);
});

test("locked navigation names the existing journey gate", () => {
  assert.equal(lockedTaskReason("always"), null);
  assert.match(lockedTaskReason("interview") ?? "", /company details/);
  assert.match(lockedTaskReason("approved") ?? "", /Approve a prospect/);
});
