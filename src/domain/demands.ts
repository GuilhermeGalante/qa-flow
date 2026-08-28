import type { DemandColumn, QaDemand } from "./types";

const columnSeed: Array<Pick<DemandColumn, "id" | "name" | "semantic">> = [
  { id: "COL-BACKLOG", name: "Backlog", semantic: "neutral" },
  { id: "COL-REFINEMENT", name: "Refinamento", semantic: "neutral" },
  { id: "COL-READY", name: "Pronto", semantic: "neutral" },
  { id: "COL-PROGRESS", name: "Em andamento", semantic: "active" },
  { id: "COL-BLOCKED", name: "Bloqueado", semantic: "blocked" },
  { id: "COL-VALIDATION", name: "Em validação", semantic: "active" },
  { id: "COL-DONE", name: "Concluído", semantic: "done" },
];

export function createDefaultDemandColumns(now = new Date().toISOString()): DemandColumn[] {
  return columnSeed.map((column, order) => ({ ...column, order, createdAt: now, updatedAt: now }));
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfLocalWeek(now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const distanceFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - distanceFromMonday);
  return start;
}

export function demandMetrics(demands: QaDemand[], columns: DemandColumn[], now = new Date()) {
  const semantics = new Map(columns.map((column) => [column.id, column.semantic]));
  const today = localDateKey(now);
  const weekStart = startOfLocalWeek(now).getTime();
  return demands.reduce((metrics, demand) => {
    const semantic = semantics.get(demand.columnId) ?? "neutral";
    if (semantic !== "done") metrics.open += 1;
    if (semantic === "blocked") metrics.blocked += 1;
    if (semantic !== "done" && demand.dueDate && demand.dueDate < today) metrics.overdue += 1;
    if (semantic === "done" && demand.completedAt && new Date(demand.completedAt).getTime() >= weekStart) {
      metrics.completedThisWeek += 1;
    }
    return metrics;
  }, { open: 0, blocked: 0, overdue: 0, completedThisWeek: 0 });
}

export function moveDemandToColumn(demand: QaDemand, column: DemandColumn, order: number, now = new Date().toISOString()): QaDemand {
  const wasDone = Boolean(demand.completedAt);
  return {
    ...demand,
    columnId: column.id,
    order,
    updatedAt: now,
    completedAt: column.semantic === "done" ? (wasDone ? demand.completedAt : now) : undefined,
  };
}
