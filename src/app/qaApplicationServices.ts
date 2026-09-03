import { createDefaultDemandColumns, moveDemandToColumn } from "../domain/demands.ts";
import {
  QA_FLOW_SCHEMA_VERSION,
  type CaseDefinition,
  type DemandColumn,
  type DemandColumnSemantic,
  type EvidenceMeta,
  type ExploratoryRecord,
  type PlanDefinition,
  type QaDemand,
  type ReportArtifact,
  type RunContext,
  type RunStatus,
  type StepResult,
  type StepStatus,
  type TestRun,
  type WorkspaceSettings,
} from "../domain/types.ts";
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
} from "../domain/validation.ts";
import type {
  CommitResponse,
  GeneratedFileRequest,
  ImportPreview,
  LocalPreferences,
  RepositoryPreview,
  StorageMutation,
  TransferResult,
  UpdateState,
  WorkspaceData,
  WorkspaceSnapshot,
} from "../platform/contracts/dtos";
import { IPC_CONTRACT_VERSION } from "../platform/contracts/dtos.ts";
import { dataUrlToBytes, bytesToDataUrl } from "../platform/contracts/binary.ts";
import { desktopError, toDesktopError } from "../platform/contracts/errors.ts";
import type { RuntimePort, TransferPort, WorkspacePort } from "../platform/contracts/ports";
import { applyStorageMutations, cloneWorkspaceData } from "../platform/contracts/workspaceData.ts";
import type { QaState, QaStateSetter } from "../store/types";
import { compressImageToBase64 } from "../utils/compressImage.ts";
import {
  CommitCoordinator,
  skipped,
  type ApplicationResult,
  type PreparedOperation,
} from "./commitCoordinator.ts";

interface ApplicationServicesOptions {
  workspacePort: WorkspacePort;
  transferPort: TransferPort;
  runtimePort: RuntimePort;
  getState(): QaState;
  setState: QaStateSetter;
}

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

interface WorkspaceChange<T> {
  mutations: StorageMutation[];
  nextWorkspace: WorkspaceData;
  result: ApplicationResult<T>;
  sessionChanges?: Partial<QaState>;
}

type WorkspacePreparation<T> = WorkspaceChange<T> | ApplicationResult<T>;

function isWorkspaceChange<T>(value: WorkspacePreparation<T>): value is WorkspaceChange<T> {
  return "mutations" in value;
}

function workspaceFromState(state: QaState): WorkspaceData {
  return cloneWorkspaceData({
    cases: state.cases,
    plans: state.plans,
    runs: state.runs,
    reports: state.reports,
    evidence: state.evidence,
    demandColumns: state.demandColumns,
    demands: state.demands,
    settings: state.settings,
    migrationReport: state.migrationReport,
  });
}

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

function operationId(prefix: string): string {
  return createId(`OP-${prefix}`);
}

function ensureCompatibleSnapshot(snapshot: WorkspaceSnapshot): void {
  if (snapshot.ipcContractVersion !== IPC_CONTRACT_VERSION) {
    throw desktopError(
      "UNSUPPORTED_SCHEMA",
      "A versão do frontend não é compatível com o backend desktop. Reinstale o aplicativo.",
      { retryable: false },
    );
  }
  if (snapshot.health.status === "recoveryRequired") {
    throw desktopError(
      "RECOVERY_REQUIRED",
      snapshot.health.message ?? "O workspace precisa de recuperação antes de ser aberto.",
      { retryable: false },
    );
  }
}

export class QaApplicationServices {
  private readonly options: ApplicationServicesOptions;
  private readonly coordinator: CommitCoordinator;

  constructor(options: ApplicationServicesOptions) {
    this.options = options;
    this.coordinator = new CommitCoordinator({
      getStorageRevision: () => options.getState().storageRevision,
      setSaveState: (saveState) => options.setState({ saveState }),
    });
  }

