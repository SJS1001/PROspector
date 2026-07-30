import {
  consumeCsrfToken,
  csrfTokenFromRequest,
  CsrfTokenError,
  issueCsrfToken,
  withCsrfCookie,
} from "./csrf";
import type { InterviewPrincipal } from "./interview";
import {
  activatePrivateSyntheticProofAuthorization,
  decideMarketPlayProposal,
  MarketDiscoveryConflictError,
  readMarketDiscoveryState,
  startProductDiscoveryRun,
  submitPrivateSyntheticProof,
} from "./market-discovery";
import {
  makeProductReady,
  ProductReadinessConflictError,
} from "./product-readiness";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";

export const DISCOVERY_MUTATION_INTENT = "discovery-mutation";
export const MAX_DISCOVERY_BODY_BYTES = 8192;

export type DiscoveryHandlerDependencies = {
  database: D1Database;
  subjectPepper: string;
  pilotOwnerEmail: string;
  getIdentity(): Promise<{ email: string; displayName: string } | null>;
};

type ProductRow = { id: string; name: string; lifecycle: string; revision: number };

// Private-proof capability is private-hosted-synthetic-proposal-proof. Its bindings are exclusively derived in market-discovery: workspace,
// product, expectedProductRevision, reviewedSourceRevision, migrationDigest,
// fixtureDigest, provenance, evidenceReference, expiresAt, and operationDigest.
// The handler only selects the closed command; it never accepts raw submit
// findings or any of those authorization inputs from a client.

export async function handleDiscoveryGet(
  request: Request,
  dependencies: DiscoveryHandlerDependencies,
): Promise<Response> {
  try {
    const principal = await authenticatedPrincipal(dependencies);
    const productId = optionalProductLocator(new URL(request.url).searchParams.get("productId"));
    return projectionResponse(dependencies.database, principal, productId);
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (isConflict(error)) return privateWorkspaceUnavailable();
    return json({ error: "server_error" }, 500);
  }
}

export async function handleDiscoveryPost(
  request: Request,
  dependencies: DiscoveryHandlerDependencies,
): Promise<Response> {
  try {
    // Deliberately admit before inspecting request metadata, body, or a locator.
    const principal = await authenticatedPrincipal(dependencies);
    const rejected = validateSameOriginMutation(
      request,
      DISCOVERY_MUTATION_INTENT,
      MAX_DISCOVERY_BODY_BYTES,
    );
    if (rejected) return json({ error: rejected.error }, rejected.status);
    await consumeCsrfToken(
      dependencies.database,
      principal.subject,
      csrfTokenFromRequest(request),
    );
    const body = await readBoundedJson(request, MAX_DISCOVERY_BODY_BYTES);
    if (!isRecord(body) || !DISCOVERY_ACTIONS.includes(body.action as DiscoveryAction))
      return json({ error: "unsupported_action" }, 400);
    const action = body.action as DiscoveryAction;
    assertClosedCommand(body, action);
    const productId = await dispatch(action, body, dependencies.database, principal);
    return projectionResponse(dependencies.database, principal, productId);
  } catch (error) {
    if (error instanceof PilotAccessError) return privateWorkspaceUnavailable();
    if (error instanceof CsrfTokenError) return json({ error: error.code }, 403);
    if (isConflict(error)) return json({ error: "command_conflict" }, 409);
    if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
    const status = error instanceof Error && "status" in error && error.status === 413 ? 413 : 500;
    return json({ error: status === 413 ? "payload_too_large" : "server_error" }, status);
  }
}

