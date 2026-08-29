import type { WorkspaceBundle } from "../../domain/types";
import { createId, validateWorkspaceBundle } from "../../domain/validation.ts";
import {
  connectRepository,
  connectedRepositoryName,
  readRepositoryWorkspace,
  writeRepositoryWorkspace,
} from "../../storage/repositoryWorkspace.ts";
import type {
  ApplyImportRequest,
  Cancelled,
  ExportRequest,
  GeneratedFileRequest,
  ImportPreview,
  ImportReceipt,
  ImportSummary,
  RepositoryPreview,
  RepositoryPullRequest,
  RepositoryPushRequest,
  TransferResult,
} from "../contracts/dtos";
import { desktopError } from "../contracts/errors.ts";
import type { TransferPort } from "../contracts/ports";
import { WebWorkspaceAdapter } from "./webWorkspaceAdapter.ts";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

interface PreviewEntry {
  bundle: WorkspaceBundle;
  sourceName: string;
  repositoryName?: string;
  expiresAt: number;
}

function bundleSummary(bundle: WorkspaceBundle): ImportSummary {
  return {
    cases: bundle.cases.length,
    plans: bundle.plans.length,
    runs: bundle.runs.length,
    reports: bundle.reports.length,
    demandColumns: (bundle.demandColumns ?? []).length,
    demands: (bundle.demands ?? []).length,
    evidence: bundle.evidence.length,
  };
}

function saveBytes(bytes: BlobPart[], mimeType: string, name: string): number {
  const blob = new Blob(bytes, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  return blob.size;
}

function selectJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    document.body.append(input);
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    window.addEventListener("focus", () => setTimeout(() => finish(input.files?.[0] ?? null), 0), { once: true });
    input.click();
  });
}

export class WebTransferAdapter implements TransferPort {
  private readonly workspace: WebWorkspaceAdapter;
  private readonly previews = new Map<string, PreviewEntry>();

  constructor(workspace: WebWorkspaceAdapter) {
    this.workspace = workspace;
  }

  async exportBackup(request: ExportRequest): Promise<TransferResult> {
    const bundle = await this.workspace.exportBundle();
    const displayName = request.suggestedName ?? `qaflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const bytesWritten = saveBytes(
      [`${JSON.stringify(bundle, null, 2)}\n`],
      "application/json",
      displayName,
    );
    return { status: "completed", displayName, bytesWritten };
  }

  async inspectBackup(): Promise<ImportPreview | Cancelled> {
    const file = await selectJsonFile();
    if (!file) return { status: "cancelled" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch {
      throw desktopError("VALIDATION", "O arquivo selecionado não contém JSON válido.");
    }
    const validation = validateWorkspaceBundle(parsed);
    if (!validation.ok || !validation.value) {
      throw desktopError("VALIDATION", "O backup não passou na validação.", {
        issues: validation.issues,
      });
    }
    return this.remember(validation.value, file.name);
  }

  async applyImport(request: ApplyImportRequest): Promise<ImportReceipt> {
    const entry = this.consume(request.previewToken);
    const snapshot = await this.workspace.applyBundle(entry.bundle, request.mode, request.expectedStorageRevision);
    return {
      storageRevision: snapshot.storageRevision,
      committedAt: snapshot.committedAt ?? new Date().toISOString(),
      summary: bundleSummary(entry.bundle),
      snapshot,
    };
  }

  async pushRepository(request: RepositoryPushRequest): Promise<TransferResult> {
    void request;
    let repositoryName = connectedRepositoryName();
    if (!repositoryName) repositoryName = await connectRepository();
    await writeRepositoryWorkspace(await this.workspace.exportBundle());
    return { status: "completed", displayName: `${repositoryName}/.qaflow` };
  }

  async inspectRepository(): Promise<RepositoryPreview | Cancelled> {
    let repositoryName = connectedRepositoryName();
    if (!repositoryName) repositoryName = await connectRepository();
    const bundle = await readRepositoryWorkspace();
    const validation = validateWorkspaceBundle(bundle);
    if (!validation.ok || !validation.value) {
      throw desktopError("VALIDATION", "O repositório .qaflow não passou na validação.", {
        issues: validation.issues,
      });
    }
    return {
      ...this.remember(validation.value, `${repositoryName}/.qaflow`, repositoryName),
      repositoryName,
    };
  }

  async pullRepository(request: RepositoryPullRequest): Promise<ImportReceipt> {
    const entry = this.consume(request.previewToken);
    const snapshot = await this.workspace.applyBundle(entry.bundle, request.mode, request.expectedStorageRevision);
    return {
      storageRevision: snapshot.storageRevision,
      committedAt: snapshot.committedAt ?? new Date().toISOString(),
      summary: bundleSummary(entry.bundle),
      snapshot,
    };
  }

  async saveGeneratedFile(request: GeneratedFileRequest, bytes: Uint8Array): Promise<TransferResult> {
    const displayName = request.suggestedName.endsWith(request.extension)
      ? request.suggestedName
      : `${request.suggestedName}${request.extension}`;
    const bytesWritten = saveBytes([Uint8Array.from(bytes).buffer], request.mimeType, displayName);
    return { status: "completed", displayName, bytesWritten };
  }

  private remember(bundle: WorkspaceBundle, sourceName: string, repositoryName?: string): ImportPreview {
    const previewToken = createId("PREVIEW");
    this.previews.set(previewToken, {
      bundle,
      sourceName,
      repositoryName,
      expiresAt: Date.now() + PREVIEW_TTL_MS,
    });
    return { status: "ready", previewToken, sourceName, summary: bundleSummary(bundle) };
  }

  private consume(previewToken: string): PreviewEntry {
    const entry = this.previews.get(previewToken);
    this.previews.delete(previewToken);
    if (!entry || entry.expiresAt < Date.now()) {
      throw desktopError("VALIDATION", "A prévia expirou. Selecione o conteúdo novamente.");
    }
    return entry;
  }
}
