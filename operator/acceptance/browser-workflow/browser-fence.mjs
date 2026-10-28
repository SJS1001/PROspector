export const ORIGIN = "http://127.0.0.1:8080";
export function classify(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "denied";
  }
  if (url.origin === ORIGIN && !url.username && !url.password) return "local";
  if (
    url.origin === "https://mail.google.com" &&
    url.pathname === "/mail/" &&
    url.searchParams.get("view") === "cm"
  )
    return "compose";
  return "denied";
}
export async function fenceContext(context, events) {
  // Context routes also cover the first request of a newly opened popup.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const kind = classify(request.url());
    events.push({ kind, method: request.method(), url: request.url() });
    if (kind !== "local") return route.abort("blockedbyclient");
    // Playwright route.continue follows redirects without rerouting each hop.
    // This acceptance runtime is deliberately redirect-free.
    const response = await route.fetch({ maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
      events.push({ kind: "redirect-denied" });
      return route.abort("blockedbyclient");
    }
    await route.fulfill({ response });
  });
  await context.routeWebSocket(/.*/, (socket) => {
    events.push({ kind: "websocket-denied" });
    socket.close();
  });
}
