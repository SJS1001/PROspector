import { createFileRoute } from "@tanstack/react-router";
import { handleLocalAuth } from "@/lib/auth/server";
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleLocalAuth(request),
      POST: ({ request }) => handleLocalAuth(request),
    },
  },
});