  async initialize(): Promise<void> {
    const state = this.options.getState();
    if ((state.ready && !state.storageError) || state.initializing) return;
    this.options.setState({ initializing: true, storageError: null });
    try {
      const [snapshot, runtimeInfo, preferences] = await Promise.all([
        this.options.workspacePort.initialize(),
        this.options.runtimePort.getRuntimeInfo(),
        this.options.runtimePort.getPreferences(),
      ]);
      ensureCompatibleSnapshot(snapshot);
      if (runtimeInfo.ipcContractVersion !== IPC_CONTRACT_VERSION) {
        throw desktopError(
          "UNSUPPORTED_SCHEMA",
          "O contrato IPC do runtime não corresponde ao frontend instalado.",
        );
      }
      this.options.setState({
        ...cloneWorkspaceData(snapshot.workspace),
        storageRevision: snapshot.storageRevision,
        saveState: { kind: "idle", committedAt: snapshot.committedAt },
        runtimeInfo,
        preferences,
        ready: true,
        initializing: false,
        storageError: null,
      });
    } catch (value) {
      const error = toDesktopError(value);
      this.options.setState({
        ready: false,
        initializing: false,
        storageError: error.message,
        saveState: { kind: "error", operationId: error.operationId ?? "initialize", error },
      });
    }
  }

  saveCase(candidate: CaseDefinition, expectedRevision: number | null): Promise<ApplicationResult<CaseDefinition>> {
    return this.commitWorkspace("CASE", () => {
      const state = this.options.getState();
      const existing = state.cases.find((item) => item.id === candidate.id);
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
      const mutation: StorageMutation = {
        kind: "case",
        action: "upsert",
        id: normalized.id,
        expectedEntityRevision: expectedRevision,
        payload: normalized,
      };
      return this.change([mutation], {
        ok: true,
        value: normalized,
        message: existing ? "Nova revisão do caso salva." : "Caso criado.",
      });
    });
  }

  archiveCase(caseId: string): Promise<ApplicationResult> {
    return this.commitWorkspace("CASE-ARCHIVE", () => {
      const state = this.options.getState();
      const existing = state.cases.find((item) => item.id === caseId);
      if (!existing) return { ok: false, message: "Caso não encontrado." };
      const impactedPlans = state.plans.filter((plan) =>
        plan.status !== "archived" && plan.caseRefs.some((reference) => reference.caseId === caseId),
      );
      const updated = normalizeCase({ ...existing, status: "archived" }, existing.revision + 1, existing.createdAt);
      return this.change([{
        kind: "case",
        action: "archive",
        id: caseId,
        expectedEntityRevision: existing.revision,
        payload: updated,
      }], {
        ok: true,
        message: impactedPlans.length
          ? `Caso arquivado. ${impactedPlans.length} plano(s) continuam referenciando sua última revisão.`
          : "Caso arquivado.",
      });
    });
  }

  savePlan(candidate: PlanDefinition, expectedRevision: number | null): Promise<ApplicationResult<PlanDefinition>> {
    return this.commitWorkspace("PLAN", () => {
      const state = this.options.getState();
      const existing = state.plans.find((item) => item.id === candidate.id);
      if (expectedRevision === null && existing) {
        return { ok: false, message: `Já existe um plano com o ID ${candidate.id}.` };
      }
      if (expectedRevision !== null && (!existing || expectedRevision !== existing.revision)) {
        return { ok: false, message: "O plano foi alterado em outra versão. Reabra antes de salvar." };
      }
      const references = candidate.caseRefs.map((reference) => ({ ...reference }));
      const missing = references.filter((reference) => !state.cases.some((item) => item.id === reference.caseId));
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
      return this.change([{
        kind: "plan",
        action: "upsert",
        id: normalized.id,
        expectedEntityRevision: expectedRevision,
        payload: normalized,
      }], {
        ok: true,
        value: normalized,
        message: existing ? "Nova revisão do plano salva." : "Plano criado.",
      });
    });
  }

  archivePlan(planId: string): Promise<ApplicationResult> {
    return this.commitWorkspace("PLAN-ARCHIVE", () => {
      const plan = this.options.getState().plans.find((item) => item.id === planId);
      if (!plan) return { ok: false, message: "Plano não encontrado." };
      const updated = normalizePlan({ ...plan, status: "archived" }, plan.revision + 1, plan.createdAt);
      return this.change([{
        kind: "plan",
        action: "archive",
        id: planId,
        expectedEntityRevision: plan.revision,
        payload: updated,
      }], { ok: true, message: "Plano arquivado. O histórico de execuções foi preservado." });
    });
  }

