import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSnapshot } from "../../src/platform/contracts/dtos.ts";
import type { WorkspacePort } from "../../src/platform/contracts/ports.ts";
import { createEmptyWorkspaceData } from "../../src/platform/contracts/workspaceData.ts";
import { MemoryDesktopRuntimeAdapter } from "../../src/platform/desktop/memoryRuntimeAdapter.ts";
import { MemoryDesktopTransferAdapter } from "../../src/platform/desktop/memoryTransferAdapter.ts";
import { MemoryWorkspaceAdapter } from "../../src/platform/desktop/memoryWorkspaceAdapter.ts";
import { WebWorkspaceAdapter } from "../../src/platform/web/webWorkspaceAdapter.ts";
import { createQaStore, type QaStore } from "../../src/store/useQaStore.ts";
import { AsyncStorageHarness } from "../helpers/asyncStorageHarness.ts";
import { buildCase, buildPlan, buildRunContext } from "../helpers/domainBuilders.ts";

function createStore(workspacePort: WorkspacePort): QaStore {
  return createQaStore({
    workspacePort,
    transferPort: new MemoryDesktopTransferAdapter(),
    runtimePort: new MemoryDesktopRuntimeAdapter(),
  });
}

test("INT-002/003/004/007: jornada completa sobrevive ao restart sem deriva histórica", async () => {
  const storage = new AsyncStorageHarness();
  const writer = createStore(new WebWorkspaceAdapter(storage));
  await writer.getState().initialize();

  const savedCase = await writer.getState().saveCase(buildCase(), null);
  assert.equal(savedCase.ok, true);
  assert.equal((await writer.getState().savePlan(buildPlan(), null)).ok, true);

  const started = await writer.getState().startRun("PLAN-REGRESSION", buildRunContext());
  assert.equal(started.ok, true);
  const runId = started.value?.id;
  assert.ok(runId);

  const evidenceBytes = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112]);
  const evidence = await writer.getState().addEvidence(
    runId,
    "step",
    "CASE-CHECKOUT::STEP-CONFIRM",
    new Blob([evidenceBytes], { type: "video/mp4" }),
    "checkout.mp4",
  );
  assert.equal(evidence.ok, true);

  assert.equal((await writer.getState().updateStepResult(
    runId, "CASE-CHECKOUT", "STEP-CONFIRM", "passed", "Pedido 42 criado",
  )).ok, true);
  assert.equal((await writer.getState().updateStepResult(
    runId, "CASE-CHECKOUT", "STEP-RECEIPT", "skipped", "",
  )).ok, true);
  assert.equal((await writer.getState().setRunStatus(runId, "completed")).ok, true);
  assert.equal((await writer.getState().createReport(runId, "Relatório da regressão", "Aprovado")).ok, true);

  const currentCase = writer.getState().cases[0];
  const revised = await writer.getState().saveCase({ ...currentCase, title: "Checkout revisado" }, 1);
  assert.equal(revised.ok, true);
  assert.equal(revised.value?.revision, 2);

  const reader = createStore(new WebWorkspaceAdapter(storage));
  await reader.getState().initialize();
  const restoredRun = reader.getState().runs.find((run) => run.id === runId);

  assert.equal(reader.getState().cases[0].title, "Checkout revisado");
  assert.equal(restoredRun?.snapshot.cases[0].title, "Concluir checkout");
  assert.equal(restoredRun?.snapshot.cases[0].revision, 1);
  assert.equal(restoredRun?.status, "completed");
  assert.equal(restoredRun?.results["CASE-CHECKOUT::STEP-CONFIRM"].actualResult, "Pedido 42 criado");
  assert.deepEqual(
    restoredRun?.results["CASE-CHECKOUT::STEP-CONFIRM"].evidenceIds,
    [evidence.value?.id],
  );
  assert.equal(reader.getState().reports[0].runId, runId);

  const dataUrl = await reader.getState().getEvidenceData(evidence.value?.id ?? "");
  assert.equal(dataUrl, `data:video/mp4;base64,${Buffer.from(evidenceBytes).toString("base64")}`);

  const revisionBeforeRejectedEdit = reader.getState().storageRevision;
  const rejected = await reader.getState().updateStepResult(
    runId, "CASE-CHECKOUT", "STEP-CONFIRM", "failed", "Tentativa tardia",
  );
  assert.equal(rejected.ok, false);
  assert.equal(reader.getState().storageRevision, revisionBeforeRejectedEdit);
});

test("INT-006: conflito preserva a store; refresh e retry convergem para o estado atual", async () => {
  let conflictOnNextCommit = false;
  const adapter = new MemoryWorkspaceAdapter({
    onBeforeCommit() {
      if (!conflictOnNextCommit) return;
      conflictOnNextCommit = false;
      const external = createEmptyWorkspaceData();
      external.cases = [buildCase({ id: "CASE-EXTERNAL", title: "Caso externo" })];
      adapter.replaceWorkspace(external);
    },
  });
  const store = createStore(adapter);
  await store.getState().initialize();

  conflictOnNextCommit = true;
  const conflicted = await store.getState().saveCase(buildCase(), null);

  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.error?.code, "CONFLICT");
  assert.equal(store.getState().saveState.kind, "conflict");
  assert.equal(store.getState().storageRevision, 0);
  assert.deepEqual(store.getState().cases, []);

  await store.getState().refreshWorkspace();
  assert.equal(store.getState().storageRevision, 1);
  assert.deepEqual(store.getState().cases.map((item) => item.id), ["CASE-EXTERNAL"]);

  const retried = await store.getState().saveCase(buildCase(), null);
  assert.equal(retried.ok, true);
  assert.equal(store.getState().storageRevision, 2);
  assert.deepEqual(store.getState().cases.map((item) => item.id), ["CASE-EXTERNAL", "CASE-CHECKOUT"]);
});

function transformedSnapshotPort(transform: (snapshot: WorkspaceSnapshot) => WorkspaceSnapshot): WorkspacePort {
  const delegate = new MemoryWorkspaceAdapter();
  return {
    initialize: async () => transform(await delegate.initialize()),
    commit: (request) => delegate.commit(request),
    addEvidence: (request, bytes) => delegate.addEvidence(request, bytes),
    readEvidence: (evidenceId) => delegate.readEvidence(evidenceId),
    removeEvidence: (request) => delegate.removeEvidence(request),
    verifyIntegrity: () => delegate.verifyIntegrity(),
  };
}

test("INT-010: frontend rejeita IPC incompatível e workspace em recuperação", async (context) => {
  const cases: Array<{ name: string; transform(snapshot: WorkspaceSnapshot): WorkspaceSnapshot }> = [
    {
      name: "contrato IPC futuro",
      transform: (snapshot) => ({ ...snapshot, ipcContractVersion: 2 as never }),
    },
    {
      name: "recovery obrigatório",
      transform: (snapshot) => ({
        ...snapshot,
        health: { status: "recoveryRequired", message: "Banco requer recuperação." },
      }),
    },
  ];

  for (const scenario of cases) {
    await context.test(scenario.name, async () => {
      const store = createStore(transformedSnapshotPort(scenario.transform));
      await store.getState().initialize();

      assert.equal(store.getState().ready, false);
      assert.equal(store.getState().initializing, false);
      assert.notEqual(store.getState().storageError, null);
      assert.deepEqual(store.getState().cases, []);
      assert.equal(store.getState().storageRevision, 0);
      assert.equal(store.getState().saveState.kind, "error");
    });
  }
});
