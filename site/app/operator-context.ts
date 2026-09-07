"use client";

import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Presentation-only operator scope trail: plain-language labels for the
 * Company/Product/Market Play/Profile the operator is currently looking at.
 * This context never carries a database ID, digest, or credential, and
 * setting it never issues a request or changes server authority — leaves
 * keep their own technical IDs in their own collapsed evidence records.
 * Setting a parent field clears every narrower field beneath it, so the
 * trail can never point at a stale descendant of a since-changed parent.
 */
export type OperatorScope = Readonly<{
  company: string | null;
  product: string | null;
  marketPlay: string | null;
  profile: string | null;
}>;

export const EMPTY_OPERATOR_SCOPE: OperatorScope = Object.freeze({
  company: null,
  product: null,
  marketPlay: null,
  profile: null,
});

export function withOperatorCompany(scope: OperatorScope, company: string | null): OperatorScope {
  if (scope.company === company) return scope;
  return { company, product: null, marketPlay: null, profile: null };
}

export function withOperatorProduct(scope: OperatorScope, product: string | null): OperatorScope {
  if (scope.product === product) return scope;
  return { ...scope, product, marketPlay: null, profile: null };
}

export function withOperatorMarketPlay(scope: OperatorScope, marketPlay: string | null): OperatorScope {
  if (scope.marketPlay === marketPlay) return scope;
  return { ...scope, marketPlay, profile: null };
}

export function withOperatorProfile(scope: OperatorScope, profile: string | null): OperatorScope {
  if (scope.profile === profile) return scope;
  return { ...scope, profile };
}

export type OperatorScopeApi = Readonly<{
  scope: OperatorScope;
  setCompany(company: string | null): void;
  setProduct(product: string | null): void;
  setMarketPlay(marketPlay: string | null): void;
  setProfile(profile: string | null): void;
}>;

const OperatorScopeContext = createContext<OperatorScopeApi | null>(null);

export function OperatorScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<OperatorScope>(EMPTY_OPERATOR_SCOPE);
  const api = useMemo<OperatorScopeApi>(() => ({
    scope,
    setCompany: (company) => setScope((current) => withOperatorCompany(current, company)),
    setProduct: (product) => setScope((current) => withOperatorProduct(current, product)),
    setMarketPlay: (marketPlay) => setScope((current) => withOperatorMarketPlay(current, marketPlay)),
    setProfile: (profile) => setScope((current) => withOperatorProfile(current, profile)),
  }), [scope]);
  return createElement(OperatorScopeContext.Provider, { value: api }, children);
}

export function useOperatorScope(): OperatorScopeApi {
  const api = useContext(OperatorScopeContext);
  if (!api) throw new Error("useOperatorScope must be used within an OperatorScopeProvider");
  return api;
}
