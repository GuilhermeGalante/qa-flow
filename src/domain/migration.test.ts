import assert from "node:assert/strict";
import test from "node:test";
import { migrateLegacyState } from "./migration.ts";

const scenario = {
  id: "scenario-1",
  title: "Login válido",
  subsection: "Login",
  suite: "Conta",
  initialStatus: "Ready",
  priority: "Alta",
  reference: "REQ-1",
  caseId: "TC-1",
  precondition: "Usuário ativo",
  status: "passed",
  steps: [{ id: "step-1", type: "Dado", action: "Entrar", expectedResult: "", status: "passed", comment: "OK" }],
};

test("migração deduplica casos equivalentes entre planos e preserva tentativas", () => {
  const migrated = migrateLegacyState({ state: {
    plans: [
      { id: "P1", name: "Plano 1", description: "", meta: { project: "Produto", section: "", createdBy: "QA", createdAt: "2026-01-01T00:00:00.000Z" }, scenarios: [scenario], createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "P2", name: "Plano 2", description: "", meta: { project: "Produto", section: "", createdBy: "QA", createdAt: "2026-01-02T00:00:00.000Z" }, scenarios: [{ ...scenario, id: "scenario-2" }], createdAt: "2026-01-02T00:00:00.000Z" },
    ],
    reports: [],
    currentPlan: null,
  } });
  assert.ok(migrated);
  assert.equal(migrated.cases.length, 1);
  assert.equal(migrated.plans.length, 2);
  assert.equal(migrated.runs.length, 2);
  assert.match(migrated.cases[0].steps[0].expectedResult, /Validar o resultado esperado/);
  assert.equal(migrated.cases[0].status, "draft");
  assert.ok(migrated.report.warnings.some((warning) => warning.includes("resultado(s) esperado(s) vazio(s)")));
  assert.equal(migrated.runs[0].snapshot.cases[0].title, "Login válido");
});
