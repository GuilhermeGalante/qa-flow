import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type { TestPlan, RunStatus, Report } from "../types";
import { compressImageToBase64 } from "../utils/compressImage";

// ── Tipos da Store ────────────────────────────────────────────────────────────

interface TestStore {
  plans: TestPlan[];
  reports: Report[];
  currentPlan: TestPlan | null;
  isHydrated: boolean;

  // ── Ações sobre planos ──────────────────────────────────────────────────────
  /** Adiciona um plano à lista local. */
  addPlan: (plan: TestPlan) => Promise<void>;

  /** Define o plano ativo no runner. */
  setCurrentPlan: (plan: TestPlan) => Promise<void>;

  /** Remove um plano da lista. */
  removePlan: (planId: string) => Promise<void>;

  /** Cria um registro de relatório vinculado a um plano. */
  addReport: (report: Report) => Promise<void>;

  /** Remove um relatório da lista. */
  removeReport: (reportId: string) => Promise<void>;

  /** Exclui um relatório da lista. */
  deleteReport: (reportId: string) => Promise<void>;

  // ── Ações sobre steps ───────────────────────────────────────────────────────
  /** Atualiza status e comentário de um step localmente. */
  updateStepStatus: (
    scenarioId: string,
    stepId: string,
    status: RunStatus,
    comment?: string,
  ) => Promise<void>;

  /** Converte a evidência para Base64 PNG e salva diretamente no step. */
  updateStepEvidence: (
    scenarioId: string,
    stepId: string,
    file: File | Blob,
  ) => Promise<void>;

  /** Remove evidência de um step. */
  clearStepEvidence: (scenarioId: string, stepId: string) => Promise<void>;

  // ── Ações derivadas ─────────────────────────────────────────────────────────
  /** Recalcula o status do cenário a partir dos steps (chamado internamente). */
  updateScenarioStatus: (scenarioId: string) => void;

  /** Marca que a store terminou de reidratar do IndexedDB. */
  setHydrated: (value: boolean) => void;
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

function mergePlanIntoList(
  plans: TestPlan[],
  updatedPlan: TestPlan,
): TestPlan[] {
  const exists = plans.some((plan) => plan.id === updatedPlan.id);
  if (!exists) {
    return [...plans, updatedPlan];
  }

  return plans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan));
}

const indexedDbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await get<string>(name);
    return value ?? null;
  },
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTestStore = create<TestStore>()(
  persist(
    (set, get) => ({
      plans: [],
      reports: [],
      currentPlan: null,
      isHydrated: false,

      // ── Planos ──────────────────────────────────────────────────────────────

      addPlan: async (plan) => {
        set((state) => ({
          plans: mergePlanIntoList(state.plans, plan),
        }));
      },

      setCurrentPlan: async (plan) => {
        set((state) => ({
          currentPlan: plan,
          plans: mergePlanIntoList(state.plans, plan),
        }));
      },

      removePlan: async (planId) => {
        set((state) => ({
          plans: state.plans.filter((p) => p.id !== planId),
          reports: state.reports.filter(
            (report) => report.testPlanId !== planId,
          ),
          currentPlan:
            state.currentPlan?.id === planId ? null : state.currentPlan,
        }));
      },

      addReport: async (report) => {
        set((state) => ({ reports: [...state.reports, report] }));
      },

      removeReport: async (reportId) => {
        set((state) => ({
          reports: state.reports.filter((report) => report.id !== reportId),
        }));
      },

      deleteReport: async (reportId) => {
        set((state) => ({
          reports: state.reports.filter((report) => report.id !== reportId),
        }));
      },

      // ── Steps ───────────────────────────────────────────────────────────────

      updateStepStatus: async (scenarioId, stepId, status, comment) => {
        set((state) => {
          if (!state.currentPlan) return state;
          const updatedPlan = patchStep(state.currentPlan, scenarioId, stepId, {
            status,
            comment,
          });

          return {
            currentPlan: updatedPlan,
            plans: mergePlanIntoList(state.plans, updatedPlan),
          };
        });

        get().updateScenarioStatus(scenarioId);
      },

      updateStepEvidence: async (scenarioId, stepId, file) => {
        const base64 = await compressImageToBase64(file);

        set((state) => {
          if (!state.currentPlan) return state;
          const updatedPlan = patchStep(state.currentPlan, scenarioId, stepId, {
            evidence: base64,
          });

          return {
            currentPlan: updatedPlan,
            plans: mergePlanIntoList(state.plans, updatedPlan),
          };
        });
      },

      clearStepEvidence: async (scenarioId, stepId) => {
        set((state) => {
          if (!state.currentPlan) return state;
          const updatedPlan = patchStep(state.currentPlan, scenarioId, stepId, {
            evidence: undefined,
          });

          return {
            currentPlan: updatedPlan,
            plans: mergePlanIntoList(state.plans, updatedPlan),
          };
        });
      },

      // ── Derivados ───────────────────────────────────────────────────────────

      updateScenarioStatus: (scenarioId) => {
        set((state) => {
          if (!state.currentPlan) return state;

          const updatedScenarios = state.currentPlan.scenarios.map(
            (scenario) => {
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
            },
          );

          const updatedPlan = {
            ...state.currentPlan,
            scenarios: updatedScenarios,
          };

          return {
            currentPlan: updatedPlan,
            plans: mergePlanIntoList(state.plans, updatedPlan),
          };
        });
      },

      setHydrated: (value) => {
        set({ isHydrated: value });
      },
    }),
    {
      name: "qaflow-store",
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state) => ({
        plans: state.plans,
        reports: state.reports,
        currentPlan: state.currentPlan,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("Falha ao reidratar o estado do IndexedDB.", error);
        }

        state?.setHydrated(true);
      },
    },
  ),
);
