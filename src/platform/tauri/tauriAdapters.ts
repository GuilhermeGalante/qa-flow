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
} from "../contracts/dtos";
import type { RuntimePort, TransferPort, WorkspacePort } from "../contracts/ports";
import { TauriIpcClient, type TauriInvoke } from "./tauriIpc.ts";

export class TauriWorkspaceAdapter implements WorkspacePort {
  private readonly ipc: TauriIpcClient;

  constructor(ipc: TauriIpcClient) {
    this.ipc = ipc;
  }

  initialize(): Promise<WorkspaceSnapshot> {
    return this.ipc.call("workspace_initialize");
  }

  commit(request: CommitRequest): Promise<CommitResponse> {
    return this.ipc.call("workspace_commit", { request });
  }

  addEvidence(request: EvidenceRequest, bytes: Uint8Array): Promise<CommitResponse> {
    return this.ipc.call("evidence_add", { request, bytes });
  }

  readEvidence(evidenceId: string): Promise<EvidenceBytes> {
    return this.ipc.call("evidence_read", { evidenceId });
  }

  removeEvidence(request: RemoveEvidenceRequest): Promise<CommitResponse> {
    return this.ipc.call("evidence_remove", { request });
  }

  verifyIntegrity(): Promise<IntegrityReport> {
    return this.ipc.call("integrity_verify");
  }
}

export class TauriTransferAdapter implements TransferPort {
  private readonly ipc: TauriIpcClient;

  constructor(ipc: TauriIpcClient) {
    this.ipc = ipc;
  }

  exportBackup(request: ExportRequest): Promise<TransferResult> {
    return this.ipc.call("backup_export_dialog", { request });
  }

  inspectBackup(): Promise<ImportPreview | Cancelled> {
    return this.ipc.call("backup_inspect_dialog");
  }

  applyImport(request: ApplyImportRequest): Promise<ImportReceipt> {
    return this.ipc.call("backup_apply", { request });
  }

  pushRepository(request: RepositoryPushRequest): Promise<TransferResult> {
    return this.ipc.call("repository_push_dialog", { request });
  }

  inspectRepository(): Promise<RepositoryPreview | Cancelled> {
    return this.ipc.call("repository_inspect_dialog");
  }

  pullRepository(request: RepositoryPullRequest): Promise<ImportReceipt> {
    return this.ipc.call("repository_pull", { request });
  }

  saveGeneratedFile(request: GeneratedFileRequest, bytes: Uint8Array): Promise<TransferResult> {
    return this.ipc.call("generated_file_save_dialog", { request, bytes });
  }
}

export class TauriRuntimeAdapter implements RuntimePort {
  private readonly ipc: TauriIpcClient;

  constructor(ipc: TauriIpcClient) {
    this.ipc = ipc;
  }

  getRuntimeInfo(): Promise<RuntimeInfo> {
    return this.ipc.call("runtime_info");
  }

  getPreferences(): Promise<LocalPreferences> {
    return this.ipc.call("preferences_get");
  }

  setPreferences(changes: LocalPreferences): Promise<void> {
    return this.ipc.call("preferences_set", { changes });
  }

  checkForUpdate(): Promise<UpdateState> {
    return this.ipc.call("update_check");
  }
}

export function createTauriAdapters(invoke: TauriInvoke): {
  workspacePort: WorkspacePort;
  transferPort: TransferPort;
  runtimePort: RuntimePort;
} {
  const ipc = new TauriIpcClient(invoke);
  return {
    workspacePort: new TauriWorkspaceAdapter(ipc),
    transferPort: new TauriTransferAdapter(ipc),
    runtimePort: new TauriRuntimeAdapter(ipc),
  };
}
