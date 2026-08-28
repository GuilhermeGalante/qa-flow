import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultDemandColumns, demandMetrics, moveDemandToColumn } from "./demands.ts";
import type { QaDemand } from "./types.ts";

function demand(overrides: Partial<QaDemand> = {}): QaDemand {
  return {
    id: "DEM-1",
    title: "Validar fluxo",
    description: "",
    columnId: "COL-BACKLOG",
    order: 0,
    priority: "medium",
    assignee: "",
    tags: [],
    checklist: [],
    links: [],
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
    ...overrides,
  };
}

test("calcula abertas, bloqueadas, vencidas e concluídas na semana", () => {
  const columns = createDefaultDemandColumns("2026-08-24T10:00:00.000Z");
  const metrics = demandMetrics([
    demand({ id: "A", dueDate: "2026-08-20" }),
    demand({ id: "B", columnId: "COL-BLOCKED" }),
    demand({ id: "C", columnId: "COL-DONE", completedAt: "2026-08-25T10:00:00.000Z" }),
  ], columns, new Date("2026-08-27T12:00:00.000Z"));
  assert.deepEqual(metrics, { open: 2, blocked: 1, overdue: 1, completedThisWeek: 1 });
});

test("marca e desmarca conclusão ao trocar a semântica da coluna", () => {
  const columns = createDefaultDemandColumns();
  const done = columns.find((column) => column.semantic === "done")!;
  const backlog = columns[0];
  const completed = moveDemandToColumn(demand(), done, 0, "2026-08-27T12:00:00.000Z");
  assert.equal(completed.completedAt, "2026-08-27T12:00:00.000Z");
  assert.equal(moveDemandToColumn(completed, backlog, 0).completedAt, undefined);
});
