export type RunnerCandidate = {
  accountName: string;
  targetName: string;
  url: string;
  excerpt?: string;
  notes?: Record<string, string>;
};

/** Empty is valid only when the provider explicitly returned a valid empty list. */
export function parseCandidates(text: string, limit: number): RunnerCandidate[] {
  const raw =
    text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ??
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "The AI returned an incomplete or unreadable list. No results were accepted. Try a smaller search batch.",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("candidates" in parsed) ||
    !Array.isArray(parsed.candidates)
  )
    throw new Error("The AI response is missing its candidate list. No results were accepted.");
  const rows: RunnerCandidate[] = [];
  for (const item of parsed.candidates) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.accountName !== "string" ||
      !item.accountName.trim() ||
      typeof item.url !== "string" ||
      !item.url.startsWith("https://") ||
      (item.targetName != null && typeof item.targetName !== "string") ||
      (item.excerpt != null && typeof item.excerpt !== "string") ||
      (item.notes != null &&
        (typeof item.notes !== "object" ||
          Array.isArray(item.notes) ||
          Object.values(item.notes).some((v) => typeof v !== "string")))
    )
      throw new Error("The AI returned an invalid candidate. No results were accepted. Try again.");
    try {
      const url = new URL(item.url);
      if (url.username || url.password) throw new Error();
    } catch {
      throw new Error("The AI returned an invalid source URL. No results were accepted.");
    }
    rows.push({
      accountName: item.accountName.trim().slice(0, 120),
      targetName: (item.targetName || item.accountName).slice(0, 160),
      url: item.url,
      excerpt: item.excerpt?.slice(0, 400),
      notes: item.notes,
    });
  }
  return rows.slice(0, limit);
}
