export const dynamic = "force-dynamic";

/** Development-only read boundary for the fixed LOCAL_DEMO composition graph. */
export async function GET(request: Request) {
  if (import.meta.env.DEV) {
    const { handleLocalDemoComposition } = await import("./_handler");
    return handleLocalDemoComposition(request);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}
