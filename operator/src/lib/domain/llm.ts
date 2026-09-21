export type LlmSearchMode = "xai" | "openai" | "openrouter" | "builtin" | "none";

export type LlmProviderId =
  | "xai"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "groq"
  | "together"
  | "perplexity"
  | "google"
  | "mistral"
  | "custom";

export type LlmProvider = {
  id: LlmProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  search: LlmSearchMode;
  hint: string;
};

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    search: "xai",
    hint: "Native web search. Best default for discovery and hunts.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    search: "openai",
    hint: "Uses Responses + web search when the model allows it.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    search: "none",
    hint: "No live search. Proposed URLs still have to retrieve.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    search: "openrouter",
    hint: "Any OpenRouter model id. Web plugin enabled when the model supports it.",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    search: "none",
    hint: "OpenAI-compatible. Retrieval is the evidence gate.",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    search: "none",
    hint: "OpenAI-compatible.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
    search: "builtin",
    hint: "Sonar models search the web themselves.",
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-pro",
    search: "none",
    hint: "OpenAI-compatible Gemini endpoint.",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    search: "none",
    hint: "OpenAI-compatible.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    defaultModel: "",
    search: "none",
    hint: "HTTPS base URL ending in /v1. Private hosts are rejected.",
  },
];

export function llmProvider(id: string | null | undefined) {
  return LLM_PROVIDERS.find((item) => item.id === id) ?? LLM_PROVIDERS[0];
}
