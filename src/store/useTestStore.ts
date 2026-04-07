import { create } from 'zustand';
import type { TestPlan, RunStatus } from '../types';

interface TestStore {
  plans: TestPlan[];
  currentPlan: TestPlan | null;
  addPlan: (plan: TestPlan) => void;
  setCurrentPlan: (plan: TestPlan) => void;
  updateStepStatus: (
    scenarioId: string,
    stepId: string,
    status: RunStatus,
    comment?: string,
  ) => void;
  updateStepEvidence: (scenarioId: string, stepId: string, evidence: string) => void;
  clearStepEvidence: (scenarioId: string, stepId: string) => void;
  updateScenarioStatus: (scenarioId: string) => void;
}

/** Helper imutável: substitui um step dentro de um cenário */
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

export const useTestStore = create<TestStore>((set, get) => ({
  plans: [],
  currentPlan: null,

  addPlan: (plan) => set((state) => ({ plans: [...state.plans, plan] })),

  setCurrentPlan: (plan) => set({ currentPlan: plan }),

  updateStepStatus: (scenarioId, stepId, status, comment) => {
    set((state) => {
      if (!state.currentPlan) return state;
      return { currentPlan: patchStep(state.currentPlan, scenarioId, stepId, { status, comment }) };
    });
    get().updateScenarioStatus(scenarioId);
  },

  /** Salva o Base64 da evidência num passo */
  updateStepEvidence: (scenarioId, stepId, evidence) => {
    set((state) => {
      if (!state.currentPlan) return state;
      return { currentPlan: patchStep(state.currentPlan, scenarioId, stepId, { evidence }) };
    });
  },

  /** Remove a evidência de um passo */
  clearStepEvidence: (scenarioId, stepId) => {
    set((state) => {
      if (!state.currentPlan) return state;
      return {
        currentPlan: patchStep(state.currentPlan, scenarioId, stepId, { evidence: undefined }),
      };
    });
  },

  updateScenarioStatus: (scenarioId) => {
    set((state) => {
      if (!state.currentPlan) return state;

      const updatedScenarios = state.currentPlan.scenarios.map((scenario) => {
        if (scenario.id !== scenarioId) return scenario;

        const steps = scenario.steps;
        const anyFailed  = steps.some((s) => s.status === 'failed');
        const anyBlocked = steps.some((s) => s.status === 'blocked');
        const allPassed  = steps.length > 0 && steps.every((s) => s.status === 'passed');

        let newStatus: RunStatus = 'pending';
        if (anyFailed)       newStatus = 'failed';
        else if (anyBlocked) newStatus = 'blocked';
        else if (allPassed)  newStatus = 'passed';

        return { ...scenario, status: newStatus };
      });

      return { currentPlan: { ...state.currentPlan, scenarios: updatedScenarios } };
    });
  },
}));
