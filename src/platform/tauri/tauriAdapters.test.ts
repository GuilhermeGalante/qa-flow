import assert from "node:assert/strict";
import test from "node:test";
import { IPC_CONTRACT_VERSION, type CommitResponse, type WorkspaceSnapshot } from "../contracts/dtos.ts";
import { createEmptyWorkspaceData } from "../contracts/workspaceData.ts";
import { createTauriAdapters } from "./tauriAdapters.ts";
import type { DesktopCommand, TauriInvoke } from "./tauriIpc.ts";

test("adapter Tauri usa commands constantes e preserva DTOs camelCase", async () => {
  const calls: Array<{ command: DesktopCommand; args?: Record<string, unknown> }> = [];
  const invoke: TauriInvoke = async <T>(command: DesktopCommand, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "workspace_initialize") {
      return {
        ipcContractVersion: IPC_CONTRACT_VERSION,
        storageRevision: 0,
        health: { status: "healthy" },
        workspace: createEmptyWorkspaceData("2026-08-29T12:00:00.000Z"),
      } as T;
    }
    return {
      storageRevision: 1,
      changed: [],
      committedAt: "2026-08-29T12:00:00.000Z",
    } as T;
  };
  const adapters = createTauriAdapters(invoke);
  const snapshot: WorkspaceSnapshot = await adapters.workspacePort.initialize();
  const response: CommitResponse = await adapters.workspacePort.commit({
    operationId: "OP-1",
    expectedStorageRevision: 0,
    mutations: [],
  });

  assert.equal(snapshot.ipcContractVersion, IPC_CONTRACT_VERSION);
  assert.equal(response.storageRevision, 1);
  assert.deepEqual(calls.map((call) => call.command), ["workspace_initialize", "workspace_commit"]);
  assert.deepEqual(calls[1].args, {
    request: { operationId: "OP-1", expectedStorageRevision: 0, mutations: [] },
  });
});

test("adapter Tauri converte rejeições IPC em DesktopError tipado", async () => {
  const adapters = createTauriAdapters(async () => {
    throw {
      code: "CONFLICT",
      message: "Revisão divergente.",
      retryable: true,
      currentStorageRevision: 7,
    };
  });

  await assert.rejects(
    adapters.workspacePort.commit({ operationId: "OP-2", expectedStorageRevision: 3, mutations: [] }),
    (error: unknown) => {
      const typed = error as { code?: string; currentStorageRevision?: number };
      return typed.code === "CONFLICT" && typed.currentStorageRevision === 7;
    },
  );
});

test("adapter Tauri serializa e reconstrói bytes de evidência na fronteira IPC", async () => {
  const calls: Array<{ command: DesktopCommand; args?: Record<string, unknown> }> = [];
  const invoke: TauriInvoke = async <T>(command: DesktopCommand, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "evidence_read") {
      return {
        evidenceId: "EVD-1",
        mimeType: "image/png",
        bytes: [137, 80, 78, 71],
      } as T;
    }
    return {
      storageRevision: 1,
      changed: [],
      committedAt: "2026-08-31T12:00:00.000Z",
    } as T;
  };
  const adapters = createTauriAdapters(invoke);

  await adapters.workspacePort.addEvidence({
    operationId: "OP-EVD",
    expectedStorageRevision: 0,
    meta: {
      id: "EVD-1",
      ownerType: "step",
      ownerId: "CASE-1::STEP-1",
      runId: "RUN-1",
      name: "captura.png",
      mimeType: "image/png",
      size: 4,
      sha256: "0".repeat(64),
      createdAt: "2026-08-31T12:00:00.000Z",
    },
    mutations: [],
  }, Uint8Array.from([137, 80, 78, 71]));
  const evidence = await adapters.workspacePort.readEvidence("EVD-1");

  assert.deepEqual(calls[0].args?.bytes, [137, 80, 78, 71]);
  assert.ok(evidence.bytes instanceof Uint8Array);
  assert.deepEqual([...evidence.bytes], [137, 80, 78, 71]);
});

test("adapter Tauri envia arquivos gerados como array numérico allowlisted", async () => {
  let captured: { command: DesktopCommand; args?: Record<string, unknown> } | undefined;
  const invoke: TauriInvoke = async <T>(command: DesktopCommand, args?: Record<string, unknown>) => {
    captured = { command, args };
    return { status: "completed", displayName: "run.json", bytesWritten: 2 } as T;
  };
  const adapters = createTauriAdapters(invoke);

  await adapters.transferPort.saveGeneratedFile(
    { suggestedName: "run.json", mimeType: "application/json", extension: ".json" },
    Uint8Array.from([123, 125]),
  );

  assert.equal(captured?.command, "generated_file_save_dialog");
  assert.deepEqual(captured?.args?.bytes, [123, 125]);
});

test("adapter Tauri mantém tokens e modos nas transferências de workspace", async () => {
  const calls: Array<{ command: DesktopCommand; args?: Record<string, unknown> }> = [];
  const invoke: TauriInvoke = async <T>(command: DesktopCommand, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "backup_inspect_dialog") {
      return {
        status: "ready",
        previewToken: "preview-backup",
        sourceName: "backup.json",
        summary: { cases: 1, plans: 0, runs: 0, reports: 0, demandColumns: 7, demands: 0, evidence: 0 },
      } as T;
    }
    if (command === "repository_inspect_dialog") {
      return {
        status: "ready",
        previewToken: "preview-repository",
        sourceName: "repo/.qaflow",
        repositoryName: "repo",
        summary: { cases: 1, plans: 0, runs: 0, reports: 0, demandColumns: 7, demands: 0, evidence: 0 },
      } as T;
    }
    return { status: "completed" } as T;
  };
  const adapters = createTauriAdapters(invoke);

  await adapters.transferPort.exportBackup({ suggestedName: "backup.json" });
  const backup = await adapters.transferPort.inspectBackup();
  await adapters.transferPort.applyImport({
    previewToken: backup.status === "ready" ? backup.previewToken : "",
    mode: "replace",
    expectedStorageRevision: 4,
  });
  await adapters.transferPort.pushRepository({});
  const repository = await adapters.transferPort.inspectRepository();
  await adapters.transferPort.pullRepository({
    previewToken: repository.status === "ready" ? repository.previewToken : "",
    mode: "merge",
    expectedStorageRevision: 5,
  });

  assert.deepEqual(calls.map((call) => call.command), [
    "backup_export_dialog",
    "backup_inspect_dialog",
    "backup_apply",
    "repository_push_dialog",
    "repository_inspect_dialog",
    "repository_pull",
  ]);
  assert.deepEqual(calls[2].args, {
    request: { previewToken: "preview-backup", mode: "replace", expectedStorageRevision: 4 },
  });
  assert.deepEqual(calls[5].args, {
    request: { previewToken: "preview-repository", mode: "merge", expectedStorageRevision: 5 },
  });
});

test("adapter Tauri verifica e instala exatamente a versão selecionada", async () => {
  const calls: Array<{ command: DesktopCommand; args?: Record<string, unknown> }> = [];
  const adapters = createTauriAdapters(async <T>(command: DesktopCommand, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "update_check") {
      return { status: "available", version: "2.2.0", notes: "Melhorias" } as T;
    }
    return undefined as T;
  });

  const update = await adapters.runtimePort.checkForUpdate();
  assert.equal(update.status, "available");
  await adapters.runtimePort.installUpdate(update.status === "available" ? update.version : "");

  assert.deepEqual(calls, [
    { command: "update_check", args: undefined },
    { command: "update_install", args: { expectedVersion: "2.2.0" } },
  ]);
});