async function dispatch(
  action: DiscoveryAction,
  body: Record<string, unknown>,
  database: D1Database,
  principal: InterviewPrincipal,
): Promise<string | null> {
  if (action === "read_current_state" || action === "read_product_readiness")
    return optionalString(body, "productId", 160).productId ?? null;

  if (action === "make_product_ready") {
    const productId = requiredString(body, "productId", 160);
    await makeProductReady(database, principal, {
      productId,
      expectedProductRevision: requiredRevision(body, "expectedProductRevision"),
      confirmedVersions: versionReferences(body),
      idempotencyKey: requiredString(body, "idempotencyKey", 80),
    });
    return productId;
  }

  if (action === "start_manual_discovery") {
    const productId = requiredString(body, "productId", 160);
    await startProductDiscoveryRun(database, principal, {
      productId,
      expectedProductRevision: requiredRevision(body, "expectedProductRevision"),
      triggerKind: "manual",
      idempotencyKey: requiredString(body, "idempotencyKey", 80),
    });
    return productId;
  }

  if (action === "decide_proposal") {
    const proposalId = requiredString(body, "proposalId", 160);
    await decideMarketPlayProposal(database, principal, {
      proposalId,
      expectedProposalRevision: requiredRevision(body, "expectedProposalRevision"),
      expectedProposalDigest: requiredDigest(body, "expectedProposalDigest"),
      decision: enumValue(body, "decision", ["explore", "defer", "dismiss"]),
      ...optionalString(body, "reason", 2000),
      ...(body.reviewAt === undefined ? {} : { reviewAt: requiredTimestamp(body, "reviewAt") }),
      ...(body.confirmed === undefined ? {} : { confirmed: requiredBoolean(body, "confirmed") }),
      idempotencyKey: requiredString(body, "idempotencyKey", 80),
    });
    return await productForProposal(database, principal, proposalId);
  }

  const productId = requiredString(body, "productId", 160);
  const input = {
    productId,
    expectedProductRevision: requiredRevision(body, "expectedProductRevision"),
    idempotencyKey: requiredString(body, "idempotencyKey", 80),
  };
  if (action === "activate_private_synthetic_proof_authorization")
    await activatePrivateSyntheticProofAuthorization(database, principal, input);
  else await submitPrivateSyntheticProof(database, principal, input);
  return productId;
}

async function projectionResponse(
  database: D1Database,
  principal: InterviewPrincipal,
  requestedProductId: string | null,
) {
  const workspace = await ownedWorkspace(database, principal);
  const products = await database.prepare(
    "SELECT id, name, lifecycle, revision FROM products WHERE workspace_id = ? ORDER BY name, id",
  ).bind(workspace.id).all<ProductRow>();
  const product = requestedProductId === null
    ? null
    : products.results.find((item) => item.id === requestedProductId) ?? null;
  if (requestedProductId !== null && !product) throw new PilotAccessError();

  const state = product === null ? null : await readMarketDiscoveryState(database, principal, product.id);
  const response = json({
    products: products.results.map((item) => ({ id: item.id, name: item.name, lifecycle: item.lifecycle, revision: Number(item.revision) })),
    selectedProductId: product?.id ?? null,
    readiness: state?.readiness ?? null,
    runs: state?.latestRun ? [state.latestRun] : [],
    proposals: state?.proposals ?? [],
    privateSyntheticProof: state?.privateProof ?? null,
  });
  return withCsrfCookie(response, await issueCsrfToken(database, principal.subject));
}


async function ownedWorkspace(database: D1Database, principal: InterviewPrincipal) {
  const workspace = await database.prepare(
    "SELECT id FROM workspaces WHERE owner_subject = ? LIMIT 1",
  ).bind(principal.subject).first<{ id: string }>();
  if (!workspace) throw new PilotAccessError();
  return workspace;
}

async function productForProposal(database: D1Database, principal: InterviewPrincipal, proposalId: string) {
  const workspace = await ownedWorkspace(database, principal);
  const row = await database.prepare(
    "SELECT product_id FROM market_play_proposals WHERE id = ? AND workspace_id = ? LIMIT 1",
  ).bind(proposalId, workspace.id).first<{ product_id: string }>();
  if (!row) throw new PilotAccessError();
  return row.product_id;
}

