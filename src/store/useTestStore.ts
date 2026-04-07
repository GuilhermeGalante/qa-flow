import { create } from "zustand";
import type { TestPlan, RunStatus, Report } from "../types";

// ── Tipos da Store ────────────────────────────────────────────────────────────

interface TestStore {
  plans: TestPlan[];
  reports: Report[];
  currentPlan: TestPlan | null;

  // ── Ações sobre planos ──────────────────────────────────────────────────────
  /** Adiciona um plano à lista. TODO: Add API call here (POST /plans) */
  addPlan: (plan: TestPlan) => Promise<void>;

  /** Define o plano ativo no runner. TODO: Add API call here (GET /plans/:id) */
  setCurrentPlan: (plan: TestPlan) => Promise<void>;

  /** Remove um plano da lista. TODO: Add API call here (DELETE /plans/:id) */
  removePlan: (planId: string) => Promise<void>;

  /** Cria um registro de relatório vinculado a um plano. TODO: Add API call here (POST /reports) */
  addReport: (report: Report) => Promise<void>;

  /** Remove um relatório da lista. TODO: Add API call here (DELETE /reports/:id) */
  removeReport: (reportId: string) => Promise<void>;

  // ── Ações sobre steps ───────────────────────────────────────────────────────
  /** Atualiza status e comentário de um step. TODO: Add API call here (PATCH /steps/:id) */
  updateStepStatus: (
    scenarioId: string,
    stepId: string,
    status: RunStatus,
    comment?: string,
  ) => Promise<void>;

  /** Salva evidência Base64 de um step. TODO: Add API call here (PUT /steps/:id/evidence) */
  updateStepEvidence: (
    scenarioId: string,
    stepId: string,
    evidence: string,
  ) => Promise<void>;

  /** Remove evidência de um step. TODO: Add API call here (DELETE /steps/:id/evidence) */
  clearStepEvidence: (scenarioId: string, stepId: string) => Promise<void>;

  // ── Ações derivadas ─────────────────────────────────────────────────────────
  /** Recalcula o status do cenário a partir dos steps (chamado internamente). */
  updateScenarioStatus: (scenarioId: string) => void;
}

// ── Helper imutável ───────────────────────────────────────────────────────────

/** Substitui campos de um step dentro do plano ativo sem mutar o estado. */
function patchStep(
  currentPlan: TestPlan,
  scenarioId: string,
  stepId: string,
  patch: Record<string, unknown>,
): TestPlan {
  return {
    ...currentPlan,
    scenarios: currentPlan.scenarios.map((scenario) => {
      if (scenario.id !== scenarioId) return scenario;
      return {
        ...scenario,
        steps: scenario.steps.map((step) =>
          step.id === stepId ? { ...step, ...patch } : step,
        ),
      };
    }),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTestStore = create<TestStore>((set, get) => ({
  plans: [],
  reports: [],
  currentPlan: null,

  // ── Planos ──────────────────────────────────────────────────────────────────

  addPlan: async (plan) => {
    // TODO: Add API call here (POST /plans)
    set((state) => ({ plans: [...state.plans, plan] }));
  },

  setCurrentPlan: async (plan) => {
    // TODO: Add API call here (GET /plans/:id) para buscar dados frescos
    set({ currentPlan: plan });
  },

  removePlan: async (planId) => {
    // TODO: Add API call here (DELETE /plans/:id)
    set((state) => ({
      plans: state.plans.filter((p) => p.id !== planId),
      reports: state.reports.filter((report) => report.testPlanId !== planId),
      currentPlan: state.currentPlan?.id === planId ? null : state.currentPlan,
    }));
  },

  addReport: async (report) => {
    // TODO: Add API call here (POST /reports)
    set((state) => ({ reports: [...state.reports, report] }));
  },

  removeReport: async (reportId) => {
    // TODO: Add API call here (DELETE /reports/:id)
    set((state) => ({
      reports: state.reports.filter((report) => report.id !== reportId),
    }));
  },

  // ── Steps ────────────────────────────────────────────────────────────────────

  updateStepStatus: async (scenarioId, stepId, status, comment) => {
    // TODO: Add API call here (PATCH /steps/:id  { status, comment })
    set((state) => {
      if (!state.currentPlan) return state;
      return {
        currentPlan: patchStep(state.currentPlan, scenarioId, stepId, {
          status,
          comment,
        }),
      };
    });
    get().updateScenarioStatus(scenarioId);
  },

  updateStepEvidence: async (scenarioId, stepId, evidence) => {
    // TODO: Add API call here (PUT /steps/:id/evidence  { evidence })
    set((state) => {
      if (!state.currentPlan) return state;
      return {
        currentPlan: patchStep(state.currentPlan, scenarioId, stepId, {
          evidence,
        }),
      };
    });
  },

  clearStepEvidence: async (scenarioId, stepId) => {
    // TODO: Add API call here (DELETE /steps/:id/evidence)
    set((state) => {
      if (!state.currentPlan) return state;
      return {
        currentPlan: patchStep(state.currentPlan, scenarioId, stepId, {
          evidence: undefined,
        }),
      };
    });
  },

  // ── Derivados ────────────────────────────────────────────────────────────────

  updateScenarioStatus: (scenarioId) => {
    set((state) => {
      if (!state.currentPlan) return state;

      const updatedScenarios = state.currentPlan.scenarios.map((scenario) => {
        if (scenario.id !== scenarioId) return scenario;

        const steps = scenario.steps;
        const anyFailed = steps.some((s) => s.status === "failed");
        const anyBlocked = steps.some((s) => s.status === "blocked");
        const anyPaused = steps.some((s) => s.status === "paused");
        const allPassed =
          steps.length > 0 && steps.every((s) => s.status === "passed");
        const allUntested = steps.every((s) => s.status === "untested");

        let newStatus: RunStatus = "pending";
        if (allUntested) newStatus = "untested";
        else if (anyFailed) newStatus = "failed";
        else if (anyBlocked) newStatus = "blocked";
        else if (anyPaused) newStatus = "paused";
        else if (allPassed) newStatus = "passed";

        return { ...scenario, status: newStatus };
      });

      // Sincroniza também o plano na lista de planos
      const updatedPlan = { ...state.currentPlan, scenarios: updatedScenarios };
      return {
        currentPlan: updatedPlan,
        plans: state.plans.map((p) =>
          p.id === updatedPlan.id ? updatedPlan : p,
        ),
      };
    });
  },
}));