  startRun(planId: string, context: RunContext, sourceRunId?: string): Promise<ApplicationResult<TestRun>> {
    return this.commitWorkspace("RUN-START", () => {
      const state = this.options.getState();
      const plan = state.plans.find((item) => item.id === planId);
      if (!plan || plan.status === "archived") return { ok: false, message: "Selecione um plano ativo." };
      const selectedCases = plan.caseRefs.map((reference) =>
        state.cases.find((item) => item.id === reference.caseId && item.revision === reference.caseRevision),
      );
      if (selectedCases.some((item) => !item)) {
        return { ok: false, message: "O plano possui referências ausentes ou desatualizadas. Abra-o, revise as mudanças e atualize as revisões antes de executar." };
      }
      if (selectedCases.some((item) => item?.status !== "active")) {
        return { ok: false, message: "O plano contém casos em rascunho ou arquivados. Ative ou substitua esses casos antes de executar." };
      }
      const now = new Date().toISOString();
      const attempt = state.runs.filter((run) => run.planId === planId).length + 1;
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
      const change = this.change<TestRun>([{
        kind: "run",
        action: "upsert",
        id: run.id,
        payload: run,
      }], { ok: true, value: run, message: `Tentativa ${attempt} iniciada.` });
      change.sessionChanges = { activeRunId: run.id };
      return change;
    });
  }

  updateStepResult(
    runId: string,
    caseId: string,
    stepId: string,
    status: StepStatus,
    actualResult: string,
  ): Promise<ApplicationResult> {
    return this.commitWorkspace("RUN-RESULT", () => {
      const state = this.options.getState();
      const run = state.runs.find((item) => item.id === runId);
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
      const updated: TestRun = {
        ...run,
        status: run.status === "draft" ? "in_progress" : run.status,
        results: { ...run.results, [key]: result },
        updatedAt: result.updatedAt,
      };
      return this.change([{
        kind: "run", action: "upsert", id: runId, payload: updated,
      }], { ok: true, message: "Resultado salvo." });
    });
  }

  setRunStatus(runId: string, status: RunStatus): Promise<ApplicationResult> {
    return this.commitWorkspace<undefined>("RUN-STATUS", () => {
      const state = this.options.getState();
      const run = state.runs.find((item) => item.id === runId);
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
      const updated: TestRun = {
        ...run,
        status,
        updatedAt: now,
        finishedAt: status === "completed" || status === "aborted" ? now : undefined,
      };
      const change = this.change<undefined>([{
        kind: "run", action: "upsert", id: runId, payload: updated,
      }], {
        ok: true,
        message: status === "completed" ? "Execução concluída e bloqueada para edição." : "Status atualizado.",
      });
      if (status === "completed" || status === "aborted") change.sessionChanges = { activeRunId: null };
      return change;
    });
  }

