import {
  QA_FLOW_SCHEMA_VERSION,
  type CaseDefinition,
  type CasePriority,
  type CaseStep,
  type LifecycleStatus,
  type PlanDefinition,
  type StepStatus,
  type TestRun,
  type ValidationIssue,
  type ValidationResult,
  type WorkspaceBundle,
} from "./types.ts";

const priorities: CasePriority[] = ["low", "medium", "high", "critical"];
const lifecycleStatuses: LifecycleStatus[] = ["active", "draft", "archived"];
const stepStatuses: StepStatus[] = [
  "not_run",
  "passed",
  "failed",
  "blocked",
  "skipped",
];

export function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

export function normalizePath(path: string[]): string[] {
  return path.map(normalizeText).filter(Boolean);
}

function requiredString(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  label: string,
): value is string {
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ path, message: `${label} é obrigatório.` });
    return false;
  }
  return true;
}

function validIsoDate(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function validateCaseDefinition(value: unknown): ValidationResult<CaseDefinition> {
  const issues: ValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "$", message: "Caso deve ser um objeto." }] };
  }

  const candidate = value as Partial<CaseDefinition>;
  if (candidate.schemaVersion !== QA_FLOW_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", message: "Versão de schema não suportada." });
  }
  requiredString(issues, "id", candidate.id, "ID");
  requiredString(issues, "title", candidate.title, "Título");
  if (!Number.isInteger(candidate.revision) || Number(candidate.revision) < 1) {
    issues.push({ path: "revision", message: "Revisão deve ser um inteiro maior que zero." });
  }
  if (!Array.isArray(candidate.path) || candidate.path.some((item) => typeof item !== "string")) {
    issues.push({ path: "path", message: "Caminho deve ser uma lista de textos." });
  }
  if (!candidate.priority || !priorities.includes(candidate.priority)) {
    issues.push({ path: "priority", message: "Prioridade inválida." });
  }
  if (!candidate.status || !lifecycleStatuses.includes(candidate.status)) {
    issues.push({ path: "status", message: "Status do caso inválido." });
  }
  if (!Array.isArray(candidate.tags) || candidate.tags.some((item) => typeof item !== "string")) {
    issues.push({ path: "tags", message: "Tags devem ser uma lista de textos." });
  }
  if (typeof candidate.precondition !== "string") {
    issues.push({ path: "precondition", message: "Pré-condição deve ser texto." });
  }
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
    issues.push({ path: "steps", message: "Informe ao menos um passo." });
  } else {
    const stepIds = new Set<string>();
    candidate.steps.forEach((step, index) => {
      validateStep(step, index, stepIds, issues);
    });
  }
  if (!Array.isArray(candidate.automationLinks)) {
    issues.push({ path: "automationLinks", message: "Vínculos de automação devem ser uma lista." });
  }
  if (!Array.isArray(candidate.externalReferences)) {
    issues.push({ path: "externalReferences", message: "Referências externas devem ser uma lista." });
  }
  if (!validIsoDate(candidate.createdAt)) {
    issues.push({ path: "createdAt", message: "Data de criação inválida." });
  }
  if (!validIsoDate(candidate.updatedAt)) {
    issues.push({ path: "updatedAt", message: "Data de atualização inválida." });
  }

  return { ok: issues.length === 0, value: issues.length === 0 ? candidate as CaseDefinition : undefined, issues };
}

function validateStep(
  step: Partial<CaseStep>,
  index: number,
  stepIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const basePath = `steps[${index}]`;
  if (requiredString(issues, `${basePath}.id`, step.id, "ID do passo")) {
    if (stepIds.has(step.id)) {
      issues.push({ path: `${basePath}.id`, message: "ID de passo duplicado." });
    }
    stepIds.add(step.id);
  }
  if (!step.type || !["given", "when", "then", "and"].includes(step.type)) {
    issues.push({ path: `${basePath}.type`, message: "Tipo de passo inválido." });
  }
  requiredString(issues, `${basePath}.action`, step.action, "Ação");
  requiredString(issues, `${basePath}.expectedResult`, step.expectedResult, "Resultado esperado");
}

