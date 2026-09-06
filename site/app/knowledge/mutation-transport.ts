const LOCAL_INTERVIEW_ACTIONS = new Set([
  "submit_interview_answer",
  "record_interview_decision",
  "advance_local_interview",
]);

export type KnowledgeMutationTransport = {
  endpoint: string;
  intent: "knowledge-mutation" | "interview-mutation";
  returnsKnowledgeProjection: boolean;
};

export function knowledgeMutationTransport(
  action: string,
  hostname: string,
  search = "",
): KnowledgeMutationTransport {
  const selection = interviewSelectionSearch(search);
  if (LOCAL_INTERVIEW_ACTIONS.has(action) && isCanonicalLoopback(hostname)) {
    return {
      endpoint: `/api/interview${selection}`,
      intent: "interview-mutation",
      returnsKnowledgeProjection: false,
    };
  }
  return {
    endpoint: `/api/knowledge${selection}`,
    intent: "knowledge-mutation",
    returnsKnowledgeProjection: true,
  };
}

export function interviewSelectionSearch(search: string) {
  const incoming = new URLSearchParams(search);
  const names = ["interviewSessionId", "marketPlayId", "sourceProposalVersionId"];
  if (!names.some((name) => incoming.has(name))) return "";
  const selected = new URLSearchParams();
  for (const name of names) selected.set(name, incoming.get(name) ?? "");
  return `?${selected.toString()}`;
}

function isCanonicalLoopback(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}