  addEvidence(
    runId: string,
    ownerType: EvidenceMeta["ownerType"],
    ownerId: string,
    file: File | Blob,
    name?: string,
  ): Promise<ApplicationResult<EvidenceMeta>> {
    const id = operationId("EVIDENCE-ADD");
    return this.coordinator.enqueue(id, async () => {
      const state = this.options.getState();
      const run = state.runs.find((item) => item.id === runId);
      if (!run || !isRunEditable(run) || run.status === "paused") {
        return skipped({ ok: false, message: "Esta execução não aceita novas evidências." });
      }
      if (!file.type.startsWith("image/")) {
        return skipped({ ok: false, message: "Nesta versão, a evidência deve ser uma imagem." });
      }
      if (file.size > MAX_EVIDENCE_BYTES) {
        return skipped({ ok: false, message: "A evidência deve ter no máximo 10 MiB." });
      }

      try {
        const compact = state.settings.compactEvidence;
        const dataUrl = compact ? await compressImageToBase64(file) : await blobToDataUrl(file);
        const bytes = dataUrlToBytes(dataUrl);
        if (bytes.length > MAX_EVIDENCE_BYTES) {
          return skipped({ ok: false, message: "A imagem processada excedeu o limite de 10 MiB." });
        }
        const evidenceId = createId("EVD");
        const meta: EvidenceMeta = {
          id: evidenceId,
          ownerType,
          ownerId,
          runId,
          name: name || (file instanceof File ? file.name : `evidencia-${evidenceId}.png`),
          mimeType: compact ? "image/png" : file.type,
          size: bytes.length,
          sha256: await sha256(dataUrl),
          createdAt: new Date().toISOString(),
        };
        const updatedRun = this.runWithEvidence(run, meta);
        const mutations: StorageMutation[] = [{
          kind: "run", action: "upsert", id: runId, payload: updatedRun,
        }];
        const nextWorkspace = applyStorageMutations(workspaceFromState(state), mutations);
        nextWorkspace.evidence = [...nextWorkspace.evidence, meta];

        return {
          kind: "commit",
          execute: (expectedStorageRevision) => this.options.workspacePort.addEvidence({
            operationId: id,
            expectedStorageRevision,
            meta,
            mutations,
          }, bytes),
          apply: (response) => this.applyConfirmedWorkspace(nextWorkspace, response),
          result: () => ({ ok: true, value: meta, message: "Evidência anexada." }),
        } satisfies PreparedOperation<EvidenceMeta, CommitResponse>;
      } catch (value) {
        return skipped({
          ok: false,
          message: value instanceof Error ? value.message : "Não foi possível processar a evidência.",
        });
      }
    });
  }

  async getEvidenceData(evidenceId: string): Promise<string | null> {
    try {
      const evidence = await this.options.workspacePort.readEvidence(evidenceId);
      return bytesToDataUrl(evidence.bytes, evidence.mimeType);
    } catch {
      return null;
    }
  }

  removeEvidence(evidenceId: string): Promise<ApplicationResult> {
    const id = operationId("EVIDENCE-REMOVE");
    return this.coordinator.enqueue(id, () => {
      const state = this.options.getState();
      const meta = state.evidence.find((item) => item.id === evidenceId);
      if (!meta) return skipped({ ok: false, message: "Evidência não encontrada." });
      const run = state.runs.find((item) => item.id === meta.runId);
      if (!run || !isRunEditable(run)) {
        return skipped({ ok: false, message: "Evidências de execuções finalizadas são imutáveis." });
      }
      const updatedRun: TestRun = {
        ...run,
        results: Object.fromEntries(Object.entries(run.results).map(([key, result]) => [
          key,
          { ...result, evidenceIds: result.evidenceIds.filter((item) => item !== evidenceId) },
        ])),
        exploratoryRecords: run.exploratoryRecords.map((record) => ({
          ...record,
          evidenceIds: record.evidenceIds.filter((item) => item !== evidenceId),
        })),
      };
      const mutations: StorageMutation[] = [{
        kind: "run", action: "upsert", id: run.id, payload: updatedRun,
      }];
      const nextWorkspace = applyStorageMutations(workspaceFromState(state), mutations);
      nextWorkspace.evidence = nextWorkspace.evidence.filter((item) => item.id !== evidenceId);
      return {
        kind: "commit",
        execute: (expectedStorageRevision) => this.options.workspacePort.removeEvidence({
          operationId: id,
          expectedStorageRevision,
          evidenceId,
          mutations,
        }),
        apply: (response) => this.applyConfirmedWorkspace(nextWorkspace, response),
        result: () => ({ ok: true, message: "Evidência removida." }),
      } satisfies PreparedOperation<undefined, CommitResponse>;
    });
  }

  addExploratoryRecord(
    runId: string,
    input: Omit<ExploratoryRecord, "id" | "createdAt" | "evidenceIds">,
  ): Promise<ApplicationResult<ExploratoryRecord>> {
    return this.commitWorkspace("RUN-EXPLORE", () => {
      const run = this.options.getState().runs.find((item) => item.id === runId);
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
      const updated = {
        ...run,
        exploratoryRecords: [...run.exploratoryRecords, record],
        updatedAt: record.createdAt,
      };
      return this.change([{
        kind: "run", action: "upsert", id: runId, payload: updated,
      }], { ok: true, value: record, message: "Registro exploratório adicionado." });
    });
  }

