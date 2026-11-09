import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("CSRF cookies reject tokens that the consumer would not accept", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const csrf = await vite.ssrLoadModule(new URL("../domain/csrf.ts", import.meta.url).pathname);
    const token = "a".repeat(43);
    assert.equal(
      csrf.csrfCookie(token),
      `__Host-prospector-csrf=${token}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict`,
    );
    assert.equal(
      csrf.csrfCookie(token, "local-demo"),
      `prospector-local-csrf=${token}; Path=/; Max-Age=900; HttpOnly; SameSite=Strict`,
    );
    for (const invalid of ["", "a".repeat(42), `${"a".repeat(43)};`, "a".repeat(43) + "\r\nSet-Cookie: x=y", "a".repeat(44)]) {
      assert.throws(() => csrf.csrfCookie(invalid), (error) => error?.code === "invalid_csrf_token", invalid);
      assert.throws(() => csrf.withCsrfCookie(new Response(null), invalid), (error) => error?.code === "invalid_csrf_token");
    }
  } finally {
    await vite.close();
  }
});
