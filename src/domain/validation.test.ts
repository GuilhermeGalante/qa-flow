import assert from "node:assert/strict";
import test from "node:test";
import { QA_FLOW_SCHEMA_VERSION, type CaseDefinition, type PlanDefinition, type TestRun } from "./types.ts";
import { cloneJson, deriveCaseStatus, resultKey, runProgress, validateCaseDefinition, validatePlanDefinition } from "./validation.ts";

const now = "2026-08-25T12:00:00.000Z";

function validCase(): CaseDefinition {
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "TC-LOGIN-001",
    revision: 1,
    title: "Login válido",
    path: ["Conta", "Login"],
    priority: "high",
    status: "active",
    tags: ["smoke"],
    precondition: "Usuário ativo",
    steps: [{ id: "STEP-1", type: "when", action: "Enviar credenciais", expectedResult: "A sessão é iniciada" }],
    automationLinks: [],
    externalReferences: [],
    createdAt: now,
    updatedAt: now,
  };
}

function validPlan(): PlanDefinition {
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "PLAN-SMOKE",
    revision: 1,
    name: "Smoke",
    description: "",
    objective: "Validar o caminho crítico",
    project: "QA Flow",
    status: "active",
    tags: ["smoke"],
    caseRefs: [{ caseId: "TC-LOGIN-001", caseRevision: 1 }],
    createdBy: "QA",
    createdAt: now,
    updatedAt: now,
  };
}

test("caso válido passa na validação", () => {
  assert.equal(validateCaseDefinition(validCase()).ok, true);
});

test("resultado esperado vazio é rejeitado com caminho preciso", () => {
  const candidate = validCase();
  candidate.steps[0].expectedResult = "";
  const result = validateCaseDefinition(candidate);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "steps[0].expectedResult"));
});

test("plano rejeita referências duplicadas", () => {
  const candidate = validPlan();
  candidate.caseRefs.push({ ...candidate.caseRefs[0] });
  const result = validatePlanDefinition(candidate);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.message.includes("duplicado")));
});

test("snapshot clonado não deriva da definição alterada depois", () => {
  const sourceCase = validCase();
  const snapshotCase = cloneJson(sourceCase);
  sourceCase.title = "Título alterado";
  assert.equal(snapshotCase.title, "Login válido");
});

test("progresso e status derivado usam a tentativa, não o caso", () => {
  const testCase = validCase();
  const plan = validPlan();
  const run: TestRun = {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "RUN-1",
    attempt: 1,
    planId: plan.id,
    planRevision: 1,
    status: "in_progress",
    context: { environment: "HML", build: "", platform: "Web", device: "", browser: "Chrome", tester: "QA", notes: "" },
    snapshot: { plan, cases: [testCase] },
    results: {
      [resultKey(testCase.id, testCase.steps[0].id)]: { status: "failed", actualResult: "HTTP 500", evidenceIds: [], updatedAt: now },
    },
    exploratoryRecords: [],
    startedAt: now,
    updatedAt: now,
  };
  assert.equal(deriveCaseStatus(run, testCase), "failed");
  assert.deepEqual(runProgress(run), { total: 1, executed: 1, percent: 100 });
});