  createReport(runId: string, title: string, notes: string): Promise<ApplicationResult<ReportArtifact>> {
    return this.commitWorkspace("REPORT", () => {
      const run = this.options.getState().runs.find((item) => item.id === runId);
      if (!run) return { ok: false, message: "Execução não encontrada." };
      const report: ReportArtifact = {
        id: createId("REPORT"),
        runId,
        title: normalizeText(title) || `Relatório — ${run.snapshot.plan.name}`,
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
      };
      return this.change([{
        kind: "report", action: "upsert", id: report.id, payload: report,
      }], { ok: true, value: report, message: "Relatório registrado." });
    });
  }

  removeReport(reportId: string): Promise<ApplicationResult> {
    return this.commitWorkspace("REPORT-REMOVE", () => {
      if (!this.options.getState().reports.some((item) => item.id === reportId)) {
        return { ok: false, message: "Relatório não encontrado." };
      }
      return this.change([{
        kind: "report", action: "delete", id: reportId,
      }], { ok: true, message: "Registro de relatório removido. A execução foi preservada." });
    });
  }

  saveDemand(candidate: QaDemand): Promise<ApplicationResult<QaDemand>> {
    return this.commitWorkspace("DEMAND", () => {
      const state = this.options.getState();
      const title = normalizeText(candidate.title);
      if (!title) return { ok: false, message: "Informe o título da demanda." };
      if (!state.demandColumns.some((column) => column.id === candidate.columnId)) {
        return { ok: false, message: "Selecione uma coluna válida." };
      }
      const existing = state.demands.find((item) => item.id === candidate.id);
      const targetColumn = state.demandColumns.find((item) => item.id === candidate.columnId);
      const now = new Date().toISOString();
      const normalized: QaDemand = {
        ...candidate,
        id: normalizeText(candidate.id) || createId("DEM"),
        title,
        description: candidate.description.trim(),
        assignee: normalizeText(candidate.assignee),
        tags: normalizeTags(candidate.tags),
        checklist: candidate.checklist
          .map((item) => ({ ...item, label: normalizeText(item.label) }))
          .filter((item) => item.label),
        links: candidate.links.filter((link) => link.id && link.label),
        createdAt: existing?.createdAt ?? candidate.createdAt ?? now,
        updatedAt: now,
        completedAt: targetColumn?.semantic === "done"
          ? (existing?.completedAt ?? candidate.completedAt ?? now)
          : undefined,
      };
      return this.change([{
        kind: "demand", action: "upsert", id: normalized.id, payload: normalized,
      }], {
        ok: true,
        value: normalized,
        message: existing ? "Demanda salva." : "Demanda criada.",
      });
    });
  }

  deleteDemand(demandId: string): Promise<ApplicationResult> {
    return this.commitWorkspace("DEMAND-REMOVE", () => {
      if (!this.options.getState().demands.some((item) => item.id === demandId)) {
        return { ok: false, message: "Demanda não encontrada." };
      }
      return this.change([{
        kind: "demand", action: "delete", id: demandId,
      }], { ok: true, message: "Demanda excluída." });
    });
  }

  moveDemand(demandId: string, columnId: string, requestedOrder?: number): Promise<ApplicationResult<QaDemand>> {
    return this.commitWorkspace("DEMAND-MOVE", () => {
      const state = this.options.getState();
      const demand = state.demands.find((item) => item.id === demandId);
      const column = state.demandColumns.find((item) => item.id === columnId);
      if (!demand || !column) return { ok: false, message: "Demanda ou coluna não encontrada." };
      const destination = state.demands
        .filter((item) => item.columnId === columnId && item.id !== demandId)
        .sort((left, right) => left.order - right.order);
      const order = Math.max(0, Math.min(requestedOrder ?? destination.length, destination.length));
      const moved = moveDemandToColumn(demand, column, order);
      const source = state.demands
        .filter((item) => item.columnId === demand.columnId && item.id !== demandId)
        .sort((left, right) => left.order - right.order);
      const target = demand.columnId === columnId
        ? source
        : state.demands.filter((item) => item.columnId === columnId && item.id !== demandId)
          .sort((left, right) => left.order - right.order);
      target.splice(order, 0, moved);
      const normalizedTarget = target.map((item, itemOrder) => ({ ...item, order: itemOrder }));
      const normalizedSource = demand.columnId === columnId
        ? []
        : source.map((item, itemOrder) => ({ ...item, order: itemOrder }));
      const changed = [...normalizedSource, ...normalizedTarget];
      return this.change(changed.map((item) => ({
        kind: "demand" as const,
        action: "upsert" as const,
        id: item.id,
        payload: item,
      })), { ok: true, value: moved, message: `Demanda movida para ${column.name}.` });
    });
  }

