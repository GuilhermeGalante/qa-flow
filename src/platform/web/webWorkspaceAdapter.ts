import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { migrateLegacyState } from "../../domain/migration.ts";
import {
  QA_FLOW_SCHEMA_VERSION,
  type EvidenceBundleItem,
  type WorkspaceBundle,
} from "../../domain/types.ts";
import { cloneJson } from "../../domain/validation.ts";
import { bytesToDataUrl, dataUrlToBytes } from "../contracts/binary.ts";
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

export const WEB_STORE_KEY = "qaflow-v2-store";
export const LEGACY_WEB_STORE_KEY = "qaflow-store";
export const webEvidenceKey = (id: string) => `qaflow-v2:evidence:${id}`;

export interface AsyncKeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

const indexedDbKeyValueStorage: AsyncKeyValueStorage = {
  get: (key) => idbGet(key),
  set: (key, value) => idbSet(key, value),
  delete: (key) => idbDel(key),
};

interface PersistedWebState extends WorkspaceData {
  storageRevision?: number;
  lastCommittedAt?: string;
}

interface PersistEnvelope {
  state: PersistedWebState;
  version: number;
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function decodePersistedWorkspace(raw: unknown): {
  workspace: WorkspaceData;
  storageRevision: number;
  committedAt?: string;
} | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (!parsed || typeof parsed !== "object") return null;
    const envelope = parsed as Partial<PersistEnvelope>;
    const source = envelope.state;
    if (!source || typeof source !== "object") return null;
    const defaults = createEmptyWorkspaceData();
    return {
      workspace: {
        cases: arrayOrEmpty(source.cases),
        plans: arrayOrEmpty(source.plans),
        runs: arrayOrEmpty(source.runs),
        reports: arrayOrEmpty(source.reports),
        evidence: arrayOrEmpty(source.evidence),
        demandColumns: Array.isArray(source.demandColumns) && source.demandColumns.length
          ? source.demandColumns
          : defaults.demandColumns,
        demands: arrayOrEmpty(source.demands),
        settings: source.settings && typeof source.settings === "object"
          ? { ...defaults.settings, ...source.settings }
          : defaults.settings,
        migrationReport: source.migrationReport ?? null,
      },
      storageRevision: typeof source.storageRevision === "number" && source.storageRevision >= 0
        ? source.storageRevision
        : 0,
      committedAt: typeof source.lastCommittedAt === "string" ? source.lastCommittedAt : undefined,
    };
  } catch {
    return null;
  }
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

export class WebWorkspaceAdapter implements WorkspacePort {
  private readonly storage: AsyncKeyValueStorage;
  private workspace = createEmptyWorkspaceData();
  private storageRevision = 0;
  private committedAt: string | undefined;
  private initialized = false;

  constructor(storage: AsyncKeyValueStorage = indexedDbKeyValueStorage) {
    this.storage = storage;
  }

  async initialize(): Promise<WorkspaceSnapshot> {
    if (this.initialized) return this.snapshot();
    const rawPersisted = await this.storage.get(WEB_STORE_KEY);
    const persisted = decodePersistedWorkspace(rawPersisted);
    if (rawPersisted !== undefined && rawPersisted !== null && !persisted) {
      throw desktopError(
        "CORRUPT_STORAGE",
        "O workspace local não pôde ser lido. Os dados não foram substituídos por um workspace vazio.",
        { retryable: false },
      );
    }
    if (persisted) {
      this.workspace = cloneWorkspaceData(persisted.workspace);
      this.storageRevision = persisted.storageRevision;
      this.committedAt = persisted.committedAt;
    }

    if (!this.hasCurrentContent()) {
      const legacyRaw = await this.storage.get<unknown>(LEGACY_WEB_STORE_KEY);
      const parsedLegacy = typeof legacyRaw === "string" ? JSON.parse(legacyRaw) as unknown : legacyRaw;
      const migration = migrateLegacyState(parsedLegacy);
      if (migration) {
        this.workspace = {
          ...this.workspace,
          cases: migration.cases,
          plans: migration.plans,
          runs: migration.runs,
          reports: migration.reports,
          evidence: migration.evidence.map((item) => item.meta),
          migrationReport: migration.report,
        };
        for (const item of migration.evidence) {
          await this.storage.set(webEvidenceKey(item.meta.id), item.dataUrl);
        }
        this.committedAt = migration.report.migratedAt;
        await this.persist(this.workspace, this.storageRevision, this.committedAt);
      }
    }

    this.initialized = true;
    return this.snapshot();
  }