async function authenticatedPrincipal(dependencies: DiscoveryHandlerDependencies) {
  return admitPilotOwner(await dependencies.getIdentity(), dependencies.pilotOwnerEmail, dependencies.subjectPepper);
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function privateWorkspaceUnavailable() {
  return json({ error: "private_workspace_unavailable" }, 404);
}

const DISCOVERY_ACTIONS = [
  "read_product_readiness", "make_product_ready", "start_manual_discovery",
  "activate_private_synthetic_proof_authorization", "submit_private_synthetic_proof",
  "decide_proposal", "read_current_state",
] as const;
type DiscoveryAction = (typeof DISCOVERY_ACTIONS)[number];

function assertClosedCommand(body: Record<string, unknown>, action: DiscoveryAction) {
  const fields: Record<DiscoveryAction, readonly string[]> = {
    read_product_readiness: ["action", "productId"],
    read_current_state: ["action", "productId"],
    make_product_ready: ["action", "productId", "expectedProductRevision", "confirmedVersions", "idempotencyKey"],
    start_manual_discovery: ["action", "productId", "expectedProductRevision", "idempotencyKey"],
    decide_proposal: ["action", "proposalId", "expectedProposalRevision", "expectedProposalDigest", "decision", "reason", "reviewAt", "confirmed", "idempotencyKey"],
    activate_private_synthetic_proof_authorization: ["action", "productId", "expectedProductRevision", "idempotencyKey"],
    submit_private_synthetic_proof: ["action", "productId", "expectedProductRevision", "idempotencyKey"],
  };
  if (Object.keys(body).some((key) => !fields[action].includes(key)))
    throw new ProductReadinessConflictError("Invalid command");
  if (body.confirmed !== undefined && typeof body.confirmed !== "boolean")
    throw new ProductReadinessConflictError("Invalid command");
}

function versionReferences(body: Record<string, unknown>) {
  const values = body.confirmedVersions;
  if (!Array.isArray(values) || values.length !== 9) throw new ProductReadinessConflictError("Invalid command");
  return values.map((value) => {
    if (!isRecord(value) || Object.keys(value).some((key) => key !== "id" && key !== "digest"))
      throw new ProductReadinessConflictError("Invalid command");
    return { id: requiredString(value, "id", 160), digest: requiredDigest(value, "digest") };
  });
}

function requiredString(body: Record<string, unknown>, key: string, maximum: number) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum)
    throw new ProductReadinessConflictError("Invalid command");
  return value.trim();
}
function optionalString(body: Record<string, unknown>, key: string, maximum: number) {
  return body[key] === undefined ? {} : { [key]: requiredString(body, key, maximum) };
}
function requiredDigest(body: Record<string, unknown>, key: string) {
  const value = requiredString(body, key, 64);
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new ProductReadinessConflictError("Invalid command");
  return value.toLowerCase();
}
function requiredRevision(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Number.isSafeInteger(value) || value < 1) throw new ProductReadinessConflictError("Invalid command");
  return value;
}
function requiredTimestamp(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Number.isSafeInteger(value) || value <= 0) throw new ProductReadinessConflictError("Invalid command");
  return value;
}
function requiredBoolean(body: Record<string, unknown>, key: string) {
  if (typeof body[key] !== "boolean") throw new ProductReadinessConflictError("Invalid command");
  return body[key];
}
function enumValue<const T extends readonly string[]>(body: Record<string, unknown>, key: string, values: T): T[number] {
  const value = body[key];
  if (typeof value !== "string" || !values.includes(value)) throw new ProductReadinessConflictError("Invalid command");
  return value as T[number];
}
function optionalProductLocator(value: string | null) {
  if (value === null) return null;
  if (!value.trim() || value.length > 160) throw new PilotAccessError();
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isConflict(error: unknown) {
  return error instanceof ProductReadinessConflictError || error instanceof MarketDiscoveryConflictError;
}
