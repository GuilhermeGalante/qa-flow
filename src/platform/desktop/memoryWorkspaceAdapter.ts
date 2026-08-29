import { cloneJson } from "../../domain/validation.ts";
import type {
  CommitRequest,
  CommitResponse,
  EvidenceBytes,
  EvidenceRequest,
  IntegrityReport,
  RemoveEvidenceRequest,
  WorkspaceData,
  WorkspaceSnapshot,
} from "../contracts/dtos";
import { IPC_CONTRACT_VERSION } from "../contracts/dtos.ts";
import { desktopError } from "../contracts/errors.ts";
import type { WorkspacePort } from "../contracts/ports";
import {
  applyStorageMutations,
  cloneWorkspaceData,
  createEmptyWorkspaceData,
} from "../contracts/workspaceData.ts";

export interface MemoryWorkspaceAdapterOptions {
  initialWorkspace?: WorkspaceData;
  onBeforeCommit?: (request: CommitRequest | EvidenceRequest | RemoveEvidenceRequest) => void | Promise<void>;
}

export class MemoryWorkspaceAdapter implements WorkspacePort {
  private readonly options: MemoryWorkspaceAdapterOptions;
  private workspace: WorkspaceData;
  private storageRevision = 0;
  private committedAt: string | undefined;
  private readonly evidenceBytes = new Map<string, Uint8Array>();

  constructor(options: MemoryWorkspaceAdapterOptions = {}) {
    this.options = options;
    this.workspace = cloneWorkspaceData(options.initialWorkspace ?? createEmptyWorkspaceData());
  }

  async initialize(): Promise<WorkspaceSnapshot> {
    return this.snapshot();
  }

  async commit(request: CommitRequest): Promise<CommitResponse> {
    await this.options.onBeforeCommit?.(request);
    this.assertRevision(request.expectedStorageRevision, request.operationId);
    this.workspace = applyStorageMutations(this.workspace, request.mutations);
    return this.confirm(request.mutations.map(({ kind, id, payload }) => ({ kind, id, payload })));
  }

  async addEvidence(request: EvidenceRequest, bytes: Uint8Array): Promise<CommitResponse> {
    await this.options.onBeforeCommit?.(request);
    this.assertRevision(request.expectedStorageRevision, request.operationId);
    if (this.workspace.evidence.some((item) => item.id === request.meta.id)) {
      throw desktopError("CONFLICT", "A evidência já existe.", {
        operationId: request.operationId,
        retryable: false,
        currentStorageRevision: this.storageRevision,
      });
    }
    const next = applyStorageMutations(this.workspace, request.mutations);
    next.evidence = [...next.evidence, cloneJson(request.meta)];
    this.workspace = next;
    this.evidenceBytes.set(request.meta.id, new Uint8Array(bytes));
    return this.confirm(request.mutations.map(({ kind, id, payload }) => ({ kind, id, payload })));
  }

  async readEvidence(evidenceId: string): Promise<EvidenceBytes> {
    const meta = this.workspace.evidence.find((item) => item.id === evidenceId);
    const bytes = this.evidenceBytes.get(evidenceId);
    if (!meta || !bytes) throw desktopError("IO", "Evidência não encontrada.", { retryable: false });
    return { evidenceId, mimeType: meta.mimeType, bytes: new Uint8Array(bytes) };
  }

  async removeEvidence(request: RemoveEvidenceRequest): Promise<CommitResponse> {
    await this.options.onBeforeCommit?.(request);
    this.assertRevision(request.expectedStorageRevision, request.operationId);
    const next = applyStorageMutations(this.workspace, request.mutations);
    next.evidence = next.evidence.filter((item) => item.id !== request.evidenceId);
    this.workspace = next;
    this.evidenceBytes.delete(request.evidenceId);
    return this.confirm(request.mutations.map(({ kind, id, payload }) => ({ kind, id, payload })));
  }

  async verifyIntegrity(): Promise<IntegrityReport> {
    return { status: "healthy", checkedAt: new Date().toISOString(), issues: [] };
  }

  replaceWorkspace(workspace: WorkspaceData, evidence: Map<string, Uint8Array> = new Map()): WorkspaceSnapshot {
    this.workspace = cloneWorkspaceData(workspace);
    this.evidenceBytes.clear();
    evidence.forEach((bytes, id) => this.evidenceBytes.set(id, new Uint8Array(bytes)));
    this.storageRevision += 1;
    this.committedAt = new Date().toISOString();
    return this.snapshot();
  }

  snapshot(): WorkspaceSnapshot {
    return {
      ipcContractVersion: IPC_CONTRACT_VERSION,
      storageRevision: this.storageRevision,
      committedAt: this.committedAt,
      health: { status: "healthy" },
      workspace: cloneWorkspaceData(this.workspace),
    };
  }

  private assertRevision(expected: number, operationId: string): void {
    if (expected !== this.storageRevision) {
      throw desktopError("CONFLICT", "O workspace foi alterado desde a última leitura.", {
        operationId,
        retryable: true,
        currentStorageRevision: this.storageRevision,
      });
    }
  }

  private confirm(changed: CommitResponse["changed"]): CommitResponse {
    this.storageRevision += 1;
    this.committedAt = new Date().toISOString();
    return { storageRevision: this.storageRevision, committedAt: this.committedAt, changed };
  }
}
