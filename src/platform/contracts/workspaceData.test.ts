import assert from "node:assert/strict";
import test from "node:test";
import { buildCase } from "../../../tests/helpers/domainBuilders.ts";
import { applyStorageMutations, createEmptyWorkspaceData } from "./workspaceData.ts";

test("mutações produzem novo workspace sem compartilhar entidades com a entrada", () => {
  const original = createEmptyWorkspaceData();
  const candidate = buildCase();

  const next = applyStorageMutations(original, [
    { kind: "case", action: "upsert", id: candidate.id, payload: candidate },
    {
      kind: "settings",
      action: "upsert",
      id: "workspace",
      payload: { ...original.settings, name: "Workspace integrado" },
    },
  ]);

  assert.deepEqual(original.cases, []);
  assert.equal(original.settings.name, "Meu workspace");
  assert.equal(next.cases[0].title, candidate.title);
  assert.equal(next.settings.name, "Workspace integrado");

  next.cases[0].title = "Mutado depois";
  assert.equal(candidate.title, "Concluir checkout");
});

test("falha em qualquer mutação não altera o workspace de entrada", () => {
  const original = createEmptyWorkspaceData();
  const candidate = buildCase();

  assert.throws(() => applyStorageMutations(original, [
    { kind: "case", action: "upsert", id: candidate.id, payload: candidate },
    { kind: "case", action: "upsert", id: "CASE-DIVERGENT", payload: candidate },
  ]), (error: unknown) => (error as { code?: string }).code === "VALIDATION");

  assert.deepEqual(original.cases, []);
});

test("configurações do workspace não podem ser excluídas", () => {
  assert.throws(() => applyStorageMutations(createEmptyWorkspaceData(), [
    { kind: "settings", action: "delete", id: "workspace" },
  ]), (error: unknown) => (error as { code?: string }).code === "VALIDATION");
});

