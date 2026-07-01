export type JobStatus =
  | "queued"
  | "generating"
  | "ready"
  | "failed"
  | "needs_review";

export type JudgmentVisibility = "public" | "private" | "organization";

export type JudgmentStatus = "pending" | "ready" | "needs_review";

export type UserRole = "user" | "admin" | "super_admin";

export type OrganizationRole = "owner" | "member";

export type AuthMethodKind = "magic_link" | "totp";

export type SourceTrust =
  | "external_verified"
  | "user_uploaded"
  | "ai_generated";

export type ExternalJudgmentRecord = {
  sourceProvider: string;
  externalId: string;
  caseNumber: string;
  courtName: string;
  decidedOn: string;
  title: string;
  sourceUrl?: string;
  caseType: "civil" | "criminal" | "administrative" | "family";
  summary?: string;
  originalText?: string;
};

export type JudgmentListItem = {
  id: string;
  caseNumber: string;
  courtName: string;
  decidedOn: string;
  title: string;
  caseType: string;
  status: JudgmentStatus;
  visibility: JudgmentVisibility;
  sourceProvider: string;
  latestJobStatus: JobStatus | null;
  notificationCount: number;
};

export type JudgmentDetail = JudgmentListItem & {
  sourceUrl: string | null;
  sourceTrust: SourceTrust;
  sourceSummary: string | null;
  originalText: string | null;
  createdByUserId: string | null;
};

export type EasyReadAnalysis = {
  summary: string;
  easyRead: string[];
  timeline: string[];
  claims: string[];
  courtReasoning: string[];
  finalResult: string;
  terms: Array<{ term: string; explanation: string }>;
  sourceGrounds: Array<{ label: string; excerpt: string }>;
  unknowns: string[];
  warnings: string[];
};

export type DashboardSnapshot = {
  userCount: number;
  organizationCount: number;
  publicJudgmentCount: number;
  queuedJobCount: number;
  failedJobCount: number;
  pendingNotificationCount: number;
};
