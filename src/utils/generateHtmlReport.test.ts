import assert from "node:assert/strict";
import test from "node:test";
import { buildHtmlReport } from "./generateHtmlReport.ts";
import type { PdfReportData } from "../domain/reporting.ts";
import { setActiveLocale } from "../i18n.ts";

const report: PdfReportData = {
  id: "RUN-HTML-1",
  attempt: 1,
  status: "completed",
  planName: "Regressão <Core>",
  planRevision: 2,
  objective: "Validar & documentar",
  description: "",
  project: "QA Flow",
  createdBy: "QA",
  startedAt: "2026-09-07T10:00:00.000Z",
  finishedAt: "2026-09-07T11:00:00.000Z",
  environment: "Homologação",
  build: "2.1.0",
  platform: "Web",
  device: "Desktop",
  browser: "Chrome",
  tester: "QA",
  notes: "",
  cases: [{
    id: "TC-1",
    title: "Login <válido>",
    path: "Autenticação",
    priority: "high",
    status: "failed",
    precondition: "Conta ativa",
    references: [],
    steps: [{
      id: "STEP-1",
      type: "Quando",
      action: "Entrar com e-mail & senha",
      expectedResult: "Acesso autorizado",
      status: "failed",
      actualResult: "Erro <500>",
      evidence: ["data:image/png;base64,AAA=", "data:image/svg+xml;base64,CCC=", "data:video/mp4;base64,BBB="],
    }],
  }],
};

test("HTML é autocontido, escapa conteúdo e oferece ampliação apenas para imagens", () => {
  const html = buildHtmlReport(report, "data:image/png;base64,LOGO=");

  assert.match(html, /<!doctype html>/);
  assert.match(html, /Regressão &lt;Core&gt;/);
  assert.match(html, /Entrar com e-mail &amp; senha/);
  assert.doesNotMatch(html, /Erro <500>/);
  assert.match(html, /id="image-viewer"/);
  assert.match(html, /class="evidence-button"/);
  assert.match(html, /data:image\/png;base64,AAA=/);
  assert.match(html, /Formato de imagem não compatível/);
  assert.doesNotMatch(html, /data:video\/mp4;base64,BBB=/);
  assert.match(html, /Somente com imagens/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Nenhum resultado encontrado/);
  assert.match(html, /Limpar busca e filtros/);
});

test("HTML acompanha o idioma ativo sem traduzir conteúdo do usuário", () => {
  try {
    setActiveLocale("en-US");
    const english = buildHtmlReport(report, "data:image/png;base64,LOGO=");
    assert.match(english, /<html lang="en-US">/);
    assert.match(english, /Interactive report/);
    assert.match(english, /Search cases, steps, or results/);
    assert.match(english, /Regressão &lt;Core&gt;/);

    setActiveLocale("es-ES");
    const spanish = buildHtmlReport(report, "data:image/png;base64,LOGO=");
    assert.match(spanish, /<html lang="es-ES">/);
    assert.match(spanish, /Informe interactivo/);
    assert.match(spanish, /Solo con imágenes/);
    assert.match(spanish, /Login &lt;válido&gt;/);
  } finally {
    setActiveLocale("pt-BR");
  }
});
