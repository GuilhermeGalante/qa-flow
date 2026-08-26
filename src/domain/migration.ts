import type { Report, TestPlan, TestScenario, TestStep } from "../types/index.ts";
import {
  QA_FLOW_SCHEMA_VERSION,
  type CaseDefinition,
  type CasePriority,
  type EvidenceBundleItem,
  type MigrationReport,
  type PlanDefinition,
  type ReportArtifact,
  type StepStatus,
  type TestRun,
} from "./types.ts";
import { cloneJson, createId, normalizePath, normalizeTags, resultKey } from "./validation.ts";

interface LegacyState {
  plans?: TestPlan[];
  reports?: Report[];
  currentPlan?: TestPlan | null;
}

export interface MigrationOutput {
  cases: CaseDefinition[];
  plans: PlanDefinition[];
  runs: TestRun[];
  reports: ReportArtifact[];
  evidence: EvidenceBundleItem[];
  report: MigrationReport;
}

function legacyStepType(type: TestStep["type"]): "given" | "when" | "then" | "and" {
  const normalized = type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized === "dado") return "given";
  if (normalized === "quando") return "when";
  if (normalized === "entao") return "then";
  return "and";
}

function legacyPriority(priority: string): CasePriority {
  const normalized = priority.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["critical", "critica", "critico", "p0"].includes(normalized)) return "critical";
  if (["high", "alta", "alto", "p1"].includes(normalized)) return "high";
  if (["low", "baixa", "baixo", "p3"].includes(normalized)) return "low";
  return "medium";
}

function legacyStepStatus(status: TestStep["status"]): StepStatus {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked" || status === "paused") return "blocked";
  return "not_run";
}

function caseFingerprint(scenario: TestScenario): string {
  return JSON.stringify({
    title: scenario.title.trim().toLowerCase(),
    path: [scenario.suite, scenario.subsection].map((item) => item.trim().toLowerCase()),
    precondition: scenario.precondition.trim().toLowerCase(),
    steps: scenario.steps.map((step) => [
      legacyStepType(step.type),
      step.action.trim().toLowerCase(),
      step.expectedResult.trim().toLowerCase(),
    ]),
  });
}

function ensureExpectedResult(step: TestStep): string {
  const value = step.expectedResult?.trim();
  return value || `Validar o resultado esperado após: ${step.action.trim() || "executar o passo"}.`;
}

function hasExecutionData(plan: TestPlan): boolean {
  return plan.scenarios.some((scenario) =>
    scenario.status !== "untested" ||
    scenario.steps.some((step) =>
      step.status !== "untested" || Boolean(step.comment?.trim()) || Boolean(step.evidence),
    ),
  );
}

function uniquePlanId(candidate: string, usedIds: Set<string>): string {
  const preferred = candidate.trim() || createId("PLAN");
  if (!usedIds.has(preferred)) {
    usedIds.add(preferred);
    return preferred;
  }
  const generated = createId("PLAN");
  usedIds.add(generated);
  return generated;
}