  async commit(request: CommitRequest): Promise<CommitResponse> {
    this.assertInitialized();
    this.assertRevision(request.expectedStorageRevision, request.operationId);
    const next = applyStorageMutations(this.workspace, request.mutations);
    const response = this.nextResponse(request.mutations.map(({ kind, id, payload }) => ({ kind, id, payload })));
    await this.persist(next, response.storageRevision, response.committedAt);
    this.accept(next, response);
    return response;
  }

  async addEvidence(request: EvidenceRequest, bytes: Uint8Array): Promise<CommitResponse> {
    this.assertInitialized();
    this.assertRevision(request.expectedStorageRevision, request.operationId);
    if (this.workspace.evidence.some((item) => item.id === request.meta.id)) {
      throw desktopError("CONFLICT", "A evidência já existe.", {
        operationId: request.operationId,
        currentStorageRevision: this.storageRevision,
      });
    }
    const next = applyStorageMutations(this.workspace, request.mutations);
    next.evidence = [...next.evidence, cloneJson(request.meta)];
    const response = this.nextResponse(request.mutations.map(({ kind, id, payload }) => ({ kind, id, payload })));
    const key = webEvidenceKey(request.meta.id);
    await this.storage.set(key, bytesToDataUrl(bytes, request.meta.mimeType));
    try {
      await this.persist(next, response.storageRevision, response.committedAt);
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
    this.accept(next, response);
    return response;
  }

  async readEvidence(evidenceId: string): Promise<EvidenceBytes> {
    this.assertInitialized();
    const meta = this.workspace.evidence.find((item) => item.id === evidenceId);
    const dataUrl = await this.storage.get<string>(webEvidenceKey(evidenceId));
    if (!meta || !dataUrl) throw desktopError("IO", "Evidência não encontrada.", { retryable: false });
    return { evidenceId, mimeType: meta.mimeType, bytes: dataUrlToBytes(dataUrl) };
  }

  async removeEvidence(request: RemoveEvidenceRequest): Promise<CommitResponse> {
    this.assertInitialized();
    this.assertRevision(request.expectedStorageRevision, request.operationId);
    const next = applyStorageMutations(this.workspace, request.mutations);
    next.evidence = next.evidence.filter((item) => item.id !== request.evidenceId);
    const response = this.nextResponse(request.mutations.map(({ kind, id, payload }) => ({ kind, id, payload })));
    await this.persist(next, response.storageRevision, response.committedAt);
    await this.storage.delete(webEvidenceKey(request.evidenceId));
    this.accept(next, response);
    return response;
  }

  async verifyIntegrity(): Promise<IntegrityReport> {
    this.assertInitialized();
    const missing = [];
    for (const meta of this.workspace.evidence) {
      if (!await this.storage.get(webEvidenceKey(meta.id))) {
        missing.push({ path: `evidence.${meta.id}`, message: "Conteúdo binário ausente." });
      }
    }
    return {
      status: missing.length ? "degraded" : "healthy",
      checkedAt: new Date().toISOString(),
      issues: missing,
    };
  }

  async exportBundle(): Promise<WorkspaceBundle> {
    this.assertInitialized();
    const evidence: EvidenceBundleItem[] = [];
    for (const meta of this.workspace.evidence) {
      const dataUrl = await this.storage.get<string>(webEvidenceKey(meta.id));
      if (dataUrl) evidence.push({ meta: cloneJson(meta), dataUrl });
    }
    return {
      schemaVersion: QA_FLOW_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      cases: cloneJson(this.workspace.cases),
      plans: cloneJson(this.workspace.plans),
      runs: cloneJson(this.workspace.runs),
      reports: cloneJson(this.workspace.reports),
      demandColumns: cloneJson(this.workspace.demandColumns),
      demands: cloneJson(this.workspace.demands),
      evidence,
      settings: cloneJson(this.workspace.settings),
    };
  }

  async applyBundle(
    bundle: WorkspaceBundle,
    mode: "merge" | "replace",
    expectedStorageRevision: number,
  ): Promise<WorkspaceSnapshot> {
    this.assertInitialized();
    this.assertRevision(expectedStorageRevision, "web-import");
    const current = this.workspace;
    const next: WorkspaceData = {
      cases: mode === "replace" ? bundle.cases : mergeById(current.cases, bundle.cases),
      plans: mode === "replace" ? bundle.plans : mergeById(current.plans, bundle.plans),
      runs: mode === "replace" ? bundle.runs : mergeById(current.runs, bundle.runs),
      reports: mode === "replace" ? bundle.reports : mergeById(current.reports, bundle.reports),
      demandColumns: mode === "replace"
        ? (bundle.demandColumns ?? createEmptyWorkspaceData().demandColumns)
        : mergeById(current.demandColumns, bundle.demandColumns ?? []),
      demands: mode === "replace" ? (bundle.demands ?? []) : mergeById(current.demands, bundle.demands ?? []),
      evidence: mode === "replace"
        ? bundle.evidence.map((item) => item.meta)
        : mergeById(current.evidence, bundle.evidence.map((item) => item.meta)),
      settings: mode === "replace" ? bundle.settings : current.settings,
      migrationReport: current.migrationReport,
    };
    const revision = this.storageRevision + 1;
    const committedAt = new Date().toISOString();
    for (const item of bundle.evidence) {
      await this.storage.set(webEvidenceKey(item.meta.id), item.dataUrl);
    }
    await this.persist(next, revision, committedAt);
    if (mode === "replace") {
      const incoming = new Set(bundle.evidence.map((item) => item.meta.id));
      for (const meta of current.evidence) {
        if (!incoming.has(meta.id)) await this.storage.delete(webEvidenceKey(meta.id));
      }
    }
    this.workspace = cloneWorkspaceData(next);
    this.storageRevision = revision;
    this.committedAt = committedAt;
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

  private hasCurrentContent(): boolean {
    return Boolean(
      this.workspace.cases.length
      || this.workspace.plans.length
      || this.workspace.runs.length
      || this.workspace.migrationReport,
    );
  }

  private assertInitialized(): void {
    if (!this.initialized) throw desktopError("INTERNAL", "O workspace web ainda não foi inicializado.");
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

  private nextResponse(changed: CommitResponse["changed"]): CommitResponse {
    return {
      storageRevision: this.storageRevision + 1,
      committedAt: new Date().toISOString(),
      changed,
    };
  }

  private accept(next: WorkspaceData, response: CommitResponse): void {
    this.workspace = cloneWorkspaceData(next);
    this.storageRevision = response.storageRevision;
    this.committedAt = response.committedAt;
  }

  private async persist(workspace: WorkspaceData, storageRevision: number, lastCommittedAt?: string): Promise<void> {
    const envelope: PersistEnvelope = {
      state: {
        ...cloneWorkspaceData(workspace),
        storageRevision,
        lastCommittedAt,
      },
      version: QA_FLOW_SCHEMA_VERSION,
    };
    await this.storage.set(WEB_STORE_KEY, JSON.stringify(envelope));
  }
}
