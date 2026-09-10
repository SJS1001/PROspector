import { readLocalDemoComposition, validateLocalDemoComposition } from "../../../../domain/local-demo-composition";

/** Pure read after route-shell admission. It accepts no request and admits no transition. */
export async function handleLocalDemoCompositionRead() {
  const composition = await readLocalDemoComposition();
  if (!await validateLocalDemoComposition(composition)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(composition, {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
