import { createDefaultDemandColumns } from "../../domain/demands.ts";
import type {
  CaseDefinition,
  DemandColumn,
  PlanDefinition,
  QaDemand,
  ReportArtifact,
  TestRun,
  WorkspaceSettings,
} from "../../domain/types";
import { cloneJson } from "../../domain/validation.ts";
import { desktopError } from "./errors.ts";
import type { StorageMutation, WorkspaceData } from "./dtos";

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  mode: "browser",
  name: "Meu workspace",
  repositoryPath: ".qaflow",
  compactEvidence: true,
};

export function createEmptyWorkspaceData(now?: string): WorkspaceData {
  return {
    cases: [],
    plans: [],
    runs: [],
    reports: [],
    evidence: [],
    demandColumns: createDefaultDemandColumns(now),
    demands: [],
    settings: { ...DEFAULT_WORKSPACE_SETTINGS },
    migrationReport: null,
  };
}

export function cloneWorkspaceData(workspace: WorkspaceData): WorkspaceData {
  return cloneJson(workspace);
}

function requirePayload<T extends { id: string }>(mutation: StorageMutation): T {
  if (!mutation.payload || typeof mutation.payload !== "object") {
    throw desktopError("VALIDATION", `A mutação ${mutation.kind}/${mutation.action} exige payload.`, {
      retryable: false,
    });
  }
  const payload = mutation.payload as T;
  if (payload.id !== mutation.id) {
    throw desktopError("VALIDATION", "O ID do payload não corresponde ao envelope da mutação.", {
      retryable: false,
    });
  }
  return payload;
}

function upsert<T extends { id: string }>(items: T[], value: T, prepend = false): T[] {
  const existing = items.some((item) => item.id === value.id);
  return existing
    ? items.map((item) => item.id === value.id ? value : item)
    : prepend ? [value, ...items] : [...items, value];
}

function remove<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export function applyStorageMutations(workspace: WorkspaceData, mutations: StorageMutation[]): WorkspaceData {
  const next = cloneWorkspaceData(workspace);

  for (const mutation of mutations) {
    if (mutation.kind === "settings") {
      if (mutation.action === "delete") {
        throw desktopError("VALIDATION", "As configurações do workspace não podem ser excluídas.");
      }
      next.settings = cloneJson(mutation.payload as WorkspaceSettings);
      continue;
    }

    if (mutation.kind === "case") {
      next.cases = mutation.action === "delete"
        ? remove(next.cases, mutation.id)
        : upsert(next.cases, cloneJson(requirePayload<CaseDefinition>(mutation)));
      continue;
    }
    if (mutation.kind === "plan") {
      next.plans = mutation.action === "delete"
        ? remove(next.plans, mutation.id)
        : upsert(next.plans, cloneJson(requirePayload<PlanDefinition>(mutation)));
      continue;
    }
    if (mutation.kind === "run") {
      next.runs = mutation.action === "delete"
        ? remove(next.runs, mutation.id)
        : upsert(next.runs, cloneJson(requirePayload<TestRun>(mutation)), true);
      continue;
    }
    if (mutation.kind === "report") {
      next.reports = mutation.action === "delete"
        ? remove(next.reports, mutation.id)
        : upsert(next.reports, cloneJson(requirePayload<ReportArtifact>(mutation)), true);
      continue;
    }
    if (mutation.kind === "demandColumn") {
      next.demandColumns = mutation.action === "delete"
        ? remove(next.demandColumns, mutation.id)
        : upsert(next.demandColumns, cloneJson(requirePayload<DemandColumn>(mutation)));
      continue;
    }
    if (mutation.kind === "demand") {
      next.demands = mutation.action === "delete"
        ? remove(next.demands, mutation.id)
        : upsert(next.demands, cloneJson(requirePayload<QaDemand>(mutation)));
    }
  }

  return next;
}
