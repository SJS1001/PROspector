import { getRequest } from "@tanstack/react-start/server";
import { assertLocalRequest, CrossSiteRequestError } from "./local-request.ts";
export { CrossSiteRequestError };
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) throw new CrossSiteRequestError();
  assertLocalRequest(request);
}
