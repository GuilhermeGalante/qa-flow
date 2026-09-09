import assert from "node:assert/strict";
import test from "node:test";
import { getActiveLocale, hasTranslation, normalizeUiLocale, setActiveLocale, tr } from "./i18n.ts";

test("normaliza idiomas suportados e preserva português como fallback", () => {
  assert.equal(normalizeUiLocale("en-GB"), "en-US");
  assert.equal(normalizeUiLocale("es-MX"), "es-ES");
  assert.equal(normalizeUiLocale("fr-FR"), "pt-BR");
  assert.equal(normalizeUiLocale(undefined, "en-CA"), "en-US");
});

test("traduz mensagens estáticas e dinâmicas sem alterar texto desconhecido", () => {
  setActiveLocale("en-US");
  assert.equal(tr("Casos de Teste"), "Test Cases");
  assert.equal(tr("Ação do passo 3"), "Action for step 3");
  assert.equal(tr("4 execução(ões) concluída(s)"), "4 completed test run(s)");
  assert.equal(tr("Mover Plano principal para cima"), "Move Plano principal up");
  assert.equal(tr("Nome criado pelo usuário"), "Nome criado pelo usuário");

  setActiveLocale("es-ES");
  assert.equal(tr("Salvar caso"), "Guardar caso");
  assert.equal(tr("  Cancelar  "), "  Cancelar  ");
  assert.equal(hasTranslation("Visão geral"), true);

  setActiveLocale("pt-BR");
  assert.equal(getActiveLocale(), "pt-BR");
});
