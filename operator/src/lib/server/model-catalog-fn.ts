import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { resolveLlmConfig } from "@/lib/server/llm";
import { fetchModelCatalog } from "@/lib/server/model-catalog";

export const getModelCatalog = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const config = await resolveLlmConfig(await getSql(), context.userId);
    return fetchModelCatalog(config);
  });
