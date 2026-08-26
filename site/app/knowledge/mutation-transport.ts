const LOCAL_INTERVIEW_ACTIONS = new Set([
  "submit_interview_answer",
  "record_interview_decision",
]);

export type KnowledgeMutationTransport = {
  endpoint: "/api/knowledge" | "/api/interview";
  intent: "knowledge-mutation" | "interview-mutation";
  returnsKnowledgeProjection: boolean;
};

export function knowledgeMutationTransport(
  action: string,
  hostname: string,
): KnowledgeMutationTransport {
  if (LOCAL_INTERVIEW_ACTIONS.has(action) && isCanonicalLoopback(hostname)) {
    return {
      endpoint: "/api/interview",
      intent: "interview-mutation",
      returnsKnowledgeProjection: false,
    };
  }
  return {
    endpoint: "/api/knowledge",
    intent: "knowledge-mutation",
    returnsKnowledgeProjection: true,
  };
}

function isCanonicalLoopback(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}
