import assert from "node:assert/strict";
import test from "node:test";
import { createD1Fixture } from "./helpers/d1.mjs";

test("refresh and unknown outcomes consume confirmation and require fresh authority", async () => {
  const fixture = await createD1Fixture("contact-confirmation-state");
  try {
    const state = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-confirmation-state.ts", import.meta.url).pathname);
    let current = state.startAuthorityRefresh(state.INITIAL_CONTACT_CONFIRMATION_STATE);
    current = state.finishAuthorityRefresh(current, current.generation, true);
    current = state.setExplicitConfirmation(current, true);
    assert.equal(state.canSubmitContactConfirmation(current), true);
    const submission = state.beginConfirmationRequest(current);
    assert.ok(submission); assert.equal(submission.state.confirmed, false); assert.equal(submission.state.pending, true);
    current = state.invalidateContactConfirmation(submission.state);
    assert.deepEqual({ ready: current.authorityReady, confirmed: current.confirmed, pending: current.pending }, { ready: false, confirmed: false, pending: false });
    assert.equal(state.canSubmitContactConfirmation(current), false);
  } finally { await fixture.dispose(); }
});

test("late refresh and POST completions cannot win after a newer authority generation", async () => {
  const fixture = await createD1Fixture("contact-confirmation-race");
  try {
    const state = await fixture.vite.ssrLoadModule(new URL("../app/prospects/contact-confirmation-state.ts", import.meta.url).pathname);
    const firstRefresh = state.startAuthorityRefresh(state.INITIAL_CONTACT_CONFIRMATION_STATE);
    const secondRefresh = state.startAuthorityRefresh(firstRefresh);
    assert.equal(state.finishAuthorityRefresh(secondRefresh, firstRefresh.generation, true), secondRefresh, "stale refresh is ignored by identity");
    let current = state.finishAuthorityRefresh(secondRefresh, secondRefresh.generation, true);
    current = state.setExplicitConfirmation(current, true);
    const submission = state.beginConfirmationRequest(current); assert.ok(submission);
    current = state.startAuthorityRefresh(submission.state);
    assert.equal(state.isCurrentConfirmationRequest(current, submission.generation), false, "late POST cannot update a refreshed authority generation");
    assert.equal(current.confirmed, false);
  } finally { await fixture.dispose(); }
});
