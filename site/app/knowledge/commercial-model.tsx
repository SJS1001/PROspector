"use client";

import { useState } from "react";
import type { CommercialHierarchyNode, CommercialModelProjection } from "../../domain/commercial-model";

type DraftType = "product" | "market_play" | "customer_profile";
export type CommercialCommand = { type: DraftType; parentId: string; name: string; expectedRevision: number; operationKey: string };

export function CommercialModelView({ projection, operationKey, knowledgeCounts = new Map(), onCreateDraft, onProposeChange }: {
  projection: CommercialModelProjection;
  operationKey: string;
  knowledgeCounts?: ReadonlyMap<string, { confirmed: number; proposed: number }>;
  onCreateDraft(command: CommercialCommand): void;
  onProposeChange(node: CommercialHierarchyNode): void;
}) {
  const nodes = allNodes(projection);
  const [selectedId, setSelectedId] = useState(projection.path[0]?.id ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(nodes.map((node) => node.id)));
  const selected = nodes.find((node) => node.id === selectedId) ?? projection.path[0];
  if (!selected) return <section className="panel" role="alert">Commercial hierarchy is unavailable. Mutation controls are hidden until the current version can be checked.</section>;
  const descendantsFor = (parentId: string) => nodes.filter((node) => node.parentId === parentId);
  const counts = knowledgeCounts.get(selected.id) ?? { confirmed: 0, proposed: 0 };
  const toggle = (id: string) => setExpanded((prior) => { const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <div className="knowledge-layout commercial-model-view">
    <section className="panel" aria-label="Commercial hierarchy">
      <h2>Commercial Model</h2>
      <p>Company-wide identity stays separate from Market Play and Customer Profile relationships.</p>
      <Tree node={projection.path.find((node) => node.type === "company")!} descendantsFor={descendantsFor} selectedId={selected.id} expanded={expanded} onToggle={toggle} onSelect={setSelectedId} />
    </section>
    <section className="panel">
      <span className="eyebrow">{selected.type.replaceAll("_", " ")}</span>
      <h2>{selected.name}</h2>
      <dl className="confirmation-proof">
        <div><dt>Parent path</dt><dd>{pathFor(selected, projection)}</dd></div>
        <div><dt>Lifecycle</dt><dd>{selected.lifecycle}{selected.nurtureState ? " / nurture" : ""}</dd></div>
        <div><dt>Confirmed Knowledge</dt><dd>{counts.confirmed}</dd></div>
        <div><dt>Proposed Knowledge</dt><dd>{counts.proposed}</dd></div>
      </dl>
      <h3>Owned knowledge</h3>
      <p>{categoriesFor(selected.type, projection).join(", ") || "Offer context is created only through confirmed hierarchy-interview lineage."}</p>
      <ScopeLegend />
      {selected.type !== "offer" && selected.type !== "company" && <button className="outline" type="button" onClick={() => onProposeChange(selected)}>Propose change</button>}
      {selected.type === "offer" && <p className="saved">Offer lineage: only an accepted, corrected, or rescoped hierarchy-completion decision can create this Offer. Question, answer, decision, Knowledge Version, and audit references are server-derived.</p>}
      <DraftForm node={selected} operationKey={operationKey} onCreateDraft={onCreateDraft} />
      {!projection.offers.length && <p className="saved">No Offer exists yet. Complete the hierarchy-completion interview; only its Accept, Correct, or Rescope decision can create the first Offer under the displayed Customer Profile.</p>}
    </section>
  </div>;
}

function Tree({ node, descendantsFor, selectedId, expanded, onToggle, onSelect }: { node: CommercialHierarchyNode; descendantsFor(id: string): CommercialHierarchyNode[]; selectedId: string; expanded: Set<string>; onToggle(id: string): void; onSelect(id: string): void }) {
  const descendants = descendantsFor(node.id); const hasChildren = descendants.length > 0;
  return <ul><li>
    <div><button type="button" aria-label={`${expanded.has(node.id) ? "Collapse" : "Expand"} ${node.name}`} disabled={!hasChildren} onClick={() => onToggle(node.id)}>{hasChildren ? (expanded.has(node.id) ? "−" : "+") : "·"}</button>
      <button type="button" aria-current={selectedId === node.id ? "page" : undefined} onClick={() => onSelect(node.id)}><b>{node.type.replaceAll("_", " ")}</b> {node.name} <small>{node.lifecycle}</small></button></div>
    {hasChildren && expanded.has(node.id) && <>{descendants.map((child) => <Tree key={child.id} node={child} descendantsFor={descendantsFor} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />)}</>}
  </li></ul>;
}

function DraftForm({ node, operationKey, onCreateDraft }: { node: CommercialHierarchyNode; operationKey: string; onCreateDraft(command: CommercialCommand): void }) {
  const type: DraftType | null = node.type === "company" ? "product" : node.type === "product" ? "market_play" : node.type === "market_play" ? "customer_profile" : null;
  const [name, setName] = useState("");
  if (!type) return null;
  const label = type === "market_play" ? "Create Draft Play" : type === "customer_profile" ? "Create Draft Profile" : "Create Draft Product";
  return <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) { onCreateDraft({ type, parentId: node.id, name: name.trim(), expectedRevision: node.revision, operationKey }); setName(""); } }}>
    <h3>{label}</h3><label>Name <input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label><button className="primary" type="submit">{label}</button>
  </form>;
}
function categoriesFor(type: CommercialHierarchyNode["type"], projection: CommercialModelProjection) { return type === "product" ? projection.knowledgeCategories.product : type === "market_play" ? projection.knowledgeCategories.marketPlay : type === "customer_profile" ? projection.knowledgeCategories.customerProfile : []; }
function allNodes(projection: CommercialModelProjection) { const byId = new Map<string, CommercialHierarchyNode>(); for (const node of [...projection.path, ...projection.products, ...projection.plays, ...projection.profiles, ...projection.offers]) byId.set(node.id, node); return [...byId.values()]; }
function pathFor(node: CommercialHierarchyNode, projection: CommercialModelProjection) { const all = allNodes(projection); const byId = new Map(all.map((item) => [item.id, item])); const path: string[] = []; let current: CommercialHierarchyNode | undefined = node; while (current) { path.unshift(current.name); current = current.parentId ? byId.get(current.parentId) : undefined; } return path.join(" / "); }
function ScopeLegend() { return <section><h3>Scope legend</h3><ul><li>Organization and Contact identity: Company-wide.</li><li>Account, Target, relevance, evidence, qualification, and outreach: Market Play/Profile scoped.</li></ul></section>; }
