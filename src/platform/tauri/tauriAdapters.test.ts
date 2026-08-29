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

