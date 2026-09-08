import {
  QA_FLOW_SCHEMA_VERSION,
  type CaseDefinition,
  type EvidenceMeta,
  type PlanDefinition,
  type RunContext,
  type WorkspaceBundle,
} from "../../src/domain/types.ts";
import { createEmptyWorkspaceData } from "../../src/platform/contracts/workspaceData.ts";

export const FIXED_NOW = "2026-09-08T12:00:00.000Z";

export function buildCase(overrides: Partial<CaseDefinition> = {}): CaseDefinition {
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "CASE-CHECKOUT",
    revision: 1,
    title: "Concluir checkout",
    description: "Fluxo crítico de compra",
    path: ["Checkout"],
    priority: "critical",
    status: "active",
    tags: ["smoke"],
    precondition: "Carrinho com um produto",
    steps: [
      { id: "STEP-CONFIRM", type: "when", action: "Confirmar pedido", expectedResult: "Pedido criado" },
      { id: "STEP-RECEIPT", type: "then", action: "Abrir comprovante", expectedResult: "Comprovante exibido" },
    ],
    automationLinks: [],
    externalReferences: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

export function buildPlan(overrides: Partial<PlanDefinition> = {}): PlanDefinition {
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: "PLAN-REGRESSION",
    revision: 1,
    name: "Regressão de checkout",
    description: "",
    objective: "Proteger o fluxo principal",
    project: "QA Flow",
    status: "active",
    tags: ["critical"],
    caseRefs: [{ caseId: "CASE-CHECKOUT", caseRevision: 1 }],
    createdBy: "QA",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

export function buildRunContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    environment: "Homologação",
    build: "2.2.1",
    platform: "Windows",
    device: "Desktop",
    browser: "WebView2",
    tester: "QA",
    notes: "",
    ...overrides,
  };
}

export function buildEvidence(overrides: Partial<EvidenceMeta> = {}): EvidenceMeta {
  return {
    id: "EVD-CHECKOUT",
    ownerType: "step",
    ownerId: "CASE-CHECKOUT::STEP-CONFIRM",
    runId: "RUN-CHECKOUT",
    name: "checkout.png",
    mimeType: "image/png",
    size: 4,
    sha256: "0".repeat(64),
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

export function buildBundle(overrides: Partial<WorkspaceBundle> = {}): WorkspaceBundle {
  const empty = createEmptyWorkspaceData(FIXED_NOW);
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    exportedAt: FIXED_NOW,
    cases: [],
    plans: [],
    runs: [],
    reports: [],
    demandColumns: empty.demandColumns,
    demands: [],
    evidence: [],
    settings: empty.settings,
    ...overrides,
  };
}

