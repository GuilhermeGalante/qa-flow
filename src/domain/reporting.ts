import type { CasePriority, RunStatus, StepStatus, TestRun } from "./types.ts";
import { deriveCaseStatus, resultKey } from "./validation.ts";

export interface PdfReportStep {
  id: string;
  type: "Dado" | "Quando" | "Então" | "E";
  action: string;
  expectedResult: string;
  status: StepStatus;
  actualResult: string;
  evidence: string[];
}

export interface PdfReportCase {
  id: string;
  title: string;
  path: string;
  priority: CasePriority;
  status: StepStatus;
  precondition: string;
  references: string[];
  steps: PdfReportStep[];
}

export interface PdfReportData {
  id: string;
  attempt: number;
  status: RunStatus;
  planName: string;
  planRevision: number;
  objective: string;
  description: string;
  project: string;
  createdBy: string;
  startedAt: string;
  finishedAt?: string;
  environment: string;
  build: string;
  platform: string;
  device: string;
  browser: string;
  tester: string;
  notes: string;
  cases: PdfReportCase[];
}

export function isImageDataSource(source: string): boolean {
  return /^data:image\//i.test(source);
}

export function isRasterImageSource(source: string): boolean {
  return /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,[a-z0-9+/=\s]+$/i.test(source);
}

const legacyStepType = { given: "Dado", when: "Quando", then: "Então", and: "E" } as const;

export async function runToPdfReportData(
  run: TestRun,
  getEvidenceData: (evidenceId: string) => Promise<string | null>,
): Promise<PdfReportData> {
  const cases: PdfReportCase[] = [];
  for (const testCase of run.snapshot.cases) {
    const steps: PdfReportStep[] = [];
    for (const step of testCase.steps) {
      const result = run.results[resultKey(testCase.id, step.id)];
      const evidence = (await Promise.all(
        (result?.evidenceIds ?? []).map((evidenceId) => getEvidenceData(evidenceId)),
      )).filter((item): item is string => item !== null);
      steps.push({
        id: step.id,
        type: legacyStepType[step.type],
        action: step.action,
        expectedResult: step.expectedResult,
        status: result?.status ?? "not_run",
        actualResult: result?.actualResult ?? "",
        evidence,
      });
    }
    cases.push({
      id: testCase.id,
      title: testCase.title,
      path: testCase.path.join(" / "),
      priority: testCase.priority,
      status: deriveCaseStatus(run, testCase),
      precondition: testCase.precondition,
      references: testCase.externalReferences.map((reference) => (
        reference.url ? `${reference.system}: ${reference.value} (${reference.url})` : `${reference.system}: ${reference.value}`
      )),
      steps,
    });
  }
  return {
    id: run.id,
    attempt: run.attempt,
    status: run.status,
    planName: run.snapshot.plan.name,
    planRevision: run.planRevision,
    objective: run.snapshot.plan.objective,
    description: run.context.notes,
    project: run.snapshot.plan.project,
    createdBy: run.snapshot.plan.createdBy,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    environment: run.context.environment,
    build: run.context.build,
    platform: run.context.platform,
    device: run.context.device,
    browser: run.context.browser,
    tester: run.context.tester || run.snapshot.plan.createdBy,
    notes: run.context.notes,
    cases,
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
