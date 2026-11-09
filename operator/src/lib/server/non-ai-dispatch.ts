import { decideNonAiDispatch } from "../domain/openrouter-policy.ts";
import { searchApolloPeople, type ApolloHit } from "./apollo.ts";

export type SecretReader = (name: "llm_provider" | "apollo") => Promise<string>;

export type ApolloDispatch = {
  dispatched: boolean;
  blocked: boolean;
  message: string;
  hits: ApolloHit[];
};

/** OpenRouter never reads the stored Apollo key and never calls Apollo. Other providers keep the existing search. */
export async function runApolloPeopleSearch(
  read: SecretReader,
  query: { accountName: string; domain: string; titles: string[] },
): Promise<ApolloDispatch> {
  const providerId = (await read("llm_provider")) || "xai";
  const decision = decideNonAiDispatch(providerId, "apollo");
  if (!decision.dispatch) return { dispatched: false, blocked: true, message: decision.message, hits: [] };
  const key = await read("apollo");
  if (!key) return { dispatched: false, blocked: true, message: "Add an Apollo API key in Connections.", hits: [] };
  const hits = await searchApolloPeople({ ...query, key, modelProvider: providerId });
  return { dispatched: true, blocked: false, message: "", hits };
}
