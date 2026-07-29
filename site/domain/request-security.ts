export type MutationRejection = {
  error: string;
  status: number;
};

export function validateSameOriginMutation(
  request: Request,
  expectedIntent: string,
  maximumBytes: number,
): MutationRejection | null {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const intent = request.headers.get("x-prospector-intent");
  const contentType = request.headers.get("content-type") ?? "";
  const declaredLength = request.headers.get("content-length");

  if (origin !== url.origin || fetchSite !== "same-origin")
    return { error: "foreign_origin", status: 403 };
  if (intent !== expectedIntent)
    return { error: "missing_intent", status: 403 };
  if (!contentType.toLowerCase().startsWith("application/json"))
    return { error: "unsupported_content_type", status: 415 };
  if (
    declaredLength !== null &&
    (!Number.isFinite(Number(declaredLength)) || Number(declaredLength) > maximumBytes)
  )
    return { error: "payload_too_large", status: 413 };
  return null;
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<Record<string, unknown>> {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maximumBytes) {
    const error = new Error("payload_too_large") as Error & { status?: number };
    error.status = 413;
    throw error;
  }
  return JSON.parse(rawBody) as Record<string, unknown>;
}
