import { uiText } from "@/lib/domain/plain-language";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateProduct,
  activateProfile,
  addSuppression,
  approveMessage,
  approvePackage,
  confirmAnswer,
  confirmDraftPlay,
  decideProposal,
  findProspects,
  getWorkspace,
  loadMiningSample,
  openInGmail,
  prepareMessage,
  preparePackage,
  proposeAnswer,
  recordMaterialSignal,
  reenterDueProspect,
  requestEnrichmentGrant,
  researchQuestion,
  reviewProspect,
  runDiscovery,
  saveConnections,
  startCorrectedReview,
  exportArchive,
  exportCrmCsv,
  tickSchedule,
  recordDeliveryEvent,
  restoreArchive,
  mergeContacts,
  parkGreenfield,
} from "@/lib/server/fns";
import type { ProposalDecision, ReviewDecision, WorkspaceDTO } from "@/lib/domain/types";

export const workspaceKey = ["workspace"] as const;

export function useWorkspace(enabled = true) {
  return useQuery({
    queryKey: workspaceKey,
    queryFn: () => getWorkspace(),
    staleTime: 8_000,
    enabled,
  });
}

function useWorkspaceMutation<TVariables>(
  fn: (vars: TVariables) => Promise<WorkspaceDTO>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(workspaceKey, data);
    },
    // A response can be lost after commit. Read authority again; never replay the action.
    onError: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}

export function useProposeAnswer() {
  return useWorkspaceMutation((input: { questionId: string; answer: string }) =>
    proposeAnswer({ data: input }),
  );
}
export function useConfirmAnswer() {
  return useWorkspaceMutation((input: { questionId: string }) =>
    confirmAnswer({ data: input }),
  );
}
export function useStartCorrectedReview() {
  return useWorkspaceMutation((input: { questionId: string }) =>
    startCorrectedReview({ data: input }),
  );
}
export function useResearchQuestion() {
  return useWorkspaceMutation((input: { questionId: string }) =>
    researchQuestion({ data: input }),
  );
}
export function useLoadMiningSample() {
  return useWorkspaceMutation(() => loadMiningSample());
}
export function useActivateProduct() {
  return useWorkspaceMutation(() => activateProduct());
}
export function useRunDiscovery() {
  return useWorkspaceMutation(() => runDiscovery());
}
export function useDecideProposal() {
  return useWorkspaceMutation(
    (input: { proposalId: string; decision: ProposalDecision; reason: string }) =>
      decideProposal({ data: input }),
  );
}
export function useConfirmDraftPlay() {
  return useWorkspaceMutation(
    (input: { playId: string; audience: string; likelyBuyer: string; offer: string }) =>
      confirmDraftPlay({ data: input }),
  );
}
export function useActivateProfile() {
  return useWorkspaceMutation(() => activateProfile());
}
export function useFindProspects() {
  return useWorkspaceMutation(() => findProspects());
}
export function useReviewProspect() {
  return useWorkspaceMutation(
    (input: {
      prospectId: string;
      assessmentId: string;
      expectedRevision: number;
      decision: ReviewDecision;
      reason: string;
      reviewAt?: string;
    }) => reviewProspect({ data: input }),
  );
}
export function useRecordMaterialSignal() {
  return useWorkspaceMutation(
    (input: { prospectId: string; expectedRevision: number; reason: string }) =>
      recordMaterialSignal({ data: input }),
  );
}
export function useReenterDueProspect() {
  return useWorkspaceMutation((input: { prospectId: string; expectedRevision: number }) =>
    reenterDueProspect({ data: input }),
  );
}
export function useRequestEnrichmentGrant() {
  return useWorkspaceMutation((input: { prospectId: string; reason: string }) =>
    requestEnrichmentGrant({ data: input }),
  );
}
export function usePreparePackage() {
  return useWorkspaceMutation((input: { prospectId: string }) =>
    preparePackage({ data: input }),
  );
}
export function usePrepareMessage() {
  return useWorkspaceMutation((input: { packageId: string; contactId: string }) =>
    prepareMessage({ data: input }),
  );
}
export function useApproveMessage() {
  return useWorkspaceMutation((input: { messageId: string; acknowledged: boolean; expectedDigest: string }) =>
    approveMessage({ data: input }),
  );
}
export function useOpenInGmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; expectedDigest: string }) =>
      openInGmail({ data: input }),
    onSuccess: (result) => queryClient.setQueryData(workspaceKey, result.workspace),
    onError: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}
export function useApprovePackage() {
  return useWorkspaceMutation((input: { packageId: string; expectedDigest: string }) =>
    approvePackage({ data: input }),
  );
}
export function useAddSuppression() {
  return useWorkspaceMutation((input: { kind: string; value: string; reason: string }) =>
    addSuppression({ data: input }),
  );
}
export function useSaveConnections() {
  return useWorkspaceMutation(
    (input: {
      xai: string;
      apollo: string;
      gmailUser: string;
      gmailPass: string;
      zoominfo?: string;
      monthlyBudgetCents?: number;
      llmProvider?: string;
      llmModel?: string;
      llmBaseUrl?: string;
      llmWorkspaceId?: string;
      llmKey?: string;
      scheduleEnabled?: boolean;
      huntBatch?: number;
      jev?: string;
      jevBaseUrl?: string;
    }) => saveConnections({ data: input }),
  );
}
export function useTickSchedule() {
  return useWorkspaceMutation(() => tickSchedule({ data: { manual: true } }));
}
export function useRecordDeliveryEvent() {
  return useWorkspaceMutation((input: { messageId: string; kind: string; note: string }) =>
    recordDeliveryEvent({ data: input }),
  );
}
export function useParkGreenfield() {
  return useWorkspaceMutation((input: { prospectId: string; expectedRevision: number }) =>
    parkGreenfield({ data: input }),
  );
}
export function useMergeContacts() {
  return useWorkspaceMutation((input: { keepId: string; dropId: string; reason: string }) =>
    mergeContacts({ data: input }),
  );
}

function downloadBlob(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useExportCrm() {
  return useMutation({
    mutationFn: async () => {
      const file = await exportCrmCsv();
      downloadBlob(file.filename, file.csv, "text/csv;charset=utf-8");
      return file;
    },
  });
}

export function useExportArchive() {
  return useMutation({
    mutationFn: async () => {
      const file = await exportArchive();
      downloadBlob(file.filename, file.json, "application/json");
      return file;
    },
  });
}

export function useRestoreArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { json: string }) => restoreArchive({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKey, refetchType: "none" }),
    onError: () => queryClient.invalidateQueries({ queryKey: workspaceKey }),
  });
}

export function mutationMessage(error: unknown) {
  if (error instanceof Error && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)) {
    return "The connection was interrupted. This action may have completed. Check the current workspace before trying again; reload if it could not refresh.";
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return "Sign in required.";
  }
  if (error instanceof Error && error.message) return uiText(error.message);
  return "The workspace could not complete that action.";
}
