import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileBarChart, FileText, Plus, Trash2 } from "lucide-react";
import type { StepStatus } from "../../domain/types";
import { deriveCaseStatus } from "../../domain/validation";
import { runCsvRows, runToLegacyPlan } from "../../domain/reporting";
import { useQaStore } from "../../store/useQaStore";
import { EmptyState, Notice, PageHeader, StatusBadge, buttonDanger, buttonPrimary, buttonSecondary, inputClass, runStatusLabel, stepStatusLabel } from "./Shared";

function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsScreen() {
  const runs = useQaStore((state) => state.runs);
  const reports = useQaStore((state) => state.reports);
  const getEvidenceData = useQaStore((state) => state.getEvidenceData);
  const createReport = useQaStore((state) => state.createReport);
  const removeReport = useQaStore((state) => state.removeReport);
  const [runId, setRunId] = useState(runs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const run = runs.find((item) => item.id === runId);
  const runReports = reports.filter((item) => item.runId === runId);

  const counts = useMemo(() => run?.snapshot.cases.reduce<Record<StepStatus, number>>((accumulator, testCase) => {
    accumulator[deriveCaseStatus(run, testCase)] += 1;
    return accumulator;
  }, { not_run: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 }), [run]);

  const generatePdf = async (kind: "executive" | "evidence") => {
    if (!run) return;
    setGenerating(true);
    setMessage("Preparando o PDF a partir do snapshot...");
    try {
      const legacyPlan = await runToLegacyPlan(run, getEvidenceData);
      const { generateEvidenceReport, generateExecutiveSummary } = await import("../../utils/generatePdfReport");
      if (kind === "executive") await generateExecutiveSummary(legacyPlan);
      else await generateEvidenceReport(legacyPlan);
      setMessage("PDF gerado a partir da tentativa selecionada.");
    } finally {
      setGenerating(false);
    }
  };

  const register = async () => {
    if (!run) return;
    const result = await createReport(run.id, title, notes);
    setMessage(result.message);
    if (result.ok) { setTitle(""); setNotes(""); }
  };

  return (
    <>
      <PageHeader title="Relatórios" description="Gere artefatos diretamente de uma tentativa imutável. O resultado histórico não muda quando casos e planos evoluem." />
      {runs.length === 0 ? (
        <EmptyState title="Nenhuma execução disponível" description="Execute um plano para liberar resumos, relatórios técnicos e exportações auditáveis." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="text-sm font-bold text-slate-700">Tentativa de origem<select className={`${inputClass} mt-1`} value={runId} onChange={(event) => setRunId(event.target.value)}>{runs.map((item) => <option key={item.id} value={item.id}>{item.snapshot.plan.name} · tentativa {item.attempt} · {runStatusLabel[item.status]}</option>)}</select></label>
              {run && (
                <div className="mt-5">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs text-slate-500">{run.context.environment || "Sem ambiente"} · {new Date(run.startedAt).toLocaleString("pt-BR")}</span></div>
                  <h2 className="mt-2 text-xl font-black text-slate-950">{run.snapshot.plan.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">Snapshot com {run.snapshot.cases.length} caso(s), plano rev. {run.planRevision}.</p>
                </div>
              )}
            </section>

            {run && counts && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-black text-slate-950">Resultado por caso</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(Object.keys(counts) as StepStatus[]).map((status) => <div key={status} className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-2xl font-black text-slate-950">{counts[status]}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{stepStatusLabel[status]}</p></div>)}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" className={buttonPrimary} disabled={generating} onClick={() => void generatePdf("executive")}><FileBarChart size={16} /> Resumo executivo PDF</button>
                  <button type="button" className={buttonSecondary} disabled={generating} onClick={() => void generatePdf("evidence")}><FileText size={16} /> Relatório técnico PDF</button>
                  <button type="button" className={buttonSecondary} onClick={() => download(JSON.stringify(run, null, 2), "application/json", `${run.id}.json`)}><Download size={16} /> JSON</button>
                  <button type="button" className={buttonSecondary} onClick={() => download(Papa.unparse(runCsvRows(run)), "text/csv;charset=utf-8", `${run.id}.csv`)}><Download size={16} /> CSV</button>
                </div>
                {message && <div className="mt-4"><Notice tone="info">{message}</Notice></div>}
              </section>
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-950">Registrar relatório</h2>
              <p className="mt-1 text-xs text-slate-500">Cria um registro rastreável; os PDFs podem ser regenerados do mesmo snapshot.</p>
              <label className="mt-4 block text-xs font-bold text-slate-600">Título<input className={`${inputClass} mt-1`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={run ? `Relatório — ${run.snapshot.plan.name}` : ""} /></label>
              <label className="mt-3 block text-xs font-bold text-slate-600">Notas<textarea className={`${inputClass} mt-1 min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <button type="button" className={`${buttonPrimary} mt-4 w-full`} disabled={!run} onClick={() => void register()}><Plus size={16} /> Registrar</button>
            </section>

            <section>
              <h2 className="mb-3 font-black text-slate-950">Registros desta tentativa</h2>
              {runReports.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Nenhum registro.</p> : <div className="space-y-3">{runReports.map((report) => <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-bold text-slate-950">{report.title}</p><p className="mt-1 text-xs text-slate-500">{new Date(report.createdAt).toLocaleString("pt-BR")}</p>{report.notes && <p className="mt-2 text-sm text-slate-600">{report.notes}</p>}<button type="button" className={`${buttonDanger} mt-3`} onClick={() => { if (window.confirm("Remover somente este registro de relatório? A execução será preservada.")) void removeReport(report.id); }}><Trash2 size={14} /> Remover registro</button></article>)}</div>}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
