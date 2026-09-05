import type {
  MailDispatchEnvelope,
  MailDispatchResult,
  MailPort,
  MailReconciliationRequest,
  MailReconciliationResult,
  OriginatedEventSyncRequest,
  OriginatedEventSyncResult,
} from "../domain/ports/mail";

export class GmailAdapterUnavailableError extends Error {
  readonly code = "gmail_adapter_unconfigured" as const;

  constructor() {
    super("gmail_adapter_unconfigured");
    this.name = "GmailAdapterUnavailableError";
  }
}

export type UnconfiguredGmailAdapter = MailPort & Readonly<{
  state: "UNCONFIGURED";
  providerInvocationCount: 0;
}>;

function unavailable(): GmailAdapterUnavailableError {
  return new GmailAdapterUnavailableError();
}

/**
 * Immutable deny-only launch placeholder. It deliberately has no constructor
 * inputs or external-capability seams and does not inspect caller-controlled
 * values before denial.
 */
export const UNCONFIGURED_GMAIL_ADAPTER: UnconfiguredGmailAdapter = Object.freeze({
  state: "UNCONFIGURED",
  providerInvocationCount: 0,
  async dispatch(_envelope: MailDispatchEnvelope): Promise<MailDispatchResult> {
    void _envelope;
    throw unavailable();
  },
  async reconcile(_request: MailReconciliationRequest): Promise<MailReconciliationResult> {
    void _request;
    throw unavailable();
  },
  async syncOriginatedEvents(_request: OriginatedEventSyncRequest): Promise<OriginatedEventSyncResult> {
    void _request;
    throw unavailable();
  },
});

export function createUnconfiguredGmailAdapter(): UnconfiguredGmailAdapter {
  return UNCONFIGURED_GMAIL_ADAPTER;
}
