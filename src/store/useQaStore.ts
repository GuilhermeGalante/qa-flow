import { create, type StoreApi, type UseBoundStore } from "zustand";
import { QaApplicationServices } from "../app/qaApplicationServices.ts";
import type { RuntimePort, TransferPort, WorkspacePort } from "../platform/contracts/ports";
import { createEmptyWorkspaceData } from "../platform/contracts/workspaceData.ts";
import type { QaState } from "./types";

export interface QaStoreDependencies {
  workspacePort: WorkspacePort;
  transferPort: TransferPort;
  runtimePort: RuntimePort;
}

export type QaStore = UseBoundStore<StoreApi<QaState>>;

export function createQaStore(dependencies: QaStoreDependencies): QaStore {
  // A referência é preenchida logo após a criação da store; as actions só rodam depois disso.
  // eslint-disable-next-line prefer-const
  let services: QaApplicationServices;
  const store = create<QaState>()((set) => ({
    ...createEmptyWorkspaceData(),
    activeRunId: null,
    ready: false,
    initializing: false,
    storageError: null,
    storageRevision: 0,
    saveState: { kind: "idle" },
    runtimeInfo: null,
    preferences: {},

    initialize: () => services.initialize(),
    saveCase: (candidate, expectedRevision) => services.saveCase(candidate, expectedRevision),
    archiveCase: (caseId) => services.archiveCase(caseId),
    savePlan: (candidate, expectedRevision) => services.savePlan(candidate, expectedRevision),
    archivePlan: (planId) => services.archivePlan(planId),
    startRun: (planId, context, sourceRunId) => services.startRun(planId, context, sourceRunId),
    setActiveRun: (activeRunId) => set({ activeRunId }),
    updateStepResult: (runId, caseId, stepId, status, actualResult) =>
      services.updateStepResult(runId, caseId, stepId, status, actualResult),
    setRunStatus: (runId, status) => services.setRunStatus(runId, status),
    addEvidence: (runId, ownerType, ownerId, file, name) =>
      services.addEvidence(runId, ownerType, ownerId, file, name),
    getEvidenceData: (evidenceId) => services.getEvidenceData(evidenceId),
    removeEvidence: (evidenceId) => services.removeEvidence(evidenceId),
    addExploratoryRecord: (runId, record) => services.addExploratoryRecord(runId, record),
    createReport: (runId, title, notes) => services.createReport(runId, title, notes),
    removeReport: (reportId) => services.removeReport(reportId),
    saveDemand: (demand) => services.saveDemand(demand),
    deleteDemand: (demandId) => services.deleteDemand(demandId),
    moveDemand: (demandId, columnId, order) => services.moveDemand(demandId, columnId, order),
    addDemandColumn: (name, semantic) => services.addDemandColumn(name, semantic),
    updateDemandColumn: (columnId, name, semantic) => services.updateDemandColumn(columnId, name, semantic),
    moveDemandColumn: (columnId, direction) => services.moveDemandColumn(columnId, direction),
    deleteDemandColumn: (columnId) => services.deleteDemandColumn(columnId),
    updateSettings: (updates) => services.updateSettings(updates),
    setPreference: (changes) => services.setPreference(changes),
    saveGeneratedFile: (request, bytes) => services.saveGeneratedFile(request, bytes),
    exportBackup: () => services.exportBackup(),
    inspectBackup: () => services.inspectBackup(),
    applyImport: (previewToken, mode) => services.applyImport(previewToken, mode),
    pushRepository: () => services.pushRepository(),
    inspectRepository: () => services.inspectRepository(),
    pullRepository: (previewToken, mode) => services.pullRepository(previewToken, mode),
    checkForUpdate: () => services.checkForUpdate(),
    installUpdate: (expectedVersion) => services.installUpdate(expectedVersion),
  }));

  services = new QaApplicationServices({
    ...dependencies,
    getState: store.getState,
    setState: (partial) => store.setState(partial),
  });
  return store;
}

let configuredStore: QaStore | undefined;

function requireConfiguredStore(): QaStore {
  if (!configuredStore) {
    throw new Error("A composição do QA Flow precisa configurar a store antes de renderizar a aplicação.");
  }
  return configuredStore;
}

interface QaStoreHook {
  <T>(selector: (state: QaState) => T): T;
  getState(): QaState;
}

export function configureQaStore(store: QaStore): void {
  configuredStore = store;
}

export const useQaStore: QaStoreHook = Object.assign(
  function useQaStoreSelector<T>(selector: (state: QaState) => T): T {
    return requireConfiguredStore()(selector);
  },
  { getState: () => requireConfiguredStore().getState() },
);

export type { QaState } from "./types";
