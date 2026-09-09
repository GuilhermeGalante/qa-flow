import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileBarChart, FileCode2, FileText, Plus, Trash2 } from "lucide-react";
import type { StepStatus } from "../../domain/types";
import { deriveCaseStatus } from "../../domain/validation";
import { runCsvRows, runToPdfReportData } from "../../domain/reporting";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { Select, type SelectOption } from "../../ui/Select";
import { useToast } from "../../ui/ToastProvider";
import { EmptyState, PageHeader, StatusBadge, buttonDanger, buttonSecondary, inputClass, runStatusLabel, stepStatusLabel } from "./Shared";
import { getActiveLocale, tr } from "../../i18n";

export function ReportsScreen() {
  const locale = getActiveLocale();
  const runs = useQaStore((state) => state.runs);
  const reports = useQaStore((state) => state.reports);
  const getEvidenceData = useQaStore((state) => state.getEvidenceData);
  const createReport = useQaStore((state) => state.createReport);
  const removeReport = useQaStore((state) => state.removeReport);
  const saveGeneratedFile = useQaStore((state) => state.saveGeneratedFile);
  const toast = useToast();
  const confirm = useConfirm();
  const [runId, setRunId] = useState(runs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState<"executive" | "evidence" | "html" | null>(null);
  const [registering, setRegistering] = useState(false);
  const run = runs.find((item) => item.id === runId);
  const runReports = reports.filter((item) => item.runId === runId);

  const runOptions = useMemo<SelectOption[]>(() => runs.map((item) => ({
    value: item.id,
    label: item.snapshot.plan.name,
    hint: `${tr("Tentativa")} ${item.attempt} · ${tr(runStatusLabel[item.status])} · ${new Date(item.startedAt).toLocaleDateString(locale)}`,
    localizeLabel: false,
  })), [locale, runs]);

  const counts = useMemo(() => run?.snapshot.cases.reduce<Record<StepStatus, number>>((accumulator, testCase) => {
    accumulator[deriveCaseStatus(run, testCase)] += 1;
    return accumulator;
  }, { not_run: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 }), [run]);

  const generateReport = async (kind: "executive" | "evidence" | "html") => {
    if (!run) return;
    setGenerating(kind);
    try {
      // O snapshot precisa ser materializado com as evidências antes de virar PDF; uma
      // falha aqui também é falha da operação, e não pode terminar em mensagem de sucesso.
      const reportData = await runToPdfReportData(run, getEvidenceData);
      const result = kind === "html"
        ? await import("../../utils/generateHtmlReport").then(({ generateHtmlReport }) => (
          generateHtmlReport(reportData, saveGeneratedFile)
        ))
        : await import("../../utils/generatePdfReport").then(({ generateEvidenceReport, generateExecutiveSummary }) => (
          kind === "executive"
            ? generateExecutiveSummary(reportData, saveGeneratedFile)
            : generateEvidenceReport(reportData, saveGeneratedFile)
        ));
      toast.fromResult(result, { successDescription: tr("Gerado a partir do snapshot da tentativa selecionada.") });
    } catch (error) {
      toast.show({
        tone: "error",
        message: tr("Não foi possível preparar o relatório."),
        description: error instanceof Error ? error.message : tr("Falha ao ler as evidências do snapshot."),
      });
    } finally {
      setGenerating(null);
    }
  };

  const saveTextExport = async (content: string, mimeType: string, filename: string) => {
    const extension = filename.slice(filename.lastIndexOf("."));
    toast.fromResult(await saveGeneratedFile(
      { suggestedName: filename, mimeType, extension },
      new TextEncoder().encode(content),
    ));
  };

  const register = async () => {
    if (!run) return;
    setRegistering(true);
    try {
      const result = await createReport(run.id, title, notes);
      toast.fromResult(result);
      if (result.ok) { setTitle(""); setNotes(""); }
    } finally {
      setRegistering(false);
    }
  };

  const remove = async (reportId: string, reportTitle: string) => {
    const confirmed = await confirm({
      title: tr("Remover este registro?"),
      description: tr("Apenas o registro sai da lista. A execução e o snapshot permanecem no histórico."),
      itemLabel: reportTitle,
      confirmLabel: tr("Remover registro"),
      tone: "danger",
    });
    if (!confirmed) return;
    toast.fromResult(await removeReport(reportId));
  };

  return (
    <>
      <PageHeader title={tr("Relatórios")} description={tr("Gere artefatos diretamente de uma tentativa imutável. O resultado histórico não muda quando casos e planos evoluem.")} />
      {runs.length === 0 ? (
        <EmptyState title={tr("Nenhuma execução disponível")} description={tr("Execute um plano para liberar resumos, relatórios técnicos e exportações auditáveis.")} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
              <label htmlFor="report-run" className="text-sm font-bold text-control">{tr("Tentativa de origem")}</label>
              <Select id="report-run" className="mt-1" value={runId} onChange={setRunId} options={runOptions} ariaLabel={tr("Tentativa de origem")} placeholder={tr("Selecione a tentativa")} />
              {run && (
                <div className="mt-5">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs text-muted">{run.context.environment || tr("Sem ambiente")} · {new Date(run.startedAt).toLocaleString(getActiveLocale())}</span></div>
                  <h2 className="mt-2 text-xl font-bold text-body">{run.snapshot.plan.name}</h2>
                  <p className="mt-1 text-sm text-muted">{tr(`Snapshot com ${run.snapshot.cases.length} caso(s), plano rev. ${run.planRevision}.`)}</p>
                </div>
              )}
            </section>

            {run && counts && (
              <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
                <h2 className="font-bold text-body">{tr("Resultado por caso")}</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(Object.keys(counts) as StepStatus[]).map((status) => <div key={status} className="rounded-xl bg-surface p-3 text-center"><p className="text-2xl font-bold leading-none tabular-nums text-body">{counts[status]}</p><p className="mt-2 text-[11px] font-bold leading-tight text-muted">{tr(stepStatusLabel[status])}</p></div>)}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="primary" loading={generating === "executive"} loadingLabel={tr("Gerando…")} disabled={generating !== null} icon={<FileBarChart size={16} />} onClick={() => void generateReport("executive")}>{tr("Resumo executivo PDF")}</Button>
                  <Button loading={generating === "evidence"} loadingLabel={tr("Gerando…")} disabled={generating !== null} icon={<FileText size={16} />} onClick={() => void generateReport("evidence")}>{tr("Relatório técnico PDF")}</Button>
                  <Button loading={generating === "html"} loadingLabel={tr("Gerando…")} disabled={generating !== null} icon={<FileCode2 size={16} />} onClick={() => void generateReport("html")}>{tr("Relatório interativo HTML")}</Button>
                  <button type="button" className={buttonSecondary} onClick={() => void saveTextExport(JSON.stringify(run, null, 2), "application/json", `${run.id}.json`)}><Download size={16} /> JSON</button>
                  <button type="button" className={buttonSecondary} onClick={() => void saveTextExport(Papa.unparse(runCsvRows(run)), "text/csv;charset=utf-8", `${run.id}.csv`)}><Download size={16} /> CSV</button>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
              <h2 className="font-bold text-body">{tr("Registrar relatório")}</h2>
              <p className="mt-1 text-xs text-muted">{tr("Cria um registro rastreável; os PDFs podem ser regenerados do mesmo snapshot.")}</p>
              <label className="mt-4 block text-xs font-bold text-subtle">{tr("Título")}<input className={`${inputClass} mt-1`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={run ? `${tr("Relatório")} — ${run.snapshot.plan.name}` : ""} /></label>
              <label className="mt-3 block text-xs font-bold text-subtle">{tr("Notas")}<textarea className={`${inputClass} mt-1 min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <Button variant="primary" className="mt-4 w-full" loading={registering} loadingLabel={tr("Registrando…")} disabled={!run} icon={<Plus size={16} />} onClick={() => void register()}>{tr("Registrar")}</Button>
            </section>

            <section>
              <h2 className="mb-3 font-bold text-body">{tr("Registros desta tentativa")}</h2>
              {runReports.length === 0 ? <p className="rounded-xl border border-dashed border-hairline-strong p-5 text-center text-sm text-muted">{tr("Nenhum registro.")}</p> : <div className="space-y-3">{runReports.map((report) => <article key={report.id} className="rounded-xl border border-hairline bg-raised p-4"><p className="font-bold text-body">{report.title}</p><p className="mt-1 text-xs text-muted">{new Date(report.createdAt).toLocaleString(getActiveLocale())}</p>{report.notes && <p className="mt-2 text-sm text-subtle">{report.notes}</p>}<button type="button" className={`${buttonDanger} mt-3`} onClick={() => void remove(report.id, report.title)}><Trash2 size={14} /> {tr("Remover registro")}</button></article>)}</div>}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
