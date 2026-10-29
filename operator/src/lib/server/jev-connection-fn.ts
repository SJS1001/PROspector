import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { resolveJev } from "@/lib/server/secrets";
import { jevQualifyPage } from "@/lib/server/jev-tasks";
import { jevFailureMessage } from "@/lib/server/jev";

export const testJevConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const connection = await resolveJev(await getSql(), context.userId);
    const checkedAt = new Date().toISOString();
    if (!connection.apiKey) return { ok: false, checkedAt, message: "Save a TypeSafe key first." };
    try {
      // Exercise the same nine questions as a search, using synthetic public-safe text.
      const result = await jevQualifyPage({
        ...connection,
        accountName: "Connection test",
        targetName: "Example operating plant",
        url: "https://example.com/connection-test",
        title: "Synthetic connection test",
        pageText:
          "This is a fictional operating plant. Recovery is below target during the October 2026 ramp-up. The plant manager is investigating using historian and lab data.",
        profileText: "ONE helps operating plants diagnose production problems using existing data.",
      });
      return {
        ok: true,
        checkedAt,
        message: `Connected · ${result.model || "jev-latest"} · all 9 checks answered`,
      };
    } catch (error) {
      return { ok: false, checkedAt, message: jevFailureMessage(error) };
    }
  });
