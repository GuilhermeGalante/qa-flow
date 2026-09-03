import type {
  ApplyImportRequest,
  Cancelled,
  CommitRequest,
  CommitResponse,
  EvidenceBytes,
  EvidenceRequest,
  ExportRequest,
  GeneratedFileRequest,
  ImportPreview,
  ImportReceipt,
  IntegrityReport,
  LocalPreferences,
  RemoveEvidenceRequest,
  RepositoryPreview,
  RepositoryPullRequest,
  RepositoryPushRequest,
  RuntimeInfo,
  TransferResult,
  UpdateState,
  WorkspaceSnapshot,
} from "./dtos";

export interface WorkspacePort {
  initialize(): Promise<WorkspaceSnapshot>;
  commit(request: CommitRequest): Promise<CommitResponse>;
  addEvidence(request: EvidenceRequest, bytes: Uint8Array): Promise<CommitResponse>;
  readEvidence(evidenceId: string): Promise<EvidenceBytes>;
  removeEvidence(request: RemoveEvidenceRequest): Promise<CommitResponse>;
  verifyIntegrity(): Promise<IntegrityReport>;
}

export interface TransferPort {
  exportBackup(request: ExportRequest): Promise<TransferResult>;
  inspectBackup(): Promise<ImportPreview | Cancelled>;
  applyImport(request: ApplyImportRequest): Promise<ImportReceipt>;
  pushRepository(request: RepositoryPushRequest): Promise<TransferResult>;
  inspectRepository(): Promise<RepositoryPreview | Cancelled>;
  pullRepository(request: RepositoryPullRequest): Promise<ImportReceipt>;
  saveGeneratedFile(request: GeneratedFileRequest, bytes: Uint8Array): Promise<TransferResult>;
}

export interface RuntimePort {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  getPreferences(): Promise<LocalPreferences>;
  setPreferences(changes: LocalPreferences): Promise<void>;
  checkForUpdate(): Promise<UpdateState>;
  installUpdate(expectedVersion: string): Promise<void>;
}

