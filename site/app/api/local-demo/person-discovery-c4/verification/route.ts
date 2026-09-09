export const dynamic = "force-dynamic";

/** This route and its synthetic composer are erased from production builds. */
export async function POST(request: Request) {
  if (import.meta.env.DEV) {
    const { handleLocalDemoVerification } = await import("./_handler");
    return handleLocalDemoVerification(request);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}
