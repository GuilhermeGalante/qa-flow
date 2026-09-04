import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 2;
const CREATED_AT = "2026-08-25T12:00:00.000Z";
const UPDATED_AT = "2026-09-03T18:00:00.000Z";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "demo", "qa-flow-stitch-demo.json");

const catalog = [
  ["AUTH-001", "Login com credenciais válidas", "Autenticação & Cadastro", "critical", ["smoke", "auth"], true],
  ["AUTH-002", "Recuperação de senha com e-mail cadastrado", "Autenticação & Cadastro", "high", ["regressão", "auth"], true],
  ["AUTH-003", "Autenticação multifator por TOTP", "Autenticação & Cadastro", "critical", ["segurança", "mfa"], true],
  ["AUTH-004", "Bloqueio temporário após cinco tentativas inválidas", "Autenticação & Cadastro", "critical", ["segurança", "rate-limit"], false],
  ["AUTH-005", "Cadastro com consentimento LGPD", "Autenticação & Cadastro", "high", ["cadastro", "lgpd"], false],
  ["PAY-001", "Checkout transparente aprovado via Pix", "Checkout & Pagamentos", "critical", ["pix", "smoke"], true],
  ["PAY-002", "Recusa de cartão por saldo insuficiente", "Checkout & Pagamentos", "high", ["cartão", "negativo"], true],
  ["PAY-003", "Expiração do QR Code Pix", "Checkout & Pagamentos", "high", ["pix", "timeout"], true],
  ["PAY-004", "Aplicação de cupom com frete grátis", "Checkout & Pagamentos", "medium", ["cupom", "frete"], false],
  ["PAY-005", "Estorno parcial de pedido faturado", "Checkout & Pagamentos", "critical", ["estorno", "financeiro"], false],
  ["CAT-001", "Busca por produto com correção ortográfica", "Catálogo & Busca", "medium", ["busca", "web"], true],
  ["CAT-002", "Filtro combinado por categoria e faixa de preço", "Catálogo & Busca", "medium", ["filtro", "regressão"], true],
  ["CAT-003", "Produto indisponível não permite adicionar ao carrinho", "Catálogo & Busca", "high", ["estoque", "carrinho"], false],
  ["MOB-001", "Compra in-app com restauração de recibo Apple", "Mobile & Assinaturas", "critical", ["ios", "iap"], true],
  ["MOB-002", "Renovação de assinatura pela Play Store", "Mobile & Assinaturas", "critical", ["android", "assinatura"], true],
  ["MOB-003", "Deep link abre detalhe do pedido autenticado", "Mobile & Assinaturas", "high", ["deeplink", "mobile"], false],
  ["ACC-001", "Navegação completa por teclado no checkout", "Acessibilidade", "high", ["a11y", "web"], false],
  ["ACC-002", "Leitor de tela anuncia erros do formulário", "Acessibilidade", "high", ["a11y", "formulário"], false],
];

const cases = catalog.map(([suffix, title, folder, priority, tags, automated], index) => {
  const id = `TC-${suffix}`;
  const steps = [
    { id: `${id}-S1`, type: "given", action: "Preparar os dados e abrir a funcionalidade", expectedResult: "A tela inicial é exibida sem erros" },
    { id: `${id}-S2`, type: "when", action: `Executar o fluxo: ${String(title).toLocaleLowerCase("pt-BR")}`, expectedResult: "A ação é processada com feedback claro" },
    { id: `${id}-S3`, type: "then", action: "Validar o estado final e os registros gerados", expectedResult: "O resultado atende aos critérios de aceite" },
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    revision: index % 5 === 0 ? 2 : 1,
    title,
    description: `Cenário sintético para validar ${String(title).toLocaleLowerCase("pt-BR")}.`,
    path: [folder],
    priority,
    status: index === 17 ? "draft" : "active",
    tags,
    precondition: "Usuário de teste ativo e ambiente de homologação disponível.",
    steps,
    automationLinks: automated ? [{ framework: index % 2 ? "Playwright" : "Cypress", path: `tests/e2e/${String(suffix).toLocaleLowerCase()}.spec.ts`, testName: title }] : [],
    externalReferences: [{ system: "Jira", value: `QAF-${301 + index}` }],
    createdAt: new Date(Date.parse(CREATED_AT) + index * 3_600_000).toISOString(),
    updatedAt: new Date(Date.parse(UPDATED_AT) - index * 1_800_000).toISOString(),
  };
});

