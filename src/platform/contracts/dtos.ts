import type {
  CaseDefinition,
  DemandColumn,
  EvidenceMeta,
  MigrationReport,
  PlanDefinition,
  QaDemand,
  ReportArtifact,
  TestRun,
  ValidationIssue,
  WorkspaceSettings,
} from "../../domain/types";

export const IPC_CONTRACT_VERSION = 1 as const;

export type DesktopErrorCode =
  | "CANCELLED"
  | "CONFLICT"
  | "VALIDATION"
  | "UNSUPPORTED_SCHEMA"
  | "STORAGE_LOCKED"
  | "DISK_FULL"
  | "PERMISSION_DENIED"
  | "CORRUPT_STORAGE"
  | "RECOVERY_REQUIRED"
  | "IO"
  | "UPDATE"
  | "INTERNAL";

export interface DesktopError {
  code: DesktopErrorCode;
  message: string;
  operationId?: string;
  retryable: boolean;
  issues?: ValidationIssue[];
  currentStorageRevision?: number;
}

export interface WorkspaceData {
  cases: CaseDefinition[];
  plans: PlanDefinition[];
  runs: TestRun[];
  reports: ReportArtifact[];
  evidence: EvidenceMeta[];
  demandColumns: DemandColumn[];
  demands: QaDemand[];
  settings: WorkspaceSettings;
  migrationReport: MigrationReport | null;
}

export interface WorkspaceHealth {
  status: "healthy" | "degraded" | "recoveryRequired";
  message?: string;
}

export interface WorkspaceSnapshot {
  ipcContractVersion: typeof IPC_CONTRACT_VERSION;
  storageRevision: number;
  committedAt?: string;
  health: WorkspaceHealth;
  workspace: WorkspaceData;
}

export type EntityKind =
  | "case"
  | "plan"
  | "run"
  | "report"
  | "demandColumn"
  | "demand"
  | "settings";

export interface StorageMutation {
  kind: EntityKind;
  action: "upsert" | "archive" | "delete";
  id: string;
  expectedEntityRevision?: number | null;
  payload?: unknown;
}

export interface CommitRequest {
  operationId: string;
  expectedStorageRevision: number;
  mutations: StorageMutation[];
}

export interface ChangedEntity {
  kind: EntityKind;
  id: string;
  payload?: unknown;
}

export interface CommitResponse {
  storageRevision: number;
  changed: ChangedEntity[];
  committedAt: string;
}

export interface EvidenceRequest {
  operationId: string;
  expectedStorageRevision: number;
  meta: EvidenceMeta;
  mutations: StorageMutation[];
}

export interface EvidenceBytes {
  evidenceId: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface RemoveEvidenceRequest {
  operationId: string;
  expectedStorageRevision: number;
  evidenceId: string;
  mutations: StorageMutation[];
}

export interface IntegrityReport {
  status: "healthy" | "degraded" | "recoveryRequired";
  checkedAt: string;
  issues: ValidationIssue[];
}

export interface ExportRequest {
  suggestedName?: string;
}

export interface TransferResult {
  status: "completed" | "cancelled";
  displayName?: string;
  bytesWritten?: number;
}

export interface Cancelled {
  status: "cancelled";
}

export interface ImportSummary {
  cases: number;
  plans: number;
  runs: number;
  reports: number;
  demandColumns: number;
  demands: number;
  evidence: number;
}

export interface ImportPreview {
  status: "ready";
  previewToken: string;
  sourceName: string;
  summary: ImportSummary;
}

export interface ApplyImportRequest {
  previewToken: string;
  mode: "merge" | "replace";
  expectedStorageRevision: number;
}

export interface ImportReceipt {
  storageRevision: number;
  committedAt: string;
  summary: ImportSummary;
  snapshot: WorkspaceSnapshot;
}

export interface RepositoryPushRequest {
  suggestedName?: string;
}

export interface RepositoryPreview extends ImportPreview {
  repositoryName: string;
}

export interface RepositoryPullRequest {
  previewToken: string;
  mode: "merge" | "replace";
  expectedStorageRevision: number;
}

export interface GeneratedFileRequest {
  suggestedName: string;
  mimeType: string;
  extension: string;
}

export interface RuntimeInfo {
  ipcContractVersion: typeof IPC_CONTRACT_VERSION;
  runtime: "web" | "desktop";
  persistence: "indexeddb" | "memory" | "sqlite";
  platform: string;
  appVersion: string;
  nativeFiles?: boolean;
  workspaceTransfers?: boolean;
}

export type LocalPreferences = Record<string, unknown> & {
  sidebarCollapsed?: boolean;
  demandViewMode?: "modal" | "fullscreen" | "sidebar";
  demandSidebarWidth?: number;
  recoveryRetentionCount?: number;
  recoveryRetentionDays?: number;
};

export type UpdateState =
  | { status: "unsupported" }
  | { status: "disabled"; reason: string }
  | { status: "upToDate" }
  | { status: "available"; version: string; notes?: string; publishedAt?: string };

export type SaveState =
  | { kind: "idle"; committedAt?: string }
  | { kind: "saving"; operationId: string }
  | { kind: "error"; operationId: string; error: DesktopError }
  | { kind: "conflict"; operationId: string; currentStorageRevision: number };
