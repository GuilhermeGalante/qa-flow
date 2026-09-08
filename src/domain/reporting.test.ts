import assert from "node:assert/strict";
import test from "node:test";
import { runToPdfReportData } from "./reporting.ts";
import type { TestRun } from "./types.ts";
import { QA_FLOW_SCHEMA_VERSION } from "./types.ts";

test("modelo de PDF preserva status ignorado e materializa todas as evidências disponíveis", async () => {
  const run: TestRun = {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "RUN-1",
    attempt: 2,
    planId: "PLAN-1",
    planRevision: 3,
    status: "completed",
    context: {
      environment: "Homologação",
      build: "rc.1",
      platform: "Web",
      device: "Desktop",
      browser: "Firefox",
      tester: "QA",
      notes: "",
    },
    snapshot: {
      plan: {
        schemaVersion: QA_FLOW_SCHEMA_VERSION,
        id: "PLAN-1",
        revision: 3,
        name: "Regressão",
        description: "",
        objective: "Validar o fluxo principal.",
        project: "Produto",
        status: "active",
        tags: [],
        caseRefs: [{ caseId: "TC-1", caseRevision: 1 }],
        createdBy: "QA",
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
      cases: [{
        schemaVersion: QA_FLOW_SCHEMA_VERSION,
        id: "TC-1",
        revision: 1,
        title: "Fluxo ignorado",
        path: ["Regressão"],
        priority: "medium",
        status: "active",
        tags: [],
        precondition: "Conta ativa.",
        steps: [{ id: "STEP-1", type: "given", action: "abrir o fluxo", expectedResult: "fluxo disponível" }],
        automationLinks: [],
        externalReferences: [],
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      }],
    },
    results: {
      "TC-1::STEP-1": {
        status: "skipped",
        actualResult: "Fora do escopo desta rodada.",
        evidenceIds: ["EVID-1", "EVID-2"],
        updatedAt: "2026-09-01T11:00:00.000Z",
      },
    },
    exploratoryRecords: [],
    startedAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T11:00:00.000Z",
    finishedAt: "2026-09-01T11:00:00.000Z",
  };

  const report = await runToPdfReportData(run, async (evidenceId) => (
    evidenceId === "EVID-1" ? "data:image/png;base64,AAA=" : null
  ));

  assert.equal(report.cases[0].status, "skipped");
  assert.equal(report.cases[0].steps[0].status, "skipped");
  assert.equal(report.cases[0].steps[0].actualResult, "Fora do escopo desta rodada.");
  assert.deepEqual(report.cases[0].steps[0].evidence, ["data:image/png;base64,AAA="]);
});
