export const dynamic = "force-dynamic";

/** Development-only route boundary.
 *
 * The preview handler lives in the sibling `_handler` module, which vinext never
 * treats as a route, and is reached only through a dynamic import inside a
 * branch that folds away in a production build. Rollup then drops the chunk,
 * taking the fictional metadata-only precondition with it. In production this
 * route answers 404 like any unknown path.
 *
 * POST rather than GET so the handler's same-origin check applies to a
 * mutation-shaped request; it reads no body and mutates nothing.
 *
 * tests/production-bundle-boundary.test.mjs enforces the fold against the
 * built artifact.
 */
export async function POST(request: Request) {
  if (import.meta.env.DEV) {
    const { handleCrmHandoffPreview } = await import("./_handler");
    return handleCrmHandoffPreview(request);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}