export function migrateLegacyState(raw: unknown): MigrationOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const wrapper = raw as { state?: LegacyState };
  const state = wrapper.state ?? raw as LegacyState;
  const sourcePlans = Array.isArray(state.plans) ? state.plans : [];
  if (sourcePlans.length === 0) return null;

  const now = new Date().toISOString();
  const cases: CaseDefinition[] = [];
  const plans: PlanDefinition[] = [];
  const runs: TestRun[] = [];
  const reports: ReportArtifact[] = [];
  const evidence: EvidenceBundleItem[] = [];
  const warnings: string[] = [];
  let placeholderExpectedResults = 0;
  const caseByFingerprint = new Map<string, CaseDefinition>();
  const usedCaseIds = new Set<string>();
  const usedPlanIds = new Set<string>();
  const planIdMap = new Map<string, string>();

  for (const legacyPlan of sourcePlans) {
    const planCases: CaseDefinition[] = [];
    for (const scenario of legacyPlan.scenarios ?? []) {
      const fingerprint = caseFingerprint(scenario);
      let testCase = caseByFingerprint.get(fingerprint);
      if (!testCase) {
        const needsExpectedResultReview = (scenario.steps ?? []).some((step) => !step.expectedResult?.trim());
        placeholderExpectedResults += (scenario.steps ?? []).filter((step) => !step.expectedResult?.trim()).length;
        let caseId = scenario.caseId?.trim() || scenario.id?.trim() || createId("TC");
        if (usedCaseIds.has(caseId)) caseId = createId("TC");
        usedCaseIds.add(caseId);
        const createdAt = legacyPlan.createdAt || now;
        testCase = {
          schemaVersion: QA_FLOW_SCHEMA_VERSION,
          id: caseId,
          revision: 1,
          title: scenario.title?.trim() || "Caso sem título",
          path: normalizePath([scenario.suite ?? "", scenario.subsection ?? ""]),
          priority: legacyPriority(scenario.priority ?? "medium"),
          status: needsExpectedResultReview ? "draft" : "active",
          tags: normalizeTags([
            scenario.initialStatus ? `origem:${scenario.initialStatus}` : "",
            needsExpectedResultReview ? "migração:revisar-resultado-esperado" : "",
          ]),
          precondition: scenario.precondition?.trim() ?? "",
          steps: (scenario.steps ?? []).map((step) => ({
            id: step.id?.trim() || createId("STEP"),
            type: legacyStepType(step.type),
            action: step.action?.trim() || "Passo importado sem descrição",
            expectedResult: ensureExpectedResult(step),
          })),
          automationLinks: [],
          externalReferences: scenario.reference?.trim()
            ? [{ system: "legado", value: scenario.reference.trim() }]
            : [],
          createdAt,
          updatedAt: createdAt,
        };
        if (testCase.steps.length === 0) {
          testCase.steps.push({
            id: createId("STEP"),
            type: "when",
            action: "Executar o cenário importado",
            expectedResult: "O comportamento deve corresponder ao cenário original.",
          });
          warnings.push(`O caso ${testCase.id} não tinha passos; um passo de migração foi criado.`);
        }
        caseByFingerprint.set(fingerprint, testCase);
        cases.push(testCase);
      }
      planCases.push(testCase);
    }

    const planId = uniquePlanId(legacyPlan.id, usedPlanIds);
    planIdMap.set(legacyPlan.id, planId);
    const createdAt = legacyPlan.createdAt || now;
    const plan: PlanDefinition = {
      schemaVersion: QA_FLOW_SCHEMA_VERSION,
      id: planId,
      revision: 1,
      name: legacyPlan.name?.trim() || "Plano importado",
      description: legacyPlan.description?.trim() || "",
      objective: legacyPlan.description?.trim() || "Validar os casos selecionados.",
      project: legacyPlan.meta?.project?.trim() || "Projeto importado",
      status: "active",
      tags: normalizeTags([legacyPlan.meta?.section ? `seção:${legacyPlan.meta.section}` : ""]),
      caseRefs: planCases.map((testCase) => ({ caseId: testCase.id, caseRevision: testCase.revision })),
      createdBy: legacyPlan.meta?.createdBy?.trim() || "Migração v1",
      createdAt,
      updatedAt: createdAt,
    };
    plans.push(plan);

    const reportExists = (state.reports ?? []).some((report) => report.testPlanId === legacyPlan.id);
    if (!hasExecutionData(legacyPlan) && !reportExists && state.currentPlan?.id !== legacyPlan.id) continue;

    const runId = createId("RUN");
    const runStatus = legacyPlan.scenarios.some((scenario) =>
      scenario.status === "paused" || scenario.steps.some((step) => step.status === "paused"),
    ) ? "paused" : "completed";
    const run: TestRun = {
      schemaVersion: QA_FLOW_SCHEMA_VERSION,
      id: runId,
      attempt: 1,
      planId,
      planRevision: plan.revision,
      status: runStatus,
      context: {
        environment: "Não informado (migração)",
        build: "",
        platform: "",
        device: "",
        browser: "",
        tester: legacyPlan.meta?.createdBy?.trim() || "",
        notes: "Execução migrada do formato QA Flow v1.",
      },
      snapshot: { plan: cloneJson(plan), cases: cloneJson(planCases) },
      results: {},
      exploratoryRecords: [],
      startedAt: createdAt,
      updatedAt: now,
      finishedAt: runStatus === "completed" ? now : undefined,
    };

    legacyPlan.scenarios.forEach((scenario, scenarioIndex) => {
      const testCase = planCases[scenarioIndex];
      if (!testCase) return;
      scenario.steps.forEach((step, stepIndex) => {
        const snapshotStep = testCase.steps[stepIndex];
        if (!snapshotStep) return;
        const key = resultKey(testCase.id, snapshotStep.id);
        const status = legacyStepStatus(step.status);
        const evidenceIds: string[] = [];
        if (step.evidence) {
          const evidenceId = createId("EVD");
          evidenceIds.push(evidenceId);
          evidence.push({
            meta: {
              id: evidenceId,
              ownerType: "step",
              ownerId: key,
              runId,
              name: `evidencia-migrada-${testCase.id}-${stepIndex + 1}.png`,
              mimeType: step.evidence.match(/^data:([^;]+);/)?.[1] ?? "image/png",
              size: step.evidence.length,
              sha256: "legacy-unverified",
              createdAt: now,
            },
            dataUrl: step.evidence,
          });
        }
        run.results[key] = {
          status,
          actualResult: step.comment?.trim() || (step.status === "paused" ? "Passo estava pausado no formato anterior." : ""),
          evidenceIds,
          updatedAt: now,
        };
      });
    });
    runs.push(run);
  }

  for (const legacyReport of state.reports ?? []) {
    const planId = planIdMap.get(legacyReport.testPlanId);
    const run = runs.find((item) => item.planId === planId);
    if (!run) {
      warnings.push(`Relatório ${legacyReport.id} não foi migrado porque não havia execução vinculável.`);
      continue;
    }
    reports.push({
      id: legacyReport.id || createId("REPORT"),
      runId: run.id,
      title: `Relatório — ${run.snapshot.plan.name}`,
      notes: "Registro migrado do QA Flow v1.",
      createdAt: legacyReport.createdAt || now,
    });
  }

  if (placeholderExpectedResults > 0) {
    warnings.push(`${placeholderExpectedResults} resultado(s) esperado(s) vazio(s) receberam um marcador explícito; os casos ficaram como rascunho para revisão.`);
  }

  return {
    cases,
    plans,
    runs,
    reports,
    evidence,
    report: {
      source: "qaflow-v1",
      migratedAt: now,
      casesCreated: cases.length,
      plansCreated: plans.length,
      runsCreated: runs.length,
      warnings,
    },
  };
}
