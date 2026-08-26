import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvCases } from "./importers.ts";
import { validateCaseDefinition } from "./validation.ts";

test("CSV agrupa linhas de continuação no mesmo caso", () => {
  const result = parseCsvCases([
    { Project: "Produto", Suite: "Login", Title: "Entrar", Action: "Preencher usuário", "Expected result": "Usuário preenchido" },
    { Action: "Confirmar", "Expected result": "Sessão iniciada" },
    { Project: "Produto", Suite: "Login", Title: "Senha inválida", Action: "Enviar senha errada", "Expected result": "Erro exibido" },
  ], "2026-08-25T12:00:00.000Z");
  assert.equal(result.length, 2);
  assert.equal(result[0].steps.length, 2);
  assert.equal(result[1].steps.length, 1);
  assert.equal(validateCaseDefinition(result[0]).ok, true);
});

test("CSV não inventa resultado esperado ausente", () => {
  const [candidate] = parseCsvCases([{ Title: "Caso incompleto", Action: "Executar" }]);
  assert.equal(candidate.steps[0].expectedResult, "");
  assert.equal(validateCaseDefinition(candidate).ok, false);
});
