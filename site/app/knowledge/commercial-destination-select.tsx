"use client";

import type { CommercialHierarchyNode } from "../../domain/commercial-model";
import type { InterviewDestination } from "../../domain/interview";

export type ExactCommercialDestination = InterviewDestination & {
  id: string;
  locator: string;
};

export function CommercialDestinationSelect({
  destinations,
  value,
  onChange,
  label,
}: {
  destinations: readonly CommercialHierarchyNode[];
  value: string;
  onChange(id: string): void;
  label: string;
}) {
  return <label>{label}
    <select
      required
      value={value}
      disabled={!destinations.length}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Choose an exact commercial destination</option>
      {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destinationLabel(destination, destinations)}</option>)}
    </select>
    {!destinations.length && <span className="control-reason">Unavailable until the server returns the authorized commercial hierarchy.</span>}
  </label>;
}

export function selectedCommercialDestination(
  destinations: readonly CommercialHierarchyNode[],
  id: string,
): ExactCommercialDestination | null {
  const destination = destinations.find((candidate) => candidate.id === id);
  if (!destination) return null;
  return {
    scopeType: destination.type,
    id: destination.id,
    locator: destination.name,
  };
}

export function destinationLabel(
  destination: CommercialHierarchyNode,
  destinations: readonly CommercialHierarchyNode[],
) {
  const byId = new Map(destinations.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  const path: string[] = [];
  let current: CommercialHierarchyNode | undefined = destination;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return `${publicScopeLabel(destination.type)} · ${path.join(" / ")} · ref ${destination.id}`;
}

function publicScopeLabel(scopeType: CommercialHierarchyNode["type"]) {
  return scopeType.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
