export const dynamic = "force-dynamic";

/** Development-only route boundary.
 *
 * The seed handler lives in the sibling `_handler` module, which vinext never
 * treats as a route, and is reached only through a dynamic import inside a
 * branch that folds away in a production build. Rollup then drops the chunk,
 * taking domain/operator-journey-e1-acceptance and its synthetic fixture with
 * it. In production this route answers 404 like any unknown path.
 *
 * tests/production-bundle-boundary.test.mjs enforces that against the artifact.
 */
export async function POST(request: Request) {
  if (import.meta.env.DEV) {
    const { handleOperatorJourneySeed } = await import("./_handler");
    return handleOperatorJourneySeed(request);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}