const planSeeds = [
  ["PLAN-REGRESSION-CORE", "Regressão Core & Autenticação", "Web Store", ["TC-AUTH-001", "TC-AUTH-002", "TC-AUTH-003", "TC-AUTH-004", "TC-ACC-001"]],
  ["PLAN-CHECKOUT-PIX", "Checkout Transparente & Pagamentos Pix", "Gateway Financeiro", ["TC-PAY-001", "TC-PAY-002", "TC-PAY-003", "TC-PAY-004", "TC-PAY-005"]],
  ["PLAN-MOBILE-IAP", "IAP 293 · Compra in-app e restauração", "Apps iOS / Android", ["TC-MOB-001", "TC-MOB-002", "TC-MOB-003"]],
  ["PLAN-CATALOG", "Catálogo, busca e disponibilidade", "Web Store", ["TC-CAT-001", "TC-CAT-002", "TC-CAT-003"]],
  ["PLAN-A11Y", "Auditoria de acessibilidade do checkout", "Experiência Web", ["TC-ACC-001", "TC-ACC-002", "TC-PAY-001"]],
];

const plans = planSeeds.map(([id, name, project, caseIds], index) => ({
  schemaVersion: SCHEMA_VERSION,
  id,
  revision: index === 0 ? 3 : index === 1 ? 2 : 1,
  name,
  description: "Plano sintético preparado para inspeção visual e exploração das telas do QA Flow.",
  objective: index === 0 ? "Validar os fluxos críticos antes da publicação em produção." : `Garantir a estabilidade de ${String(project).toLocaleLowerCase("pt-BR")}.`,
  project,
  status: index === 4 ? "draft" : "active",
  tags: index < 2 ? ["regressão", "release-2.1"] : ["homologação"],
  caseRefs: caseIds.map((caseId) => ({ caseId, caseRevision: cases.find((item) => item.id === caseId).revision })),
  createdBy: index % 2 ? "Bruno Lopes" : "Marina Costa",
  createdAt: new Date(Date.parse(CREATED_AT) + index * 86_400_000).toISOString(),
  updatedAt: new Date(Date.parse(UPDATED_AT) - index * 7_200_000).toISOString(),
}));

function createRun(id, planId, status, attempt, resultPattern, offsetHours, environment) {
  const plan = plans.find((item) => item.id === planId);
  const snapshotCases = plan.caseRefs.map((reference) => structuredClone(cases.find((item) => item.id === reference.caseId)));
  const results = {};
  let cursor = 0;
  for (const testCase of snapshotCases) {
    for (const step of testCase.steps) {
      const stepStatus = resultPattern[cursor % resultPattern.length];
      results[`${testCase.id}::${step.id}`] = {
        status: stepStatus,
        actualResult: stepStatus === "failed" ? "Resposta 500 ao confirmar a operação." : stepStatus === "blocked" ? "Dependência externa indisponível no ambiente." : "",
        evidenceIds: [],
        updatedAt: new Date(Date.parse(UPDATED_AT) - offsetHours * 3_600_000 + cursor * 60_000).toISOString(),
      };
      cursor += 1;
    }
  }
  const startedAt = new Date(Date.parse(UPDATED_AT) - (offsetHours + 1) * 3_600_000).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    attempt,
    planId,
    planRevision: plan.revision,
    status,
    context: { environment, build: "2.1.0-rc.4", platform: "Web", device: "Desktop 1440p", browser: "Chrome 140", tester: attempt % 2 ? "Marina Costa" : "Bruno Lopes", notes: "Execução sintética para validação visual." },
    snapshot: { plan: structuredClone(plan), cases: snapshotCases },
    results,
    exploratoryRecords: status === "completed" ? [] : [{ id: `${id}-EXP-1`, title: "Monitorar latência do gateway", notes: "Oscilação observada durante a preparação.", classification: "risk", severity: "medium", evidenceIds: [], createdAt: startedAt }],
    startedAt,
    updatedAt: new Date(Date.parse(UPDATED_AT) - offsetHours * 3_600_000).toISOString(),
    ...(status === "completed" || status === "aborted" ? { finishedAt: new Date(Date.parse(UPDATED_AT) - offsetHours * 3_600_000 + 2_400_000).toISOString() } : {}),
  };
}

const runs = [
  createRun("RUN-REGRESSION-CORE-003", "PLAN-REGRESSION-CORE", "in_progress", 3, ["passed", "passed", "not_run", "not_run"], 0, "Staging 01"),
  createRun("RUN-CHECKOUT-PIX-002", "PLAN-CHECKOUT-PIX", "completed", 2, ["passed"], 5, "Homologação"),
  createRun("RUN-MOBILE-IAP-001", "PLAN-MOBILE-IAP", "paused", 1, ["passed", "blocked", "not_run"], 9, "Device Farm"),
  createRun("RUN-CATALOG-004", "PLAN-CATALOG", "completed", 4, ["passed", "passed", "failed"], 26, "Staging 02"),
];

