import type { ApplicationResult } from "../app/commitCoordinator";
import { isImageDataSource, isRasterImageSource } from "../domain/reporting.ts";
import type { PdfReportData } from "../domain/reporting";
import type { OperationResult, StepStatus } from "../domain/types";
import type { GeneratedFileRequest, TransferResult } from "../platform/contracts/dtos";

type GeneratedFileSaver = (
  request: GeneratedFileRequest,
  bytes: Uint8Array,
) => Promise<ApplicationResult<TransferResult>>;

const STATUS_ORDER: StepStatus[] = ["passed", "failed", "blocked", "skipped", "not_run"];

const STATUS_LABEL: Record<StepStatus, string> = {
  passed: "Aprovado",
  failed: "Reprovado",
  blocked: "Bloqueado",
  skipped: "Ignorado",
  not_run: "Não executado",
};

const RUN_STATUS_LABEL: Record<PdfReportData["status"], string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  aborted: "Abortada",
};

const PRIORITY_LABEL: Record<PdfReportData["cases"][number]["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "Tentativa";
}

function formatDate(value?: string): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
}

function metaItem(label: string, value: string): string {
  return `<div class="meta-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "Não informado")}</dd></div>`;
}

function evidenceMarkup(source: string, index: number, caseId: string, stepIndex: number): string {
  const caption = `Evidência ${index + 1} · ${caseId} · passo ${stepIndex + 1}`;
  if (!isImageDataSource(source)) return "";
  if (!isRasterImageSource(source)) return `<div class="evidence-unsupported" role="note"><strong>${escapeHtml(caption)}</strong><span>Formato de imagem não compatível com a visualização incorporada.</span></div>`;
  return `<button class="evidence-button" type="button" aria-label="Ampliar ${escapeHtml(caption)}">
    <img src="${source}" alt="${escapeHtml(caption)}" loading="lazy">
    <span>${escapeHtml(caption)}<strong>Ver imagem</strong></span>
  </button>`;
}

