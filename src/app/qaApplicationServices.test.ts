import assert from "node:assert/strict";
import test from "node:test";
import type { CaseDefinition, PlanDefinition, QaDemand, RunContext } from "../domain/types.ts";
import { QA_FLOW_SCHEMA_VERSION } from "../domain/types.ts";
import { desktopError } from "../platform/contracts/errors.ts";
import type { WorkspacePort } from "../platform/contracts/ports.ts";
import { createEmptyWorkspaceData } from "../platform/contracts/workspaceData.ts";
import { MemoryDesktopRuntimeAdapter } from "../platform/desktop/memoryRuntimeAdapter.ts";
import { MemoryDesktopTransferAdapter } from "../platform/desktop/memoryTransferAdapter.ts";
import { MemoryWorkspaceAdapter } from "../platform/desktop/memoryWorkspaceAdapter.ts";
import { WebWorkspaceAdapter, type AsyncKeyValueStorage } from "../platform/web/webWorkspaceAdapter.ts";
import { createQaStore, type QaStore } from "../store/useQaStore.ts";

function caseDraft(id = "CASE-1"): CaseDefinition {
  const now = "2026-08-29T12:00:00.000Z";
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id,
    revision: 1,
    title: "Fluxo principal",
    description: "",
    path: ["Checkout"],
    priority: "high",
    status: "active",
    tags: ["smoke"],
    precondition: "Usuário autenticado",
    steps: [{ id: "STEP-1", type: "when", action: "Confirmar", expectedResult: "Pedido criado" }],
    automationLinks: [],
    externalReferences: [],
    createdAt: now,
    updatedAt: now,
  };
}

function planDraft(): PlanDefinition {
  const now = "2026-08-29T12:00:00.000Z";
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "PLAN-1",
    revision: 1,
    name: "Regressão",
    description: "",
    objective: "Validar checkout",
    project: "QA Flow",
    status: "active",
    tags: [],
    caseRefs: [{ caseId: "CASE-1", caseRevision: 1 }],
    createdBy: "QA",
    createdAt: now,
    updatedAt: now,
  };
}

const runContext: RunContext = {
  environment: "Homologação",
  build: "2.0.1",
  platform: "Windows",
  device: "Desktop",
  browser: "WebView2",
  tester: "QA",
  notes: "",
};

function demand(columnId: string): QaDemand {
  const now = "2026-08-29T12:00:00.000Z";
  return {
    id: "DEM-1",
    title: "Cobrir fluxo",
    description: "",
    columnId,
    order: 0,
    priority: "medium",
    assignee: "",
    tags: [],
    checklist: [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
}

function storeFor(workspacePort: WorkspacePort): QaStore {
  return createQaStore({
    workspacePort,
    transferPort: new MemoryDesktopTransferAdapter(),
    runtimePort: new MemoryDesktopRuntimeAdapter(),
  });
}

async function exerciseCoreUseCases(store: QaStore): Promise<void> {
  await store.getState().initialize();
  assert.equal(store.getState().ready, true);

  assert.equal((await store.getState().saveCase(caseDraft(), null)).ok, true);
  assert.equal((await store.getState().savePlan(planDraft(), null)).ok, true);
  const started = await store.getState().startRun("PLAN-1", runContext);
  assert.equal(started.ok, true);
  const runId = started.value!.id;
  assert.equal((await store.getState().updateStepResult(runId, "CASE-1", "STEP-1", "passed", "")).ok, true);
  assert.equal((await store.getState().setRunStatus(runId, "completed")).ok, true);
  assert.equal((await store.getState().createReport(runId, "Relatório", "")).ok, true);
  assert.equal((await store.getState().saveDemand(demand(store.getState().demandColumns[0].id))).ok, true);
  assert.equal((await store.getState().updateSettings({ name: "Workspace confirmado" })).ok, true);

  const state = store.getState();
  assert.equal(state.cases.length, 1);
  assert.equal(state.plans.length, 1);
  assert.equal(state.runs[0].status, "completed");
  assert.equal(state.reports.length, 1);
  assert.equal(state.demands.length, 1);
  assert.equal(state.settings.name, "Workspace confirmado");
  assert.equal(state.saveState.kind, "idle");
}

test("a mesma suíte de casos de uso passa no fake desktop e no adapter web", async () => {
  await exerciseCoreUseCases(storeFor(new MemoryWorkspaceAdapter()));

  const values = new Map<string, unknown>();
  const storage: AsyncKeyValueStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { values.set(key, value); },
    async delete(key: string) { values.delete(key); },
  };
  await exerciseCoreUseCases(storeFor(new WebWorkspaceAdapter(storage)));
});

test("commit-first não altera o snapshot global enquanto o adapter não confirma", async () => {
  let releaseCommit!: () => void;
  let reportEntered!: () => void;
  const entered = new Promise<void>((resolve) => { reportEntered = resolve; });
  const gate = new Promise<void>((resolve) => { releaseCommit = resolve; });
  const adapter = new MemoryWorkspaceAdapter({
    async onBeforeCommit() {
      reportEntered();
      await gate;
    },
  });
  const store = storeFor(adapter);
  await store.getState().initialize();

  const pending = store.getState().saveCase(caseDraft(), null);
  await entered;
  assert.equal(store.getState().cases.length, 0);
  assert.equal(store.getState().saveState.kind, "saving");

  releaseCommit();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(store.getState().cases.length, 1);
  assert.equal(store.getState().storageRevision, 1);
});

test("erro de commit preserva o snapshot confirmado e expõe o código diagnóstico", async () => {
  const adapter = new MemoryWorkspaceAdapter({
    onBeforeCommit() {
      throw desktopError("DISK_FULL", "Não há espaço para concluir a gravação.", { retryable: true });
    },
  });
  const store = storeFor(adapter);
  await store.getState().initialize();
  const result = await store.getState().saveCase(caseDraft(), null);

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DISK_FULL");
  assert.equal(store.getState().cases.length, 0);
  assert.equal(store.getState().saveState.kind, "error");
});

test("commits concorrentes são serializados na ordem de submissão", async () => {
  const entered: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const adapter = new MemoryWorkspaceAdapter({
    async onBeforeCommit(request) {
      entered.push(request.operationId);
      if (entered.length === 1) await firstGate;
    },
  });
  const store = storeFor(adapter);
  await store.getState().initialize();

  const first = store.getState().saveCase(caseDraft("CASE-A"), null);
  const second = store.getState().saveCase(caseDraft("CASE-B"), null);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(entered.length, 1);
  releaseFirst();
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.deepEqual(store.getState().cases.map((item) => item.id), ["CASE-A", "CASE-B"]);
  assert.equal(store.getState().storageRevision, 2);
});

test("preferências locais não entram no snapshot portátil nem avançam storageRevision", async () => {
  const adapter = new MemoryWorkspaceAdapter({ initialWorkspace: createEmptyWorkspaceData() });
  const store = storeFor(adapter);
  await store.getState().initialize();
  await store.getState().setPreference({ sidebarCollapsed: true });
  assert.equal(store.getState().preferences.sidebarCollapsed, true);
  assert.equal(store.getState().storageRevision, 0);
  assert.equal("preferences" in adapter.snapshot().workspace, false);
});

