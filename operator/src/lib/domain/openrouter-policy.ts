import type { LlmProviderId } from "@/lib/domain/llm";

/** Official chat-completions URL. Model ids are author/slug, with an optional ~ alias and colon variants. */
export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Documented Jev decision surfaces. Neither is the chat-completions API. */
export const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const OPENROUTER_SYSTEMONE_URL = "https://openrouter.ai/api/v1/systemone";

export const OPENROUTER_JEV_DECISION_MODELS = [
  "typesafe/jev-1.14",
  "typesafe/jev-1.13",
  "~typesafe/jev-latest",
] as const;

/** Catalog router. It picks a chat model; it is not the semantic decision model. */
export const OPENROUTER_JEV_ROUTER_MODEL = "typesafe/jev-router";

export const OPENROUTER_JEV_DECISION_MODEL = "typesafe/jev-1.14";

export const OPENROUTER_EXCLUSION_COPY =
  "Apollo and other non-AI services are not included in OpenRouter. This flow asks only for the OpenRouter API key. It does not show or send Apollo, ZoomInfo, Gmail, or a separate TypeSafe key. Jev decisions use this OpenRouter key on the Decisions API, not a TypeSafe account.";

export const NON_AI_SERVICES = ["apollo", "zoominfo", "jev", "gmail"] as const;
export type NonAiService = (typeof NON_AI_SERVICES)[number];