  addDemandColumn(name: string, semantic: DemandColumnSemantic): Promise<ApplicationResult<DemandColumn>> {
    return this.commitWorkspace("COLUMN", () => {
      const normalizedName = normalizeText(name);
      if (!normalizedName) return { ok: false, message: "Informe o nome da coluna." };
      const now = new Date().toISOString();
      const column: DemandColumn = {
        id: createId("COL"),
        name: normalizedName,
        semantic,
        order: this.options.getState().demandColumns.length,
        createdAt: now,
        updatedAt: now,
      };
      return this.change([{
        kind: "demandColumn", action: "upsert", id: column.id, payload: column,
      }], { ok: true, value: column, message: "Coluna criada." });
    });
  }

  updateDemandColumn(
    columnId: string,
    name: string,
    semantic: DemandColumnSemantic,
  ): Promise<ApplicationResult<DemandColumn>> {
    return this.commitWorkspace("COLUMN", () => {
      const state = this.options.getState();
      const existing = state.demandColumns.find((item) => item.id === columnId);
      const normalizedName = normalizeText(name);
      if (!existing) return { ok: false, message: "Coluna não encontrada." };
      if (!normalizedName) return { ok: false, message: "Informe o nome da coluna." };
      const updated = { ...existing, name: normalizedName, semantic, updatedAt: new Date().toISOString() };
      const enteringDone = semantic === "done" && existing.semantic !== "done";
      const leavingDone = semantic !== "done" && existing.semantic === "done";
      const mutations: StorageMutation[] = [{
        kind: "demandColumn", action: "upsert", id: columnId, payload: updated,
      }];
      state.demands.filter((item) => item.columnId === columnId).forEach((item) => {
        mutations.push({
          kind: "demand",
          action: "upsert",
          id: item.id,
          payload: {
            ...item,
            completedAt: enteringDone
              ? (item.completedAt ?? updated.updatedAt)
              : leavingDone ? undefined : item.completedAt,
          },
        });
      });
      return this.change(mutations, { ok: true, value: updated, message: "Coluna atualizada." });
    });
  }

  moveDemandColumn(columnId: string, direction: -1 | 1): Promise<ApplicationResult> {
    return this.commitWorkspace("COLUMN-MOVE", () => {
      const ordered = [...this.options.getState().demandColumns].sort((left, right) => left.order - right.order);
      const currentIndex = ordered.findIndex((column) => column.id === columnId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
        return { ok: false, message: "A coluna já está no limite do quadro." };
      }
      [ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[currentIndex]];
      const normalized = ordered.map((column, order) => ({ ...column, order }));
      return this.change(normalized.map((column) => ({
        kind: "demandColumn" as const,
        action: "upsert" as const,
        id: column.id,
        payload: column,
      })), { ok: true, message: "Ordem das colunas atualizada." });
    });
  }

  deleteDemandColumn(columnId: string): Promise<ApplicationResult> {
    return this.commitWorkspace("COLUMN-REMOVE", () => {
      const state = this.options.getState();
      if (state.demands.some((item) => item.columnId === columnId)) {
        return { ok: false, message: "Mova as demandas desta coluna antes de excluí-la." };
      }
      if (state.demandColumns.length === 1) {
        return { ok: false, message: "O quadro precisa ter ao menos uma coluna." };
      }
      const normalized = state.demandColumns
        .filter((item) => item.id !== columnId)
        .sort((left, right) => left.order - right.order)
        .map((item, order) => ({ ...item, order }));
      const mutations: StorageMutation[] = [
        { kind: "demandColumn", action: "delete", id: columnId },
        ...normalized.map((column) => ({
          kind: "demandColumn" as const,
          action: "upsert" as const,
          id: column.id,
          payload: column,
        })),
      ];
      return this.change(mutations, { ok: true, message: "Coluna excluída." });
    });
  }