export function buildHtmlReport(report: PdfReportData, logoSrc: string): string {
  const counts = STATUS_ORDER.reduce<Record<StepStatus, number>>((result, status) => {
    result[status] = report.cases.filter((item) => item.status === status).length;
    return result;
  }, { passed: 0, failed: 0, blocked: 0, skipped: 0, not_run: 0 });
  const imageCount = report.cases.reduce((caseTotal, testCase) => (
    caseTotal + testCase.steps.reduce((stepTotal, step) => (
      stepTotal + step.evidence.filter(isImageDataSource).length
    ), 0)
  ), 0);
  const cases = report.cases.map((testCase) => {
    const caseImages = testCase.steps.reduce((total, step) => total + step.evidence.filter(isImageDataSource).length, 0);
    const searchable = [testCase.id, testCase.title, testCase.path, testCase.precondition, ...testCase.steps.flatMap((step) => [step.action, step.expectedResult, step.actualResult])].join(" ").toLocaleLowerCase("pt-BR");
    const steps = testCase.steps.map((step, stepIndex) => {
      const images = step.evidence.map((source, index) => evidenceMarkup(source, index, testCase.id, stepIndex)).join("");
      return `<section class="step">
        <header class="step-header"><span>Passo ${stepIndex + 1} · ${escapeHtml(step.type)}</span><span class="status status-${step.status}">${escapeHtml(STATUS_LABEL[step.status])}</span></header>
        <div class="step-grid">
          <div><h4>Ação</h4><p>${escapeHtml(step.action)}</p></div>
          <div><h4>Resultado esperado</h4><p>${escapeHtml(step.expectedResult)}</p></div>
        </div>
        ${step.actualResult ? `<div class="actual actual-${step.status}"><h4>Resultado obtido / observação</h4><p>${escapeHtml(step.actualResult)}</p></div>` : ""}
        ${images ? `<div class="evidence-gallery">${images}</div>` : ""}
      </section>`;
    }).join("");
    return `<article class="case" data-status="${testCase.status}" data-images="${caseImages}" data-search="${escapeHtml(searchable)}">
      <header class="case-header">
        <div><p class="case-id">${escapeHtml(testCase.id)}</p><h3>${escapeHtml(testCase.title)}</h3></div>
        <span class="status status-${testCase.status}">${escapeHtml(STATUS_LABEL[testCase.status])}</span>
      </header>
      <dl class="case-meta">
        ${metaItem("Prioridade", PRIORITY_LABEL[testCase.priority])}
        ${metaItem("Caminho", testCase.path)}
        ${metaItem("Pré-condição", testCase.precondition)}
        ${metaItem("Imagens", String(caseImages))}
      </dl>
      ${testCase.references.length ? `<p class="references"><strong>Referências:</strong> ${escapeHtml(testCase.references.join(" · "))}</p>` : ""}
      ${steps || '<p class="empty">Nenhum passo cadastrado.</p>'}
    </article>`;
  }).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>Relatório QA Flow · ${escapeHtml(report.planName)}</title>
  <style>
    :root{color-scheme:light;--ink:#101828;--body:#344054;--muted:#667085;--line:#d0d5dd;--shell:#f2f4f7;--cyan:#0891b2;--cyan-soft:#ecfeff;--success:#067647;--success-soft:#ecfdf3;--danger:#b42318;--danger-soft:#fef3f2;--warning:#b54708;--warning-soft:#fffaeb;--violet:#6941c6;--violet-soft:#f4f3ff;--focus:#06b6d4}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#e9edf2;color:var(--body);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55}::selection{background:#a5f3fc;color:var(--ink)}button,input,select{font:inherit}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
    .page{width:min(1180px,calc(100% - 32px));margin:32px auto;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 14px 40px rgba(16,24,40,.12);overflow:hidden}.report-header{display:flex;align-items:center;gap:24px;padding:28px 32px;border-bottom:1px solid var(--line)}.report-header>div:last-child{min-width:0}.brand{width:84px;flex:0 0 84px;text-align:center}.brand img{display:block;width:64px;height:64px;object-fit:contain;margin:auto}.brand strong{display:block;margin-top:5px;font-size:13px;color:var(--ink)}.brand strong span{color:var(--cyan)}h1,h2,h3,h4,p{margin-top:0}h1{margin-bottom:5px;color:var(--ink);font-size:clamp(24px,4vw,36px);line-height:1.15;letter-spacing:-.025em;overflow-wrap:anywhere}.subtitle{margin:0;color:var(--muted)}main{padding:28px 32px 40px}.meta-grid,.case-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0}.meta-grid{background:var(--shell);border:1px solid var(--line);border-radius:12px;padding:4px 14px}.meta-item{padding:12px}.meta-item dt{color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.meta-item dd{margin:4px 0 0;color:var(--ink);font-weight:750}.objective{margin:20px 0;padding:16px 18px;border:1px solid #a5f3fc;border-radius:12px;background:var(--cyan-soft)}.objective strong{display:block;margin-bottom:4px;color:#0e7490;font-size:12px;text-transform:uppercase;letter-spacing:.05em}.objective p{margin:0}.section-heading{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:6px 16px;margin:28px 0 12px}.section-heading h2{margin:0;color:var(--ink);font-size:20px}.section-heading p{margin:0;color:var(--muted);font-size:13px}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden}.metric{padding:14px 16px;border-right:1px solid var(--line)}.metric:last-child{border-right:0}.metric strong{display:block;margin-bottom:7px;font-size:24px;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}.metric span{display:block;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase}.metric-passed strong{color:var(--success)}.metric-failed strong{color:var(--danger)}.metric-blocked strong{color:var(--warning)}.metric-skipped strong{color:var(--violet)}.metric-not_run strong{color:var(--muted)}
    .toolbar{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:minmax(220px,1fr) 210px auto;gap:10px;padding:12px;margin:26px 0 16px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.96);box-shadow:0 4px 14px rgba(16,24,40,.08)}.toolbar input,.toolbar select,.toolbar button{min-height:42px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);padding:9px 12px}.toolbar button{cursor:pointer;font-weight:750}.toolbar button:hover{background:var(--shell)}.result-count{align-self:center;color:var(--muted);font-size:12px;text-align:right}.case-list{display:grid;gap:18px}.case{border:1px solid var(--line);border-radius:14px;overflow:hidden}.case[hidden]{display:none}.case-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 20px;background:var(--shell);border-bottom:1px solid var(--line)}.case-id{margin:0 0 2px;color:#0747a6;font-size:12px;font-weight:800}.case h3{margin:0;color:var(--ink);font-size:18px}.status{display:inline-flex;align-items:center;min-height:25px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}.status-passed{background:var(--success-soft);color:var(--success)}.status-failed{background:var(--danger-soft);color:var(--danger)}.status-blocked{background:var(--warning-soft);color:var(--warning)}.status-skipped{background:var(--violet-soft);color:var(--violet)}.status-not_run{background:var(--shell);color:var(--muted)}.case-meta{padding:8px 10px;border-bottom:1px solid var(--line)}.case-meta .meta-item{padding:8px 10px}.references{margin:0;padding:10px 20px;border-bottom:1px solid var(--line);font-size:13px}.step{margin:16px 20px;border:1px solid var(--line);border-radius:10px;overflow:hidden}.step-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 12px;background:#fcfcfd;border-bottom:1px solid var(--line);color:var(--ink);font-size:12px;font-weight:800}.step-grid{display:grid;grid-template-columns:1fr 1fr}.step-grid>div{padding:14px}.step-grid>div+div{border-left:1px solid var(--line)}.step h4{margin-bottom:5px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}.step p{margin:0;color:var(--ink)}.actual{margin:0 14px 14px;padding:12px;border-radius:8px}.actual-passed{background:var(--success-soft)}.actual-failed{background:var(--danger-soft)}.actual-blocked{background:var(--warning-soft)}.actual-skipped{background:var(--violet-soft)}.actual-not_run{background:var(--shell)}.evidence-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 14px 14px}.evidence-button{padding:0;border:1px solid var(--line);border-radius:10px;background:#fff;overflow:hidden;cursor:zoom-in;text-align:left}.evidence-button:hover{border-color:var(--cyan)}.evidence-button img{display:block;width:100%;height:220px;object-fit:contain;background:var(--shell)}.evidence-button>span{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;color:var(--muted);font-size:12px}.evidence-button strong{color:#0e7490}.evidence-unsupported{display:flex;flex-direction:column;gap:4px;padding:13px;border:1px dashed var(--line);border-radius:10px;background:var(--shell);color:var(--muted);font-size:12px}.evidence-unsupported strong{color:var(--ink)}.empty{padding:18px;text-align:center;color:var(--muted)}.empty button{margin-top:10px;min-height:38px;padding:7px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);cursor:pointer;font-weight:750}.empty button:hover{background:var(--shell)}dialog{width:min(1100px,calc(100% - 32px));max-height:calc(100vh - 32px);padding:0;border:0;border-radius:14px;box-shadow:0 24px 64px rgba(16,24,40,.34)}dialog::backdrop{background:rgba(16,24,40,.78)}.dialog-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid var(--line)}.dialog-header p{margin:0;color:var(--ink);font-weight:750}.dialog-close{min-height:38px;padding:7px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;cursor:pointer;font-weight:750}.dialog-image{display:block;width:100%;height:calc(100vh - 130px);object-fit:contain;background:#101828}.report-footer{padding:18px 32px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center}
    @media(max-width:760px){html,body{max-width:100%;overflow-x:hidden}.page{width:100%;max-width:100vw;margin:0;border:0;border-radius:0}.report-header{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:flex-start;gap:14px;padding:22px 18px}.report-header>div:last-child{width:calc(100vw - 114px);max-width:calc(100vw - 114px);overflow:hidden}.report-header h1{width:100%;max-width:100%;font-size:22px;white-space:normal;overflow-wrap:anywhere;word-break:normal;hyphens:auto}.subtitle{overflow-wrap:anywhere}.brand{width:64px;max-width:64px}.brand img{width:54px;height:54px}main{min-width:0;padding:22px 16px}.meta-grid,.case-meta{grid-template-columns:1fr 1fr}.section-heading{display:block}.section-heading p{margin-top:3px}.metrics{grid-template-columns:1fr 1fr}.metric{border-bottom:1px solid var(--line)}.metric:last-child{grid-column:1/-1}.toolbar{grid-template-columns:minmax(0,1fr);position:static}.toolbar>*{min-width:0}.result-count{text-align:left}.case-header{align-items:flex-start;padding:16px}.case-header>div{min-width:0}.case h3{overflow-wrap:anywhere}.step{margin:12px}.step-grid{grid-template-columns:1fr}.step-grid>div+div{border-left:0;border-top:1px solid var(--line)}.evidence-gallery{grid-template-columns:1fr}.evidence-button img{height:180px}}
    @media(max-width:440px){.report-header{gap:14px}.brand{width:52px;flex-basis:52px}.brand img{width:46px;height:46px}.brand strong{font-size:11px}.meta-grid,.case-meta{grid-template-columns:1fr}.metrics{grid-template-columns:1fr}.metric{border-right:0}.metric:last-child{grid-column:auto}.case-header{display:grid}.status{justify-self:start}}
    @media print{body{background:#fff}.page{width:100%;margin:0;border:0;box-shadow:none}.toolbar,.dialog-close{display:none}.case{break-inside:avoid}.evidence-button{cursor:default}.report-footer{padding-bottom:0}}
  </style>
</head>
<body>
  <!-- Relatório local-first: os dados e as imagens abaixo pertencem ao snapshot imutável da tentativa. -->
  <div class="page">
    <header class="report-header">
      <div class="brand"><img src="${logoSrc}" alt="Logo do QA Flow"><strong>QA <span>Flow</span></strong></div>
      <div><h1>${escapeHtml(report.planName)}</h1><p class="subtitle">Relatório interativo · Tentativa ${report.attempt} · Plano rev. ${report.planRevision} · ${escapeHtml(RUN_STATUS_LABEL[report.status])}</p></div>
    </header>
    <main>
      <dl class="meta-grid">
        ${metaItem("Projeto", report.project)}${metaItem("Ambiente", report.environment)}${metaItem("Build", report.build)}
        ${metaItem("Responsável", report.tester || report.createdBy)}${metaItem("Início", formatDate(report.startedAt))}${metaItem("Imagens", String(imageCount))}
      </dl>
      ${(report.objective || report.description) ? `<section class="objective"><strong>Objetivo</strong><p>${escapeHtml(report.objective || report.description)}</p></section>` : ""}
      <div class="section-heading"><h2>Visão geral</h2><p>${report.cases.length} caso(s) no snapshot</p></div>
      <div class="metrics">${STATUS_ORDER.map((status) => `<div class="metric metric-${status}"><strong>${counts[status]}</strong><span>${escapeHtml(STATUS_LABEL[status])}</span></div>`).join("")}</div>
      <div class="toolbar" aria-label="Filtros do relatório">
        <input id="search" type="search" placeholder="Buscar caso, passo ou resultado" aria-label="Buscar no relatório">
        <select id="status-filter" aria-label="Filtrar por resultado"><option value="all">Todos os resultados</option>${STATUS_ORDER.map((status) => `<option value="${status}">${escapeHtml(STATUS_LABEL[status])}</option>`).join("")}</select>
        <label class="result-count"><input id="images-only" type="checkbox"> Somente com imagens · <strong id="visible-count" aria-live="polite">${report.cases.length}</strong></label>
      </div>
      <div class="case-list">${cases || '<p class="empty">Nenhum caso registrado no snapshot desta tentativa.</p>'}</div>
      <p id="no-results" class="empty" hidden>Nenhum resultado encontrado para os filtros atuais.<br><button id="clear-filters" type="button">Limpar busca e filtros</button></p>
    </main>
    <footer class="report-footer">QA Flow · ${escapeHtml(report.id)} · Gerado do snapshot imutável</footer>
  </div>
  <dialog id="image-viewer" aria-labelledby="image-caption"><div class="dialog-header"><p id="image-caption"></p><button class="dialog-close" type="button">Fechar</button></div><div id="image-stage"></div></dialog>
  <script>
    (() => {
      const cases = [...document.querySelectorAll('.case')];
      const search = document.querySelector('#search');
      const status = document.querySelector('#status-filter');
      const imagesOnly = document.querySelector('#images-only');
      const visibleCount = document.querySelector('#visible-count');
      const noResults = document.querySelector('#no-results');
      const clearFilters = document.querySelector('#clear-filters');
      const filter = () => {
        const query = search.value.trim().toLocaleLowerCase('pt-BR');
        let visible = 0;
        for (const item of cases) {
          const matchesStatus = status.value === 'all' || item.dataset.status === status.value;
          const matchesImages = !imagesOnly.checked || Number(item.dataset.images) > 0;
          const matchesQuery = !query || item.dataset.search.includes(query);
          item.hidden = !(matchesStatus && matchesImages && matchesQuery);
          if (!item.hidden) visible += 1;
        }
        visibleCount.textContent = String(visible);
        noResults.hidden = visible > 0 || cases.length === 0;
      };
      search.addEventListener('input', filter);
      status.addEventListener('change', filter);
      imagesOnly.addEventListener('change', filter);
      clearFilters.addEventListener('click', () => {
        search.value = '';
        status.value = 'all';
        imagesOnly.checked = false;
        filter();
        search.focus();
      });

      const viewer = document.querySelector('#image-viewer');
      const viewerImage = document.createElement('img');
      viewerImage.className = 'dialog-image';
      viewer.querySelector('#image-stage').append(viewerImage);
      const caption = viewer.querySelector('#image-caption');
      for (const button of document.querySelectorAll('.evidence-button')) {
        button.addEventListener('click', () => {
          const thumbnail = button.querySelector('img');
          viewerImage.src = thumbnail.src;
          viewerImage.alt = thumbnail.alt;
          caption.textContent = thumbnail.alt;
          viewer.showModal();
        });
      }
      viewer.querySelector('.dialog-close').addEventListener('click', () => viewer.close());
      viewer.addEventListener('click', (event) => { if (event.target === viewer) viewer.close(); });
    })();
  </script>
</body>
</html>`;
}

let logoDataUrlPromise: Promise<string> | null = null;

function brandLogoDataUrl(): Promise<string> {
  logoDataUrlPromise ??= fetch("/qa-flow-logo.png").then(async (response) => {
    if (!response.ok) throw new Error("Não foi possível carregar a logo do QA Flow.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${response.headers.get("content-type") ?? "image/png"};base64,${btoa(binary)}`;
  });
  return logoDataUrlPromise;
}

export async function generateHtmlReport(
  report: PdfReportData,
  saveGeneratedFile: GeneratedFileSaver,
): Promise<OperationResult> {
  try {
    const logoSrc = await brandLogoDataUrl();
    const result = await saveGeneratedFile(
      {
        suggestedName: `QAFlow_Relatorio_Interativo_${safeName(report.planName)}.html`,
        mimeType: "text/html;charset=utf-8",
        extension: ".html",
      },
      new TextEncoder().encode(buildHtmlReport(report, logoSrc)),
    );
    return result.ok
      ? { ok: true, message: "Relatório interativo HTML gerado e salvo." }
      : { ok: false, message: result.message };
  } catch (error) {
    console.error("[generateHtmlReport]", error);
    return { ok: false, message: `Falha ao gerar o relatório HTML: ${error instanceof Error ? error.message : "erro desconhecido."}` };
  }
}
