export type ContactConfirmationState = {
  generation: number;
  authorityReady: boolean;
  confirmed: boolean;
  pending: boolean;
};

export const INITIAL_CONTACT_CONFIRMATION_STATE: ContactConfirmationState = {
  generation: 0,
  authorityReady: false,
  confirmed: false,
  pending: false,
};

export function startAuthorityRefresh(state: ContactConfirmationState): ContactConfirmationState {
  return { generation: state.generation + 1, authorityReady: false, confirmed: false, pending: false };
}

export function finishAuthorityRefresh(state: ContactConfirmationState, generation: number, succeeded: boolean): ContactConfirmationState {
  return generation === state.generation ? { ...state, authorityReady: succeeded, confirmed: false, pending: false } : state;
}

export function setExplicitConfirmation(state: ContactConfirmationState, confirmed: boolean): ContactConfirmationState {
  return state.authorityReady && !state.pending ? { ...state, confirmed } : { ...state, confirmed: false };
}

export function beginConfirmationRequest(state: ContactConfirmationState): { state: ContactConfirmationState; generation: number } | null {
  if (!canSubmitContactConfirmation(state)) return null;
  return { state: { ...state, confirmed: false, pending: true }, generation: state.generation };
}

export function invalidateContactConfirmation(state: ContactConfirmationState): ContactConfirmationState {
  return { generation: state.generation + 1, authorityReady: false, confirmed: false, pending: false };
}

export function isCurrentConfirmationRequest(state: ContactConfirmationState, generation: number) {
  return state.generation === generation && state.pending;
}

export function canSubmitContactConfirmation(state: Pick<ContactConfirmationState, "authorityReady" | "confirmed" | "pending">) {
  return state.authorityReady && state.confirmed && !state.pending;
}