  updateSettings(updates: Partial<WorkspaceSettings>): Promise<ApplicationResult<WorkspaceSettings>> {
    return this.commitWorkspace("SETTINGS", () => {
      const settings = { ...this.options.getState().settings, ...updates };
      return this.change([{
        kind: "settings", action: "upsert", id: "workspace", payload: settings,
      }], { ok: true, value: settings, message: "Configurações salvas." });
    });
  }

  async setPreference(changes: LocalPreferences): Promise<ApplicationResult> {
    const previous = this.options.getState().preferences;
    const next = { ...previous, ...changes };
    this.options.setState({ preferences: next });
    try {
      await this.options.runtimePort.setPreferences(changes);
      return { ok: true, message: "Preferência salva." };
    } catch (value) {
      this.options.setState({ preferences: previous });
      const error = toDesktopError(value);
      return { ok: false, message: error.message, error };
    }
  }

  saveGeneratedFile(
    request: GeneratedFileRequest,
    bytes: Uint8Array,
  ): Promise<ApplicationResult<TransferResult>> {
    return this.readOperation(async () => {
      const result = await this.options.transferPort.saveGeneratedFile(request, bytes);
      return {
        ok: result.status === "completed",
        value: result,
        message: result.status === "completed"
          ? `Arquivo salvo${result.displayName ? `: ${result.displayName}` : "."}`
          : "Gravação cancelada.",
      };
    });
  }

  exportBackup(): Promise<ApplicationResult<TransferResult>> {
    return this.readOperation(async () => {
      const result = await this.options.transferPort.exportBackup({
        suggestedName: `qaflow-backup-${new Date().toISOString().slice(0, 10)}.json`,
      });
      return {
        ok: result.status === "completed",
        value: result,
        message: result.status === "completed" ? "Backup completo exportado." : "Exportação cancelada.",
      };
    });
  }

  inspectBackup(): Promise<ApplicationResult<ImportPreview | null>> {
    return this.readOperation(async () => {
      const preview = await this.options.transferPort.inspectBackup();
      return preview.status === "cancelled"
        ? { ok: true, value: null, message: "Seleção cancelada." }
        : { ok: true, value: preview, message: "Backup validado." };
    });
  }

  applyImport(previewToken: string, mode: "merge" | "replace"): Promise<ApplicationResult> {
    const id = operationId("IMPORT");
    return this.coordinator.enqueue(id, () => ({
      kind: "commit",
      execute: (expectedStorageRevision) => this.options.transferPort.applyImport({
        previewToken,
        mode,
        expectedStorageRevision,
      }),
      apply: (receipt) => {
        ensureCompatibleSnapshot(receipt.snapshot);
        this.options.setState({
          ...cloneWorkspaceData(receipt.snapshot.workspace),
          storageRevision: receipt.storageRevision,
          activeRunId: null,
        });
      },
      result: (receipt) => ({
        ok: true,
        message: `${receipt.summary.cases} caso(s), ${receipt.summary.plans} plano(s), ${receipt.summary.runs} execução(ões) e ${receipt.summary.demands} demanda(s) importados.`,
      }),
    }));
  }

  pushRepository(): Promise<ApplicationResult<TransferResult>> {
    return this.readOperation(async () => {
      const result = await this.options.transferPort.pushRepository({});
      return {
        ok: result.status === "completed",
        value: result,
        message: result.status === "completed" ? "Workspace gravado em .qaflow." : "Operação cancelada.",
      };
    });
  }

  inspectRepository(): Promise<ApplicationResult<RepositoryPreview | null>> {
    return this.readOperation(async () => {
      const preview = await this.options.transferPort.inspectRepository();
      return preview.status === "cancelled"
        ? { ok: true, value: null, message: "Seleção cancelada." }
        : { ok: true, value: preview, message: "Repositório validado." };
    });
  }

