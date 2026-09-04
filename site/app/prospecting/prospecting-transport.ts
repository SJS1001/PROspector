export function prospectingUrl(profileId?: string) {
  if (!profileId) return "/api/prospecting";
  return `/api/prospecting?${new URLSearchParams({ profileId }).toString()}`;
}
