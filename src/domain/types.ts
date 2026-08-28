export const QA_FLOW_SCHEMA_VERSION = 2 as const;

export type CasePriority = "low" | "medium" | "high" | "critical";
export type LifecycleStatus = "active" | "draft" | "archived";
export type StepType = "given" | "when" | "then" | "and";
export type StepStatus =
  | "not_run"
  | "passed"
  | "failed"
  | "blocked"
  | "skipped";
export type RunStatus =
  | "draft"
  | "in_progress"
  | "paused"
  | "completed"
  | "aborted";
export type WorkspaceMode = "browser" | "repository";
export type DemandColumnSemantic = "neutral" | "active" | "blocked" | "done";
export type DemandLinkType = "case" | "plan" | "run" | "report";

export interface DemandColumn {
  id: string;
  name: string;
  semantic: DemandColumnSemantic;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface DemandChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface DemandLink {
  type: DemandLinkType;
  id: string;
  label: string;
}

export interface QaDemand {
  id: string;
  title: string;
  description: string;
  columnId: string;
  order: number;
  priority: CasePriority;
  assignee: string;
  dueDate?: string;
  tags: string[];
  checklist: DemandChecklistItem[];
  links: DemandLink[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CaseStep {
  id: string;
  type: StepType;
  action: string;
  expectedResult: string;
}

export interface AutomationLink {
  framework: string;
  path: string;
  testName?: string;
}

export interface ExternalReference {
  system: string;
  value: string;
  url?: string;
}

export interface CaseDefinition {
  schemaVersion: typeof QA_FLOW_SCHEMA_VERSION;
  id: string;
  revision: number;
  title: string;
  description?: string;
  path: string[];
  priority: CasePriority;
  status: LifecycleStatus;
  tags: string[];
  precondition: string;
  steps: CaseStep[];
  automationLinks: AutomationLink[];
  externalReferences: ExternalReference[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanCaseReference {
  caseId: string;
  caseRevision: number;
}

export interface PlanDefinition {
  schemaVersion: typeof QA_FLOW_SCHEMA_VERSION;
  id: string;
  revision: number;
  name: string;
  description: string;
  objective: string;
  project: string;
  status: LifecycleStatus;
  tags: string[];
  caseRefs: PlanCaseReference[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunContext {
  environment: string;
  build: string;
  platform: string;
  device: string;
  browser: string;
  tester: string;
  notes: string;
}

export interface StepResult {
  status: StepStatus;
  actualResult: string;
  evidenceIds: string[];
  updatedAt: string;
}

export interface ExploratoryRecord {
  id: string;
  title: string;
  notes: string;
  classification: "note" | "bug" | "risk" | "idea";
  severity: "info" | "low" | "medium" | "high" | "critical";
  evidenceIds: string[];
  createdAt: string;
}

export interface RunSnapshot {
  plan: PlanDefinition;
  cases: CaseDefinition[];
}

export interface TestRun {
  schemaVersion: typeof QA_FLOW_SCHEMA_VERSION;
  id: string;
  attempt: number;
  sourceRunId?: string;
  planId: string;
  planRevision: number;
  status: RunStatus;
  context: RunContext;
  snapshot: RunSnapshot;
  results: Record<string, StepResult>;
  exploratoryRecords: ExploratoryRecord[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface EvidenceMeta {
  id: string;
  ownerType: "step" | "exploratory";
  ownerId: string;
  runId: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
}

export interface ReportArtifact {
  id: string;
  runId: string;
  title: string;
  notes: string;
  createdAt: string;
}

export interface WorkspaceSettings {
  mode: WorkspaceMode;
  name: string;
  repositoryPath: string;
  compactEvidence: boolean;
}

export interface MigrationReport {
  source: "qaflow-v1";
  migratedAt: string;
  casesCreated: number;
  plansCreated: number;
  runsCreated: number;
  warnings: string[];
}

export interface EvidenceBundleItem {
  meta: EvidenceMeta;
  dataUrl: string;
}

export interface WorkspaceBundle {
  schemaVersion: typeof QA_FLOW_SCHEMA_VERSION;
  exportedAt: string;
  cases: CaseDefinition[];
  plans: PlanDefinition[];
  runs: TestRun[];
  reports: ReportArtifact[];
  demandColumns?: DemandColumn[];
  demands?: QaDemand[];
  evidence: EvidenceBundleItem[];
  settings: WorkspaceSettings;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export interface OperationResult<T = undefined> {
  ok: boolean;
  value?: T;
  message: string;
  issues?: ValidationIssue[];
}
