import type {
  CaseDefinition,
  DemandColumn,
  DemandColumnSemantic,
  EvidenceMeta,
  ExploratoryRecord,
  OperationResult,
  PlanDefinition,
  QaDemand,
  ReportArtifact,
  RunContext,
  RunStatus,
  StepStatus,
  TestRun,
  WorkspaceSettings,
} from "../domain/types";
import type { ApplicationResult } from "../app/commitCoordinator";
import type {
  ImportPreview,
  GeneratedFileRequest,
  LocalPreferences,
  RepositoryPreview,
  RuntimeInfo,
  SaveState,
  TransferResult,
  UpdateState,
  WorkspaceData,
} from "../platform/contracts/dtos";

export interface QaSessionState {
  activeRunId: string | null;
  ready: boolean;
  initializing: boolean;
  storageError: string | null;
  storageRevision: number;
  saveState: SaveState;
  runtimeInfo: RuntimeInfo | null;
  preferences: LocalPreferences;
}

export interface QaActions {
  initialize: () => Promise<void>;
  saveCase: (testCase: CaseDefinition, expectedRevision: number | null) => Promise<ApplicationResult<CaseDefinition>>;
  archiveCase: (caseId: string) => Promise<ApplicationResult>;
  savePlan: (plan: PlanDefinition, expectedRevision: number | null) => Promise<ApplicationResult<PlanDefinition>>;
  archivePlan: (planId: string) => Promise<ApplicationResult>;
  startRun: (
    planId: string,
    context: RunContext,
    sourceRunId?: string,
  ) => Promise<ApplicationResult<TestRun>>;
  setActiveRun: (runId: string | null) => void;
  updateStepResult: (
    runId: string,
    caseId: string,
    stepId: string,
    status: StepStatus,
    actualResult: string,
  ) => Promise<ApplicationResult>;
  setRunStatus: (runId: string, status: RunStatus) => Promise<ApplicationResult>;
  addEvidence: (
    runId: string,
    ownerType: EvidenceMeta["ownerType"],
    ownerId: string,
    file: File | Blob,
    name?: string,
  ) => Promise<ApplicationResult<EvidenceMeta>>;
  getEvidenceData: (evidenceId: string) => Promise<string | null>;
  removeEvidence: (evidenceId: string) => Promise<ApplicationResult>;
  addExploratoryRecord: (
    runId: string,
    record: Omit<ExploratoryRecord, "id" | "createdAt" | "evidenceIds">,
  ) => Promise<ApplicationResult<ExploratoryRecord>>;
  createReport: (runId: string, title: string, notes: string) => Promise<ApplicationResult<ReportArtifact>>;
  removeReport: (reportId: string) => Promise<ApplicationResult>;
  saveDemand: (demand: QaDemand) => Promise<ApplicationResult<QaDemand>>;
  deleteDemand: (demandId: string) => Promise<ApplicationResult>;
  moveDemand: (demandId: string, columnId: string, order?: number) => Promise<ApplicationResult<QaDemand>>;
  addDemandColumn: (name: string, semantic: DemandColumnSemantic) => Promise<ApplicationResult<DemandColumn>>;
  updateDemandColumn: (
    columnId: string,
    name: string,
    semantic: DemandColumnSemantic,
  ) => Promise<ApplicationResult<DemandColumn>>;
  moveDemandColumn: (columnId: string, direction: -1 | 1) => Promise<ApplicationResult>;
  deleteDemandColumn: (columnId: string) => Promise<ApplicationResult>;
  updateSettings: (settings: Partial<WorkspaceSettings>) => Promise<ApplicationResult<WorkspaceSettings>>;
  setPreference: (changes: LocalPreferences) => Promise<OperationResult>;
  saveGeneratedFile: (
    request: GeneratedFileRequest,
    bytes: Uint8Array,
  ) => Promise<ApplicationResult<TransferResult>>;
  exportBackup: () => Promise<ApplicationResult<TransferResult>>;
  inspectBackup: () => Promise<ApplicationResult<ImportPreview | null>>;
  applyImport: (previewToken: string, mode: "merge" | "replace") => Promise<ApplicationResult>;
  pushRepository: () => Promise<ApplicationResult<TransferResult>>;
  inspectRepository: () => Promise<ApplicationResult<RepositoryPreview | null>>;
  pullRepository: (previewToken: string, mode?: "merge" | "replace") => Promise<ApplicationResult>;
  checkForUpdate: () => Promise<ApplicationResult<UpdateState>>;
  installUpdate: (expectedVersion: string) => Promise<ApplicationResult>;
}

export type QaState = WorkspaceData & QaSessionState & QaActions;

export type QaStateSetter = (
  partial: Partial<QaState> | ((state: QaState) => Partial<QaState>),
) => void;

