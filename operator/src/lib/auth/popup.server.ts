/** Legacy sandbox OAuth is deliberately unavailable in the local application. */
export async function handleAuthPopupRequest(): Promise<Response> {
  return new Response("Not found", { status: 404 });
}