export function validatePlanDefinition(value: unknown): ValidationResult<PlanDefinition> {
  const issues: ValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "$", message: "Plano deve ser um objeto." }] };
  }
  const candidate = value as Partial<PlanDefinition>;
  if (candidate.schemaVersion !== QA_FLOW_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", message: "Versão de schema não suportada." });
  }
  requiredString(issues, "id", candidate.id, "ID");
  requiredString(issues, "name", candidate.name, "Nome");
  requiredString(issues, "project", candidate.project, "Projeto");
  if (!Number.isInteger(candidate.revision) || Number(candidate.revision) < 1) {
    issues.push({ path: "revision", message: "Revisão deve ser um inteiro maior que zero." });
  }
  if (!candidate.status || !lifecycleStatuses.includes(candidate.status)) {
    issues.push({ path: "status", message: "Status do plano inválido." });
  }
  if (!Array.isArray(candidate.caseRefs) || candidate.caseRefs.length === 0) {
    issues.push({ path: "caseRefs", message: "Selecione ao menos um caso." });
  } else {
    const ids = new Set<string>();
    candidate.caseRefs.forEach((reference, index) => {
      if (!reference?.caseId) {
        issues.push({ path: `caseRefs[${index}].caseId`, message: "Referência sem ID de caso." });
      } else if (ids.has(reference.caseId)) {
        issues.push({ path: `caseRefs[${index}].caseId`, message: "Caso duplicado no plano." });
      } else {
        ids.add(reference.caseId);
      }
      if (!Number.isInteger(reference?.caseRevision) || reference.caseRevision < 1) {
        issues.push({ path: `caseRefs[${index}].caseRevision`, message: "Revisão de caso inválida." });
      }
    });
  }
  return { ok: issues.length === 0, value: issues.length === 0 ? candidate as PlanDefinition : undefined, issues };
}

export function validateRun(value: unknown): ValidationResult<TestRun> {
  const issues: ValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "$", message: "Execução deve ser um objeto." }] };
  }
  const candidate = value as Partial<TestRun>;
  requiredString(issues, "id", candidate.id, "ID");
  requiredString(issues, "planId", candidate.planId, "Plano");
  if (!candidate.snapshot || !Array.isArray(candidate.snapshot.cases)) {
    issues.push({ path: "snapshot", message: "Snapshot da execução inválido." });
  }
  if (!candidate.results || typeof candidate.results !== "object") {
    issues.push({ path: "results", message: "Resultados da execução inválidos." });
  } else {
    Object.entries(candidate.results).forEach(([key, result]) => {
      if (!stepStatuses.includes(result.status)) {
        issues.push({ path: `results.${key}.status`, message: "Status de passo inválido." });
      }
      if (["failed", "blocked"].includes(result.status) && !result.actualResult.trim()) {
        issues.push({ path: `results.${key}.actualResult`, message: "Falha ou bloqueio exige resultado obtido." });
      }
    });
  }
  return { ok: issues.length === 0, value: issues.length === 0 ? candidate as TestRun : undefined, issues };
}

export function validateWorkspaceBundle(value: unknown): ValidationResult<WorkspaceBundle> {
  const issues: ValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "$", message: "Backup deve ser um objeto JSON." }] };
  }
  const candidate = value as Partial<WorkspaceBundle>;
  if (candidate.schemaVersion !== QA_FLOW_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", message: "Backup não é da versão 2." });
  }
  if (!Array.isArray(candidate.cases)) issues.push({ path: "cases", message: "Lista de casos ausente." });
  if (!Array.isArray(candidate.plans)) issues.push({ path: "plans", message: "Lista de planos ausente." });
  if (!Array.isArray(candidate.runs)) issues.push({ path: "runs", message: "Lista de execuções ausente." });
  if (!Array.isArray(candidate.reports)) issues.push({ path: "reports", message: "Lista de relatórios ausente." });
  if (!Array.isArray(candidate.evidence)) issues.push({ path: "evidence", message: "Lista de evidências ausente." });
  candidate.cases?.forEach((item, index) => {
    validateCaseDefinition(item).issues.forEach((issue) => issues.push({ ...issue, path: `cases[${index}].${issue.path}` }));
  });
  candidate.plans?.forEach((item, index) => {
    validatePlanDefinition(item).issues.forEach((issue) => issues.push({ ...issue, path: `plans[${index}].${issue.path}` }));
  });
  candidate.runs?.forEach((item, index) => {
    validateRun(item).issues.forEach((issue) => issues.push({ ...issue, path: `runs[${index}].${issue.path}` }));
  });
  return { ok: issues.length === 0, value: issues.length === 0 ? candidate as WorkspaceBundle : undefined, issues };
}

export function resultKey(caseId: string, stepId: string): string {
  return `${caseId}::${stepId}`;
}

export function isRunEditable(run: TestRun): boolean {
  return run.status === "draft" || run.status === "in_progress" || run.status === "paused";
}

export function deriveCaseStatus(run: TestRun, testCase: CaseDefinition): StepStatus {
  const statuses = testCase.steps.map((step) => run.results[resultKey(testCase.id, step.id)]?.status ?? "not_run");
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.every((status) => status === "skipped")) return "skipped";
  if (statuses.every((status) => status === "passed" || status === "skipped")) return "passed";
  return "not_run";
}

export function runProgress(run: TestRun): { total: number; executed: number; percent: number } {
  const total = run.snapshot.cases.reduce((sum, testCase) => sum + testCase.steps.length, 0);
  const executed = Object.values(run.results).filter((result) => result.status !== "not_run").length;
  return { total, executed, percent: total === 0 ? 0 : Math.round((executed / total) * 100) };
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
