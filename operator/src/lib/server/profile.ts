import { createHash } from "node:crypto";
import { CONFIGURATION_DIGEST, PASS_RULE } from "@/lib/domain/catalog";
import type { KnowledgeItem, ProfileReadinessItem, ProfileSnapshot } from "@/lib/domain/types";

export function snapshotFromKnowledge(knowledge: KnowledgeItem[]): ProfileSnapshot {
  const value = (id: string) =>
    knowledge.find((item) => item.questionId === id && item.status === "confirmed")?.confirmedAnswer ?? "";
  const company = value("company.legal_name");
  const product = value("product.name");
  const promise = value("product.promise");
  const play = value("play.market");
  const fit = value("profile.fit");
  return {
    company,
    product,
    promise,
    play,
    fit,
    offerId: "eight-week-diagnostic",
    passRule: PASS_RULE,
    configurationFamily: CONFIGURATION_DIGEST,
  };
}

export function digestSnapshot(snapshot: ProfileSnapshot) {
  return `sha256:${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 20)}`;
}

function item(
  id: string,
  label: string,
  questionId: string,
  complete: boolean,
  summary: string,
): ProfileReadinessItem {
  return { id, label, questionId, complete, summary };
}

export function productReadinessFromKnowledge(knowledge: KnowledgeItem[]): ProfileReadinessItem[] {
  const confirmed = (id: string) =>
    knowledge.find((item) => item.questionId === id)?.status === "confirmed";
  const answer = (id: string) =>
    knowledge.find((item) => item.questionId === id)?.confirmedAnswer ?? "Not confirmed";
  return [
    item("capability", "Capability", "product.capability", confirmed("product.capability"), answer("product.capability")),
    item("limitation", "Limitation", "product.limitations", confirmed("product.limitations"), answer("product.limitations")),
    item("delivery", "Delivery", "product.delivery", confirmed("product.delivery"), answer("product.delivery")),
    item("proof", "Proof", "product.proof", confirmed("product.proof"), answer("product.proof")),
    item("ownership", "Ownership", "product.ownership", confirmed("product.ownership"), answer("product.ownership")),
    item("guardrail", "Claim guardrail", "product.promise", confirmed("product.promise"), answer("product.promise")),
    item("sources", "Source & discovery policy", "product.runner", confirmed("product.runner"), answer("product.runner")),
    item("runner", "Default runner policy", "product.runner", confirmed("product.runner"), answer("product.runner")),
  ];
}

export function readinessFromKnowledge(knowledge: KnowledgeItem[]): ProfileReadinessItem[] {
  const confirmed = (id: string) =>
    knowledge.find((item) => item.questionId === id)?.status === "confirmed";
  const answer = (id: string) =>
    knowledge.find((item) => item.questionId === id)?.confirmedAnswer ?? "Not confirmed";
  return [
    item("scope", "Scope & offer", "company.legal_name", confirmed("company.legal_name"), answer("company.legal_name")),
    item("product", "Product & promise", "product.name", confirmed("product.name") && confirmed("product.promise"), answer("product.name")),
    item("play", "Market play", "play.market", confirmed("play.market"), answer("play.market")),
    item("fit", "Fit & disqualifiers", "profile.fit", confirmed("profile.fit"), answer("profile.fit")),
    item("roles", "Roles in bounds", "profile.roles", confirmed("profile.roles"), answer("profile.roles")),
    item("signals", "Signals & sources", "profile.signals", confirmed("profile.signals"), answer("profile.signals")),
    item("rubric", "Rubric & pass rule", "profile.fit", confirmed("profile.fit"), PASS_RULE),
    item("guardrail", "Proof & guardrail", "product.promise", confirmed("product.promise"), answer("product.promise")),
    item("contact", "Contact policy", "profile.roles", confirmed("profile.roles"), answer("profile.roles")),
    item("outreach", "Outreach policy", "profile.compliance", confirmed("profile.compliance"), answer("profile.compliance")),
    item("schedule", "Schedule & timezone", "profile.schedule", confirmed("profile.schedule"), answer("profile.schedule")),
    item("output", "Output policy", "profile.geo", confirmed("profile.geo"), answer("profile.geo")),
  ];
}

export function profileText(snapshot: ProfileSnapshot) {
  return [snapshot.company, snapshot.product, snapshot.promise, snapshot.play, snapshot.fit].join("\n");
}
