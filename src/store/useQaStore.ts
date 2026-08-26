import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { migrateLegacyState } from "../domain/migration";
import {
  QA_FLOW_SCHEMA_VERSION,
  type CaseDefinition,
  type EvidenceBundleItem,
  type EvidenceMeta,
  type ExploratoryRecord,
  type MigrationReport,
  type OperationResult,
  type PlanDefinition,
  type ReportArtifact,
  type RunContext,
  type RunStatus,
  type StepResult,
  type StepStatus,
  type TestRun,
  type WorkspaceBundle,
  type WorkspaceSettings,
} from "../domain/types";
import {
  cloneJson,
  createId,
  isRunEditable,
  normalizePath,
  normalizeTags,
  normalizeText,
  resultKey,
  runProgress,
  validateCaseDefinition,
  validatePlanDefinition,
  validateWorkspaceBundle,
} from "../domain/validation";
import { compressImageToBase64 } from "../utils/compressImage";

const STORE_KEY = "qaflow-v2-store";
const LEGACY_STORE_KEY = "qaflow-store";
const evidenceKey = (id: string) => `qaflow-v2:evidence:${id}`;

type ImportMode = "merge" | "replace";

interface QaState {
  cases: CaseDefinition[];
  plans: PlanDefinition[];
  runs: TestRun[];
  reports: ReportArtifact[];
  evidence: EvidenceMeta[];
  settings: WorkspaceSettings;
  migrationReport: MigrationReport | null;
  activeRunId: string | null;
  ready: boolean;
  initializing: boolean;
  storageError: string | null;

  initialize: () => Promise<void>;
  saveCase: (testCase: CaseDefinition, expectedRevision: number | null) => Promise<OperationResult<CaseDefinition>>;
  archiveCase: (caseId: string) => Promise<OperationResult>;
  savePlan: (plan: PlanDefinition, expectedRevision: number | null) => Promise<OperationResult<PlanDefinition>>;
  archivePlan: (planId: string) => Promise<OperationResult>;
  startRun: (
    planId: string,
    context: RunContext,
    sourceRunId?: string,
  ) => Promise<OperationResult<TestRun>>;
  setActiveRun: (runId: string | null) => void;
  updateStepResult: (
    runId: string,
    caseId: string,
    stepId: string,
    status: StepStatus,
    actualResult: string,
  ) => Promise<OperationResult>;
  setRunStatus: (runId: string, status: RunStatus) => Promise<OperationResult>;
  addEvidence: (
    runId: string,
    ownerType: EvidenceMeta["ownerType"],
    ownerId: string,
    file: File | Blob,
    name?: string,
  ) => Promise<OperationResult<EvidenceMeta>>;
  getEvidenceData: (evidenceId: string) => Promise<string | null>;
  removeEvidence: (evidenceId: string) => Promise<OperationResult>;
  addExploratoryRecord: (
    runId: string,
    record: Omit<ExploratoryRecord, "id" | "createdAt" | "evidenceIds">,
  ) => Promise<OperationResult<ExploratoryRecord>>;
  createReport: (runId: string, title: string, notes: string) => Promise<OperationResult<ReportArtifact>>;
  removeReport: (reportId: string) => Promise<OperationResult>;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;
  exportWorkspace: () => Promise<WorkspaceBundle>;
  importWorkspace: (bundle: unknown, mode: ImportMode) => Promise<OperationResult>;
}

const indexedDbStorage: StateStorage = {
  getItem: async (name) => (await idbGet<string>(name)) ?? null,
  setItem: async (name, value) => { await idbSet(name, value); },
  removeItem: async (name) => { await idbDel(name); },
};

function normalizeCase(testCase: CaseDefinition, revision: number, createdAt: string): CaseDefinition {
  const now = new Date().toISOString();
  return {
    ...testCase,
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: normalizeText(testCase.id),
    revision,
    title: normalizeText(testCase.title),
    path: normalizePath(testCase.path),
    tags: normalizeTags(testCase.tags),
    precondition: testCase.precondition.trim(),
    steps: testCase.steps.map((step) => ({
      ...step,
      id: normalizeText(step.id),
      action: normalizeText(step.action),
      expectedResult: normalizeText(step.expectedResult),
    })),
    createdAt,
    updatedAt: now,
  };
}

