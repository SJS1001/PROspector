export type KnowledgeStatus = "pending" | "proposed" | "confirmed";
export type ProposalDecision = "open" | "explore" | "defer" | "dismiss";
export type ProspectState =
  | "qualified"
  | "approved"
  | "rejected"
  | "deferred"
  | "assessed"
  | "disqualified";
export type ProspectOutcome =
  | "Passed"
  | "Failed"
  | "NotQualified"
  | "InsufficientEvidence"
  | "Disqualified";
export type ReviewDecision = "approve" | "reject" | "defer";
export type CapabilityStatus = "proven" | "blocked" | "unproven";
export type ContactRole = "champion" | "economic_buyer" | "validator";
export type EmailKind = "suggestion" | "verified" | "public_source";
export type ProfileStatus = "draft" | "active" | "stale";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type ProspectOrigin = "seed" | "run";
export type PackageStatus = "draft" | "approved";

export type ScoreDimension = {
  id: string;
  label: string;
  score: number;
  max: number;
  note: string;
};

export type Assessment = {
  passRule: string;
  hardDisqualifier: string | null;
  dimensions: ScoreDimension[];
};

export type KnowledgeItem = {
  id: string;
  questionId: string;
  scope: string;
  question: string;
  proposedAnswer: string | null;
  confirmedAnswer: string | null;
  status: KnowledgeStatus;
  evidence: string;
  inference: string;
  recommendation: string;
  sortOrder: number;
};

export type MarketProposal = {
  id: string;
  title: string;
  problemMatch: string;
  customerType: string;
  examples: string;
  likelyBuyer: string;
  risks: string;
  productFit: string;
  evidence: string;
  decision: ProposalDecision;
  decisionReason: string | null;
};

export type Prospect = {
  id: string;
  accountName: string;
  accountId: string;
  targetName: string;
  targetId: string;
  offerId: string;
  score: number;
  outcome: ProspectOutcome;
  state: ProspectState;
  revision: number;
  configurationDigest: string;
  assessmentId: string;
  assessment: Assessment;
  evidenceExcerpt: string;
  evidenceUrl: string;
  evidenceTier: number;
  evidenceDate: string;
  cooldownUntil: string | null;
  reviewAt: string | null;
  materialSignal: boolean;
  lastReason: string | null;
  origin: ProspectOrigin;
  runId: string | null;
  lane: "operating" | "greenfield";
};

export type Contact = {
  prospectId: string;
  id: string;
  accountName: string;
  fullName: string;
  role: ContactRole;
  emailKind: EmailKind;
  emailDisplay: string;
  source: string;
  confidence: string;
  prospectState: ProspectState;
  publishedUrl: string | null;
  phoneDisplay: string | null;
};

export type OutreachMessage = {
  id: string;
  packageId: string;
  prospectId: string;
  accountName: string;
  contactId: string;
  toEmail: string;
  subject: string;
  body: string;
  digest: string;
  status: string;
  acknowledged: boolean;
  gmailUrl: string | null;
  blockedReason: string | null;
  approvedAt: string | null;
  dispatchedAt: string | null;
};

export type Capability = {
  id: string;
  name: string;
  status: CapabilityStatus;
  reason: string;
};

export type BriefCounts = {
  qualified: number;
  approved: number;
  rejected: number;
  deferred: number;
  reviewed: number;
  weekExportReady: number;
  weekTarget: number;
  weekStart: string;
  weekEnd: string;
  greenfield: number;
};

export type DeliveryEvent = {
  id: string;
  messageId: string;
  kind: string;
  note: string;
  createdAt: string;
};

export type ProfileSnapshot = {
  company: string;
  product: string;
  promise: string;
  play: string;
  fit: string;
  offerId: string;
  passRule: string;
  configurationFamily: string;
};

export type ProfileReadinessItem = {
  id: string;
  label: string;
  questionId: string;
  complete: boolean;
  summary: string;
};

export type ProfileState = {
  status: ProfileStatus;
  digest: string | null;
  snapshot: ProfileSnapshot | null;
  activatedAt: string | null;
  readiness: ProfileReadinessItem[];
};

export type ProspectingRun = {
  id: string;
  trigger: string;
  status: RunStatus;
  configurationDigest: string;
  candidateCount: number;
  qualifiedCount: number;
  terminalReason: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type EvidenceSignal = {
  id: string;
  runId: string;
  prospectId: string | null;
  url: string;
  title: string;
  excerpt: string;
  tier: number;
  retrievedAt: string;
  recency: string;
};

export type DiscoveryRun = {
  id: string;
  trigger: string;
  status: RunStatus;
  proposalCount: number;
  terminalReason: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type DraftPlay = {
  id: string;
  proposalId: string;
  title: string;
  status: string;
  notes: string | null;
  audience: string | null;
  likelyBuyer: string | null;
  offer: string | null;
};

export type RunnerRecord = {
  provider: string;
  model: string;
  tools: string[];
  credentialsStored: boolean;
  assignment: string;
};

export type OutreachPackage = {
  id: string;
  prospectId: string;
  accountName: string;
  status: PackageStatus;
  subject: string;
  body: string;
  digest: string;
  approvedAt: string | null;
};

export type Suppression = {
  id: string;
  kind: string;
  value: string;
  reason: string;
};

export type CrmPreview = {
  authorized: boolean;
  eligibleCount: number;
  excludedCount: number;
  rows: { accountName: string; reason: string }[];
};

export type ConnectionFlags = {
  xai: boolean;
  llm: boolean;
  llmProvider: string;
  llmProviderLabel: string;
  llmModel: string;
  llmSearch: string;
  llmBaseUrl: string;
  llmWorkspaceId: string;
  scheduleEnabled: boolean;
  huntBatch: number;
  apollo: boolean;
  apolloLeadLeft: number | null;
  apolloLeadLimit: number | null;
  apolloCreditsAt: string | null;
  gmail: boolean;
  gmailUser: string | null;
  zoominfo: boolean;
  jev: boolean;
  secretsEncrypted: boolean;
  inboxScannedAt: string | null;
  monthlyBudgetCents: number;
  spendUsedCents: number;
  spendMonth: string;
};

export type WorkspaceDTO = {
  companyName: string;
  companyLegal: string;
  interviewComplete: boolean;
  sampleAvailable: boolean;
  knowledge: KnowledgeItem[];
  currentQuestion: KnowledgeItem | null;
  proposals: MarketProposal[];
  prospects: Prospect[];
  contacts: Contact[];
  brief: BriefCounts;
  capabilities: Capability[];
  product: ProfileState;
  profile: ProfileState;
  runs: ProspectingRun[];
  discoveryRuns: DiscoveryRun[];
  draftPlays: DraftPlay[];
  runner: RunnerRecord;
  signals: EvidenceSignal[];
  packages: OutreachPackage[];
  messages: OutreachMessage[];
  suppressions: Suppression[];
  deliveryEvents: DeliveryEvent[];
  crm: CrmPreview;
  connections: ConnectionFlags;
  morningDue: boolean;
  generatedAt: string;
};
