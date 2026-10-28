import { getRequest } from "@tanstack/react-start/server";
import { assertLocalRequest, CrossSiteRequestError } from "./local-request";
export { CrossSiteRequestError };
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) throw new CrossSiteRequestError();
  assertLocalRequest(request);
}