function normalizePlan(plan: PlanDefinition, revision: number, createdAt: string): PlanDefinition {
  return {
    ...plan,
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: normalizeText(plan.id),
    revision,
    name: normalizeText(plan.name),
    description: plan.description.trim(),
    objective: plan.objective.trim(),
    project: normalizeText(plan.project),
    tags: normalizeTags(plan.tags),
    createdBy: normalizeText(plan.createdBy),
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return "unavailable";
  const data = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a evidência."));
    reader.readAsDataURL(file);
  });
}

function patchRun(runs: TestRun[], runId: string, callback: (run: TestRun) => TestRun): TestRun[] {
  return runs.map((run) => run.id === runId ? callback(run) : run);
}

export const useQaStore = create<QaState>()(
  persist(
    (set, get) => ({
      cases: [],
      plans: [],
      runs: [],
      reports: [],
      evidence: [],
      settings: {
        mode: "browser",
        name: "Meu workspace",
        repositoryPath: ".qaflow",
        compactEvidence: true,
      },
      migrationReport: null,
      activeRunId: null,
      ready: false,
      initializing: false,
      storageError: null,

      initialize: async () => {
        if (get().ready || get().initializing) return;
        set({ initializing: true, storageError: null });
        try {
          const current = get();
          if (current.cases.length || current.plans.length || current.runs.length || current.migrationReport) {
            set({ ready: true, initializing: false });
            return;
          }
          const legacyValue = await idbGet<string>(LEGACY_STORE_KEY);
          const parsedLegacy = legacyValue ? JSON.parse(legacyValue) as unknown : null;
          const migration = migrateLegacyState(parsedLegacy);
          if (migration) {
            for (const item of migration.evidence) {
              await idbSet(evidenceKey(item.meta.id), item.dataUrl);
            }
            set({
              cases: migration.cases,
              plans: migration.plans,
              runs: migration.runs,
              reports: migration.reports,
              evidence: migration.evidence.map((item) => item.meta),
              migrationReport: migration.report,
            });
          }
          set({ ready: true, initializing: false });
        } catch (error) {
          set({
            ready: true,
            initializing: false,
            storageError: error instanceof Error ? error.message : "Não foi possível abrir o armazenamento local.",
          });
        }
      },

      saveCase: async (candidate, expectedRevision) => {
        const existing = get().cases.find((item) => item.id === candidate.id);
        if (expectedRevision === null && existing) {
          return { ok: false, message: `Já existe um caso com o ID ${candidate.id}.` };
        }
        if (expectedRevision !== null && (!existing || expectedRevision !== existing.revision)) {
          return { ok: false, message: "O caso foi alterado em outra versão. Reabra antes de salvar." };
        }
        const normalized = normalizeCase(
          candidate,
          existing ? existing.revision + 1 : 1,
          existing?.createdAt ?? candidate.createdAt ?? new Date().toISOString(),
        );
        const validation = validateCaseDefinition(normalized);
        if (!validation.ok) {
          return { ok: false, message: "Revise os campos obrigatórios do caso.", issues: validation.issues };
        }
        set((state) => ({ cases: existing
          ? state.cases.map((item) => item.id === existing.id ? normalized : item)
          : [...state.cases, normalized] }));
        return { ok: true, value: normalized, message: existing ? "Nova revisão do caso salva." : "Caso criado." };
      },

      archiveCase: async (caseId) => {
        const existing = get().cases.find((item) => item.id === caseId);
        if (!existing) return { ok: false, message: "Caso não encontrado." };
        const impactedPlans = get().plans.filter((plan) =>
          plan.status !== "archived" && plan.caseRefs.some((reference) => reference.caseId === caseId),
        );
        const updated = normalizeCase({ ...existing, status: "archived" }, existing.revision + 1, existing.createdAt);
        set((state) => ({ cases: state.cases.map((item) => item.id === caseId ? updated : item) }));
        return {
          ok: true,
          message: impactedPlans.length
            ? `Caso arquivado. ${impactedPlans.length} plano(s) continuam referenciando sua última revisão.`
            : "Caso arquivado.",
        };
      },

      savePlan: async (candidate, expectedRevision) => {
        const existing = get().plans.find((item) => item.id === candidate.id);
        if (expectedRevision === null && existing) {
          return { ok: false, message: `Já existe um plano com o ID ${candidate.id}.` };
        }
        if (expectedRevision !== null && (!existing || expectedRevision !== existing.revision)) {
          return { ok: false, message: "O plano foi alterado em outra versão. Reabra antes de salvar." };
        }
        const references = candidate.caseRefs.map((reference) => ({ ...reference }));
        const missing = references.filter((reference) => !get().cases.some((item) => item.id === reference.caseId));
        if (missing.length) {
          return { ok: false, message: `O plano contém ${missing.length} referência(s) para casos inexistentes.` };
        }
        const normalized = normalizePlan(
          { ...candidate, caseRefs: references },
          existing ? existing.revision + 1 : 1,
          existing?.createdAt ?? candidate.createdAt ?? new Date().toISOString(),
        );
        const validation = validatePlanDefinition(normalized);
        if (!validation.ok) {
          return { ok: false, message: "Revise os campos obrigatórios do plano.", issues: validation.issues };
        }
        set((state) => ({ plans: existing
          ? state.plans.map((item) => item.id === existing.id ? normalized : item)
          : [...state.plans, normalized] }));
        return { ok: true, value: normalized, message: existing ? "Nova revisão do plano salva." : "Plano criado." };
      },

      archivePlan: async (planId) => {
        const plan = get().plans.find((item) => item.id === planId);
        if (!plan) return { ok: false, message: "Plano não encontrado." };
        const updated = normalizePlan({ ...plan, status: "archived" }, plan.revision + 1, plan.createdAt);
        set((state) => ({ plans: state.plans.map((item) => item.id === planId ? updated : item) }));
        return { ok: true, message: "Plano arquivado. O histórico de execuções foi preservado." };
      },

      startRun: async (planId, context, sourceRunId) => {
        const plan = get().plans.find((item) => item.id === planId);
        if (!plan || plan.status === "archived") {
          return { ok: false, message: "Selecione um plano ativo." };
        }
        const selectedCases = plan.caseRefs.map((reference) =>
          get().cases.find((item) => item.id === reference.caseId && item.revision === reference.caseRevision),
        );
        if (selectedCases.some((item) => !item)) {
          return { ok: false, message: "O plano possui referências ausentes ou desatualizadas. Abra-o, revise as mudanças e atualize as revisões antes de executar." };
        }
        if (selectedCases.some((item) => item?.status !== "active")) {
          return { ok: false, message: "O plano contém casos em rascunho ou arquivados. Ative ou substitua esses casos antes de executar." };
        }
        const now = new Date().toISOString();
        const attempt = get().runs.filter((run) => run.planId === planId).length + 1;
        const run: TestRun = {
          schemaVersion: QA_FLOW_SCHEMA_VERSION,
          id: createId("RUN"),
          attempt,
          sourceRunId,
          planId,
          planRevision: plan.revision,
          status: "in_progress",
          context: {
            ...context,
            environment: normalizeText(context.environment),
            tester: normalizeText(context.tester),
          },
          snapshot: { plan: cloneJson(plan), cases: cloneJson(selectedCases as CaseDefinition[]) },
          results: {},
          exploratoryRecords: [],
          startedAt: now,
          updatedAt: now,
        };
        set((state) => ({ runs: [run, ...state.runs], activeRunId: run.id }));
        return { ok: true, value: run, message: `Tentativa ${attempt} iniciada.` };
      },

      setActiveRun: (runId) => set({ activeRunId: runId }),

      updateStepResult: async (runId, caseId, stepId, status, actualResult) => {
        const run = get().runs.find((item) => item.id === runId);
        if (!run || !isRunEditable(run) || run.status === "paused") {
          return { ok: false, message: "Esta execução não pode ser alterada." };
        }
        const testCase = run.snapshot.cases.find((item) => item.id === caseId);
        if (!testCase?.steps.some((step) => step.id === stepId)) {
          return { ok: false, message: "Passo não encontrado no snapshot da execução." };
        }
        const normalizedActual = actualResult.trim();
        if ((status === "failed" || status === "blocked") && !normalizedActual) {
          return { ok: false, message: "Informe o resultado obtido para falha ou bloqueio." };
        }
        const key = resultKey(caseId, stepId);
        const previous = run.results[key];
        const result: StepResult = {
          status,
          actualResult: normalizedActual,
          evidenceIds: previous?.evidenceIds ?? [],
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ runs: patchRun(state.runs, runId, (item) => ({
          ...item,
          status: item.status === "draft" ? "in_progress" : item.status,
          results: { ...item.results, [key]: result },
          updatedAt: result.updatedAt,
        })) }));
        return { ok: true, message: "Resultado salvo." };
      },

      setRunStatus: async (runId, status) => {
        const run = get().runs.find((item) => item.id === runId);
        if (!run) return { ok: false, message: "Execução não encontrada." };
        if (!isRunEditable(run)) return { ok: false, message: "Execuções finalizadas são imutáveis." };
        if (status === "completed") {
          const progress = runProgress(run);
          if (progress.executed < progress.total) {
            return { ok: false, message: `Ainda há ${progress.total - progress.executed} passo(s) não executado(s). Marque-os ou aborte a tentativa.` };
          }
        }
        const allowed: Record<RunStatus, RunStatus[]> = {
          draft: ["in_progress", "aborted"],
          in_progress: ["paused", "completed", "aborted"],
          paused: ["in_progress", "aborted"],
          completed: [],
          aborted: [],
        };
        if (!allowed[run.status].includes(status)) {
          return { ok: false, message: `Transição de ${run.status} para ${status} não permitida.` };
        }
        const now = new Date().toISOString();
        set((state) => ({
          runs: patchRun(state.runs, runId, (item) => ({
            ...item,
            status,
            updatedAt: now,
            finishedAt: status === "completed" || status === "aborted" ? now : undefined,
          })),
          activeRunId: status === "completed" || status === "aborted" ? null : state.activeRunId,
        }));
        return { ok: true, message: status === "completed" ? "Execução concluída e bloqueada para edição." : "Status atualizado." };
      },

      addEvidence: async (runId, ownerType, ownerId, file, name) => {
        const run = get().runs.find((item) => item.id === runId);
        if (!run || !isRunEditable(run) || run.status === "paused") {
          return { ok: false, message: "Esta execução não aceita novas evidências." };
        }
        if (!file.type.startsWith("image/")) {
          return { ok: false, message: "Nesta versão, a evidência deve ser uma imagem." };
        }
        try {
          const compact = get().settings.compactEvidence;
          const dataUrl = compact ? await compressImageToBase64(file) : await blobToDataUrl(file);
          const id = createId("EVD");
          const meta: EvidenceMeta = {
            id,
            ownerType,
            ownerId,
            runId,
            name: name || (file instanceof File ? file.name : `evidencia-${id}.png`),
            mimeType: compact ? "image/png" : file.type,
            size: file.size,
            sha256: await sha256(dataUrl),
            createdAt: new Date().toISOString(),
          };
          await idbSet(evidenceKey(id), dataUrl);
          set((state) => ({
            evidence: [...state.evidence, meta],
            runs: patchRun(state.runs, runId, (item) => {
              if (ownerType === "step") {
                const previous = item.results[ownerId] ?? {
                  status: "not_run" as const,
                  actualResult: "",
                  evidenceIds: [],
                  updatedAt: meta.createdAt,
                };
                return {
                  ...item,
                  results: {
                    ...item.results,
                    [ownerId]: { ...previous, evidenceIds: [...previous.evidenceIds, id], updatedAt: meta.createdAt },
                  },
                  updatedAt: meta.createdAt,
                };
              }
              return {
                ...item,
                exploratoryRecords: item.exploratoryRecords.map((record) =>
                  record.id === ownerId ? { ...record, evidenceIds: [...record.evidenceIds, id] } : record,
                ),
                updatedAt: meta.createdAt,
              };
            }),
          }));
          return { ok: true, value: meta, message: "Evidência anexada." };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : "Não foi possível processar a evidência." };
        }
      },

      getEvidenceData: async (evidenceId) => (await idbGet<string>(evidenceKey(evidenceId))) ?? null,

      removeEvidence: async (evidenceId) => {
        const meta = get().evidence.find((item) => item.id === evidenceId);
        if (!meta) return { ok: false, message: "Evidência não encontrada." };
        const run = get().runs.find((item) => item.id === meta.runId);
        if (!run || !isRunEditable(run)) return { ok: false, message: "Evidências de execuções finalizadas são imutáveis." };
        await idbDel(evidenceKey(evidenceId));
        set((state) => ({
          evidence: state.evidence.filter((item) => item.id !== evidenceId),
          runs: patchRun(state.runs, meta.runId, (item) => ({
            ...item,
            results: Object.fromEntries(Object.entries(item.results).map(([key, result]) => [
              key,
              { ...result, evidenceIds: result.evidenceIds.filter((id) => id !== evidenceId) },
            ])),
            exploratoryRecords: item.exploratoryRecords.map((record) => ({
              ...record,
              evidenceIds: record.evidenceIds.filter((id) => id !== evidenceId),
            })),
          })),
        }));
        return { ok: true, message: "Evidência removida." };
      },

      addExploratoryRecord: async (runId, input) => {
        const run = get().runs.find((item) => item.id === runId);
        if (!run || !isRunEditable(run) || run.status === "paused") {
          return { ok: false, message: "Esta execução não pode receber registros exploratórios." };
        }
        if (!input.title.trim() || !input.notes.trim()) {
          return { ok: false, message: "Título e observação são obrigatórios." };
        }
        const record: ExploratoryRecord = {
          ...input,
          id: createId("EXP"),
          title: normalizeText(input.title),
          notes: input.notes.trim(),
          evidenceIds: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ runs: patchRun(state.runs, runId, (item) => ({
          ...item,
          exploratoryRecords: [...item.exploratoryRecords, record],
          updatedAt: record.createdAt,
        })) }));
        return { ok: true, value: record, message: "Registro exploratório adicionado." };
      },

      createReport: async (runId, title, notes) => {
        const run = get().runs.find((item) => item.id === runId);
        if (!run) return { ok: false, message: "Execução não encontrada." };
        const report: ReportArtifact = {
          id: createId("REPORT"),
          runId,
          title: normalizeText(title) || `Relatório — ${run.snapshot.plan.name}`,
          notes: notes.trim(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ reports: [report, ...state.reports] }));
        return { ok: true, value: report, message: "Relatório registrado." };
      },

      removeReport: async (reportId) => {
        if (!get().reports.some((item) => item.id === reportId)) return { ok: false, message: "Relatório não encontrado." };
        set((state) => ({ reports: state.reports.filter((item) => item.id !== reportId) }));
        return { ok: true, message: "Registro de relatório removido. A execução foi preservada." };
      },

      updateSettings: (updates) => set((state) => ({ settings: { ...state.settings, ...updates } })),

      exportWorkspace: async () => {
        const state = get();
        const evidence: EvidenceBundleItem[] = [];
        for (const meta of state.evidence) {
          const dataUrl = await idbGet<string>(evidenceKey(meta.id));
          if (dataUrl) evidence.push({ meta, dataUrl });
        }
        return {
          schemaVersion: QA_FLOW_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          cases: cloneJson(state.cases),
          plans: cloneJson(state.plans),
          runs: cloneJson(state.runs),
          reports: cloneJson(state.reports),
          evidence,
          settings: cloneJson(state.settings),
        };
      },

      importWorkspace: async (rawBundle, mode) => {
        const validation = validateWorkspaceBundle(rawBundle);
        if (!validation.ok || !validation.value) {
          return { ok: false, message: "O backup não passou na validação.", issues: validation.issues };
        }
        const bundle = validation.value;
        if (mode === "replace") {
          for (const meta of get().evidence) await idbDel(evidenceKey(meta.id));
        }
        for (const item of bundle.evidence) await idbSet(evidenceKey(item.meta.id), item.dataUrl);
        set((state) => ({
          cases: mode === "replace" ? bundle.cases : mergeById(state.cases, bundle.cases),
          plans: mode === "replace" ? bundle.plans : mergeById(state.plans, bundle.plans),
          runs: mode === "replace" ? bundle.runs : mergeById(state.runs, bundle.runs),
          reports: mode === "replace" ? bundle.reports : mergeById(state.reports, bundle.reports),
          evidence: mode === "replace"
            ? bundle.evidence.map((item) => item.meta)
            : mergeById(state.evidence, bundle.evidence.map((item) => item.meta)),
          settings: mode === "replace" ? bundle.settings : state.settings,
          activeRunId: null,
        }));
        return {
          ok: true,
          message: `${bundle.cases.length} caso(s), ${bundle.plans.length} plano(s) e ${bundle.runs.length} execução(ões) importados.`,
        };
      },
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => indexedDbStorage),
      version: QA_FLOW_SCHEMA_VERSION,
      partialize: (state) => ({
        cases: state.cases,
        plans: state.plans,
        runs: state.runs,
        reports: state.reports,
        evidence: state.evidence,
        settings: state.settings,
        migrationReport: state.migrationReport,
        activeRunId: state.activeRunId,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          useQaStore.setState({
            storageError: "Falha ao ler o workspace do IndexedDB.",
            ready: true,
          });
          return;
        }
        void state?.initialize();
      },
    },
  ),
);
