import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const OWNER_EMAIL = "owner@example.com";
const SUBJECT_PEPPER = "test-only-pilot-pepper-with-at-least-32-bytes";

test("admission normalizes the configured owner and fails neutrally", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const { admitPilotOwner, PilotAccessError } = await vite.ssrLoadModule(
      new URL("../domain/pilot-access.ts", import.meta.url).pathname,
    );
    const owner = await admitPilotOwner(
      { email: "  OWNER@Example.COM ", displayName: "Owner" },
      "owner@example.com",
      SUBJECT_PEPPER,
    );
    assert.equal(owner.displayName, "Owner");
    assert.match(owner.subject, /^[a-f0-9]{64}$/);

    for (const [identity, configuredOwnerEmail] of [
      [null, OWNER_EMAIL],
      [{ email: "outsider@example.com", displayName: "Outsider" }, OWNER_EMAIL],
      [{ email: OWNER_EMAIL, displayName: "Owner" }, ""],
      [{ email: OWNER_EMAIL, displayName: "Owner" }, "not-an-email"],
    ]) {
      await assert.rejects(
        admitPilotOwner(
          identity,
          configuredOwnerEmail,
          SUBJECT_PEPPER,
        ),
        (error) =>
          error instanceof PilotAccessError &&
          error.code === "private_workspace_unavailable" &&
          !/owner@example|outsider@example|workspace id/i.test(error.message),
      );
    }
  } finally {
    await vite.close();
  }
});