const MODEL_ID = /^(?:~)?[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function isOpenRouterModelId(value: string): boolean {
  const model = value.trim();
  return model.length > 0 && model.length <= 128 && MODEL_ID.test(model);
}

export function assertOpenRouterModelId(value: string): string {
  const model = value.trim();
  if (!isOpenRouterModelId(model)) {
    throw new Error("Enter an OpenRouter model id like openai/gpt-4. Apollo is not an OpenRouter model.");
  }
  return model;
}

export function isOpenRouterJevDecisionModel(value: string): boolean {
  return (OPENROUTER_JEV_DECISION_MODELS as readonly string[]).includes(value.trim());
}

export function assertOpenRouterChatModel(value: string): string {
  const model = assertOpenRouterModelId(value);
  if (isOpenRouterJevDecisionModel(model) || model === OPENROUTER_JEV_ROUTER_MODEL) {
    throw new Error("Jev decisions are not sent to the chat completions API.");
  }
  return model;
}

export function showsNonAiCredentials(providerId: string): boolean {
  return providerId !== "openrouter";
}

export type NonAiDecision = {
  dispatch: boolean;
  loadStoredSecret: boolean;
  message: string;
};

const SERVICE_LABEL: Record<NonAiService, string> = {
  apollo: "Apollo",
  zoominfo: "ZoomInfo",
  jev: "JEV",
  gmail: "Gmail",
};

export function decideNonAiDispatch(providerId: string, service: NonAiService): NonAiDecision {
  if (providerId === "openrouter") {
    return {
      dispatch: false,
      loadStoredSecret: false,
      message: `${SERVICE_LABEL[service]} is not included in OpenRouter. The request was not sent, and the saved ${SERVICE_LABEL[service]} key was not read.`,
    };
  }
  return { dispatch: true, loadStoredSecret: true, message: "" };
}

export type OpenRouterChatRequest = {
  url: string;
  method: "POST";
  headers: { Authorization: string; "Content-Type": "application/json" };
  body: {
    model: string;
    messages: { role: string; content: string }[];
    max_tokens: number;
  };
};

export function openRouterChatRequest(input: {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
}): OpenRouterChatRequest {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Add an OpenRouter API key in Connections before using that provider.");
  const model = assertOpenRouterChatModel(input.model);
  return {
    url: OPENROUTER_CHAT_COMPLETIONS_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: {
      model,
      messages: input.messages,
      max_tokens: input.maxTokens ?? 2200,
    },
  };
}

export type OpenRouterJevDecisionRequest = {
  url: typeof OPENROUTER_DECISIONS_URL;
  method: "POST";
  headers: { Authorization: string; "Content-Type": "application/json" };
  body: {
    model: (typeof OPENROUTER_JEV_DECISION_MODELS)[number];
    state: unknown;
    questions: Record<string, unknown>;
  };
};

export function openRouterJevDecisionRequest(input: {
  apiKey: string;
  model?: string;
  state: unknown;
  questions: Record<string, unknown>;
}): OpenRouterJevDecisionRequest {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("Add an OpenRouter API key before asking Jev for a decision.");
  const model = (input.model ?? OPENROUTER_JEV_DECISION_MODEL).trim();
  if (model === OPENROUTER_JEV_ROUTER_MODEL) {
    throw new Error("typesafe/jev-router picks a chat model. It is not the Jev decision model.");
  }
  if (!isOpenRouterJevDecisionModel(model)) {
    throw new Error("OpenRouter Jev decisions require typesafe/jev-1.14, typesafe/jev-1.13, or ~typesafe/jev-latest.");
  }
  return {
    url: OPENROUTER_DECISIONS_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: { model: model as OpenRouterJevDecisionRequest["body"]["model"], state: input.state, questions: input.questions },
  };
}

export type JevCredentialPlan =
  | { transport: "openrouter"; secrets: readonly ["llm_key"]; envFallback: false; model: typeof OPENROUTER_JEV_DECISION_MODEL }
  | { transport: "typesafe"; secrets: readonly ["jev", "jev_base_url"]; envFallback: true; model: "jev-latest" };

export function jevCredentialPlan(providerId: string): JevCredentialPlan {
  if (providerId === "openrouter") {
    return { transport: "openrouter", secrets: ["llm_key"], envFallback: false, model: OPENROUTER_JEV_DECISION_MODEL };
  }
  return { transport: "typesafe", secrets: ["jev", "jev_base_url"], envFallback: true, model: "jev-latest" };
}

export type ConnectionWrite = { name: string; value: string };

export function planConnectionWrites(input: {
  llmProvider?: string;
  llmKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  llmWorkspaceId?: string;
  xai?: string;
  apollo?: string;
  zoominfo?: string;
  jev?: string;
  jevBaseUrl?: string;
  gmailUser?: string;
  gmailPass?: string;
}): ConnectionWrite[] {
  const provider = input.llmProvider ?? "";
  const writes: ConnectionWrite[] = [];
  if (provider === "openrouter") {
    if (input.llmKey?.trim()) writes.push({ name: "llm_key", value: input.llmKey.trim() });
    if (input.llmModel?.trim()) writes.push({ name: "llm_model", value: assertOpenRouterModelId(input.llmModel) });
    if (provider) writes.push({ name: "llm_provider", value: "openrouter" });
  } else {
    if (input.xai?.trim()) writes.push({ name: "xai", value: input.xai.trim() });
    if (input.llmKey?.trim()) {
      writes.push({ name: "llm_key", value: input.llmKey.trim() });
      writes.push({ name: "xai", value: input.llmKey.trim() });
    }
    if (input.llmProvider?.trim()) writes.push({ name: "llm_provider", value: input.llmProvider.trim() });
    if (input.llmModel?.trim()) writes.push({ name: "llm_model", value: input.llmModel.trim() });
    if (input.llmBaseUrl?.trim()) writes.push({ name: "llm_base_url", value: input.llmBaseUrl.trim() });
    if (input.llmWorkspaceId !== undefined) writes.push({ name: "llm_workspace_id", value: input.llmWorkspaceId });
    if (input.apollo?.trim()) writes.push({ name: "apollo", value: input.apollo.trim() });
    if (input.zoominfo?.trim()) writes.push({ name: "zoominfo", value: input.zoominfo.trim() });
    if (input.jev?.trim()) writes.push({ name: "jev", value: input.jev.trim() });
    if (input.jevBaseUrl?.trim()) writes.push({ name: "jev_base_url", value: input.jevBaseUrl.trim().replace(/\/+$/, "") });
    if (input.gmailUser?.trim()) writes.push({ name: "gmail_user", value: input.gmailUser.trim() });
    if (input.gmailPass?.trim()) writes.push({ name: "gmail_pass", value: input.gmailPass.trim() });
  }
  return writes;
}

export function providerAllowsStoredKeyFallback(providerId: LlmProviderId | string): boolean {
  return providerId !== "openrouter";
}
