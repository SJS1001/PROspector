import { createMiddleware } from "@tanstack/react-start";
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { assertSameSiteRequest } = await import("./isolation.server");
  const { requireUserId } = await import("./verify.server");
  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    return next({ context: { userId } });
  } catch (error) {
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    if (error instanceof Error && "status" in error && typeof error.status === "number")
      setResponseStatus(error.status);
    throw error;
  }
});