  pullRepository(previewToken: string, mode: "merge" | "replace" = "merge"): Promise<ApplicationResult> {
    const id = operationId("REPOSITORY-PULL");
    return this.coordinator.enqueue(id, () => ({
      kind: "commit",
      execute: (expectedStorageRevision) => this.options.transferPort.pullRepository({
        previewToken,
        mode,
        expectedStorageRevision,
      }),
      apply: (receipt) => {
        ensureCompatibleSnapshot(receipt.snapshot);
        this.options.setState({
          ...cloneWorkspaceData(receipt.snapshot.workspace),
          storageRevision: receipt.storageRevision,
          activeRunId: null,
        });
      },
      result: () => ({ ok: true, message: "Conteúdo do repositório mesclado." }),
    }));
  }

  checkForUpdate(): Promise<ApplicationResult<UpdateState>> {
    return this.readOperation(async () => {
      const state = await this.options.runtimePort.checkForUpdate();
      const message = state.status === "available"
        ? `Atualização ${state.version} disponível.`
        : state.status === "upToDate"
          ? "O QA Flow está atualizado."
          : state.status === "disabled"
            ? state.reason
            : "Atualizações nativas não estão disponíveis neste runtime.";
      return { ok: true, value: state, message };
    });
  }

  installUpdate(expectedVersion: string): Promise<ApplicationResult> {
    return this.readOperation(async () => {
      await this.options.runtimePort.installUpdate(expectedVersion);
      return {
        ok: true,
        message: "Atualização verificada e encaminhada ao instalador.",
      };
    });
  }

  private commitWorkspace<T>(
    prefix: string,
    prepare: () => WorkspacePreparation<T>,
  ): Promise<ApplicationResult<T>> {
    const id = operationId(prefix);
    return this.coordinator.enqueue(id, () => {
      const prepared = prepare();
      if (!isWorkspaceChange(prepared)) return skipped(prepared);
      return {
        kind: "commit",
        execute: (expectedStorageRevision) => this.options.workspacePort.commit({
          operationId: id,
          expectedStorageRevision,
          mutations: prepared.mutations,
        }),
        apply: (response) => {
          this.applyConfirmedWorkspace(prepared.nextWorkspace, response);
          if (prepared.sessionChanges) this.options.setState(prepared.sessionChanges);
        },
        result: () => prepared.result,
      } satisfies PreparedOperation<T, CommitResponse>;
    });
  }

  private change<T>(mutations: StorageMutation[], result: ApplicationResult<T>): WorkspaceChange<T> {
    return {
      mutations,
      nextWorkspace: applyStorageMutations(workspaceFromState(this.options.getState()), mutations),
      result,
    };
  }

  private applyConfirmedWorkspace(nextWorkspace: WorkspaceData, response: CommitResponse): void {
    this.options.setState({
      ...cloneWorkspaceData(nextWorkspace),
      storageRevision: response.storageRevision,
    });
  }

  private runWithEvidence(run: TestRun, meta: EvidenceMeta): TestRun {
    if (meta.ownerType === "step") {
      const previous = run.results[meta.ownerId] ?? {
        status: "not_run" as const,
        actualResult: "",
        evidenceIds: [],
        updatedAt: meta.createdAt,
      };
      return {
        ...run,
        results: {
          ...run.results,
          [meta.ownerId]: {
            ...previous,
            evidenceIds: [...previous.evidenceIds, meta.id],
            updatedAt: meta.createdAt,
          },
        },
        updatedAt: meta.createdAt,
      };
    }
    return {
      ...run,
      exploratoryRecords: run.exploratoryRecords.map((record) =>
        record.id === meta.ownerId
          ? { ...record, evidenceIds: [...record.evidenceIds, meta.id] }
          : record,
      ),
      updatedAt: meta.createdAt,
    };
  }

  private async readOperation<T>(operation: () => Promise<ApplicationResult<T>>): Promise<ApplicationResult<T>> {
    try {
      return await operation();
    } catch (value) {
      const error = toDesktopError(value);
      return { ok: false, message: error.message, error };
    }
  }
}

export function createFallbackDemandColumns(): DemandColumn[] {
  return createDefaultDemandColumns();
}