const columnNames = [
  ["COL-BACKLOG", "Backlog", "neutral"],
  ["COL-REFINEMENT", "Refinamento", "neutral"],
  ["COL-READY", "Pronto", "neutral"],
  ["COL-PROGRESS", "Em andamento", "active"],
  ["COL-BLOCKED", "Bloqueado", "blocked"],
  ["COL-VALIDATION", "Em validação", "active"],
  ["COL-DONE", "Concluído", "done"],
];
const demandColumns = columnNames.map(([id, name, semantic], order) => ({ id, name, semantic, order, createdAt: CREATED_AT, updatedAt: UPDATED_AT }));

const demandSeeds = [
  ["Mapear critérios de aceite do novo cadastro", "COL-BACKLOG", "high", "Marina Costa", ["cadastro", "discovery"]],
  ["Revisar contratos da API de catálogo", "COL-BACKLOG", "medium", "Lucas Lima", ["api", "contrato"]],
  ["Elaborar cenários Gherkin para MFA", "COL-REFINEMENT", "high", "Marina Costa", ["mfa", "gherkin"]],
  ["Preparar massa de cartões de teste", "COL-REFINEMENT", "medium", "Bruno Lopes", ["pagamentos"]],
  ["Validar checklist de publicação web", "COL-READY", "critical", "Aline Souza", ["release", "smoke"]],
  ["Executar regressão do checkout Pix", "COL-PROGRESS", "critical", "Bruno Lopes", ["pix", "regressão"]],
  ["Auditar navegação por teclado", "COL-PROGRESS", "high", "Marina Costa", ["a11y"]],
  ["Falha 500 ao confirmar estorno", "COL-BLOCKED", "critical", "Lucas Lima", ["bug", "financeiro"]],
  ["Aguardar credenciais do Device Farm", "COL-BLOCKED", "high", "Aline Souza", ["mobile", "infra"]],
  ["Validar evidências da regressão core", "COL-VALIDATION", "high", "Marina Costa", ["evidência"]],
  ["Homologar renovação Play Store", "COL-VALIDATION", "critical", "Bruno Lopes", ["android", "assinatura"]],
  ["Smoke de autenticação concluído", "COL-DONE", "critical", "Marina Costa", ["auth", "smoke"]],
  ["Cobertura da busca por produto", "COL-DONE", "medium", "Lucas Lima", ["busca"]],
  ["Revisar mensagens de erro do formulário", "COL-READY", "medium", "Aline Souza", ["ux", "a11y"]],
  ["Planejar regressão da release 2.1", "COL-BACKLOG", "high", "Bruno Lopes", ["release-2.1"]],
  ["Automatizar expiração do QR Code", "COL-PROGRESS", "high", "Lucas Lima", ["automação", "pix"]],
  ["Confirmar regra de estoque indisponível", "COL-REFINEMENT", "medium", "Aline Souza", ["estoque"]],
  ["Relatório executivo de homologação", "COL-DONE", "low", "Marina Costa", ["relatório"]],
];

const demands = demandSeeds.map(([title, columnId, priority, assignee, tags], index) => ({
  id: `DEM-${String(index + 1).padStart(3, "0")}`,
  title,
  description: "Item sintético criado para demonstrar densidade, filtros, estados e responsividade do quadro.",
  columnId,
  order: demandSeeds.slice(0, index).filter((item) => item[1] === columnId).length,
  priority,
  assignee,
  dueDate: index % 4 === 0 ? "2026-09-02" : index % 3 === 0 ? "2026-09-08" : undefined,
  tags,
  checklist: [
    { id: `DEM-${index + 1}-CHK-1`, label: "Critérios revisados", done: index % 2 === 0 },
    { id: `DEM-${index + 1}-CHK-2`, label: "Evidências anexadas", done: index % 3 === 0 },
  ],
  links: index < cases.length ? [{ type: "case", id: cases[index].id, label: cases[index].title }] : [],
  createdAt: new Date(Date.parse(CREATED_AT) + index * 2_700_000).toISOString(),
  updatedAt: new Date(Date.parse(UPDATED_AT) - index * 900_000).toISOString(),
  ...(columnId === "COL-DONE" ? { completedAt: new Date(Date.parse(UPDATED_AT) - index * 900_000).toISOString() } : {}),
}));

const bundle = {
  schemaVersion: SCHEMA_VERSION,
  exportedAt: UPDATED_AT,
  cases,
  plans,
  runs,
  reports: [{ id: "REPORT-HOMOLOGATION-001", runId: "RUN-CHECKOUT-PIX-002", title: "Homologação do checkout Pix", notes: "Relatório sintético para composição visual.", createdAt: UPDATED_AT }],
  demandColumns,
  demands,
  evidence: [],
  settings: { mode: "browser", name: "QA Flow · Demo Elera", repositoryPath: ".qaflow", compactEvidence: true },
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(`Massa de demonstração criada em ${output}`);
console.log(`${cases.length} casos · ${plans.length} planos · ${runs.length} execuções · ${demands.length} demandas`);
