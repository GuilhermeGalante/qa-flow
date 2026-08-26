import type { RunStatus as LegacyRunStatus, TestPlan as LegacyTestPlan } from "../types/index.ts";
import type { TestRun } from "./types.ts";
import { deriveCaseStatus, resultKey } from "./validation.ts";

function legacyStatus(status: "not_run" | "passed" | "failed" | "blocked" | "skipped"): LegacyRunStatus {
  if (status === "passed" || status === "skipped") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  return "pending";
}

const legacyStepType = { given: "Dado", when: "Quando", then: "Então", and: "E" } as const;

export async function runToLegacyPlan(
  run: TestRun,
  getEvidenceData: (evidenceId: string) => Promise<string | null>,
): Promise<LegacyTestPlan> {
  const scenarios: LegacyTestPlan["scenarios"] = [];
  for (const testCase of run.snapshot.cases) {
    const steps: LegacyTestPlan["scenarios"][number]["steps"] = [];
    for (const step of testCase.steps) {
      const result = run.results[resultKey(testCase.id, step.id)];
      const evidenceId = result?.evidenceIds[0];
      steps.push({
        id: step.id,
        type: legacyStepType[step.type],
        action: step.action,
        expectedResult: step.expectedResult,
        status: legacyStatus(result?.status ?? "not_run"),
        comment: result?.actualResult,
        evidence: evidenceId ? (await getEvidenceData(evidenceId)) ?? undefined : undefined,
      });
    }
    scenarios.push({
      id: testCase.id,
      title: testCase.title,
      subsection: testCase.path.at(-1) ?? "",
      suite: testCase.path.slice(0, -1).join(" / "),
      initialStatus: "Snapshot v2",
      priority: testCase.priority,
      reference: testCase.externalReferences.map((reference) => reference.value).join(", "),
      caseId: testCase.id,
      precondition: testCase.precondition,
      status: legacyStatus(deriveCaseStatus(run, testCase)),
      steps,
    });
  }
  return {
    id: run.id,
    name: `${run.snapshot.plan.name} — tentativa ${run.attempt}`,
    description: run.context.notes,
    meta: {
      project: run.snapshot.plan.project,
      section: `${run.context.environment}${run.context.build ? ` · ${run.context.build}` : ""}`,
      createdBy: run.context.tester || run.snapshot.plan.createdBy,
      createdAt: run.startedAt,
    },
    scenarios,
    createdAt: run.startedAt,
  };
}

export function runCsvRows(run: TestRun): Record<string, string | number>[] {
  return run.snapshot.cases.flatMap((testCase) => testCase.steps.map((step, index) => {
    const result = run.results[resultKey(testCase.id, step.id)];
    return {
      Run: run.id,
      Tentativa: run.attempt,
      Plano: run.snapshot.plan.name,
      Ambiente: run.context.environment,
      Caso: testCase.id,
      Título: testCase.title,
      Passo: index + 1,
      Tipo: legacyStepType[step.type],
      Ação: step.action,
      "Resultado esperado": step.expectedResult,
      Status: result?.status ?? "not_run",
      "Resultado obtido": result?.actualResult ?? "",
      Evidências: result?.evidenceIds.length ?? 0,
    };
  }));
}
