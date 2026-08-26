import { useMemo, useState } from "react";
import { Filter, Play, RotateCcw, Search, X } from "lucide-react";
import type { RunContext, RunStatus, TestRun } from "../../domain/types";
import { runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { EmptyState, Notice, PageHeader, StatusBadge, buttonPrimary, buttonSecondary, inputClass, runStatusLabel } from "./Shared";
import { RunRunner } from "./RunRunner";

const blankContext: RunContext = { environment: "", build: "", platform: "", device: "", browser: "", tester: "", notes: "" };

function StartRunDialog({ initialPlanId, sourceRun, onClose }: { initialPlanId?: string; sourceRun?: TestRun; onClose: () => void }) {
  const plans = useQaStore((state) => state.plans);
  const cases = useQaStore((state) => state.cases);
  const startRun = useQaStore((state) => state.startRun);
  const [planId, setPlanId] = useState(initialPlanId ?? sourceRun?.planId ?? plans.find((item) => item.status === "active")?.id ?? "");
  const [context, setContext] = useState<RunContext>(sourceRun ? { ...sourceRun.context, notes: sourceRun.context.notes ? `${sourceRun.context.notes}\nReexecução da tentativa ${sourceRun.attempt}.` : `Reexecução da tentativa ${sourceRun.attempt}.` } : blankContext);
  const [message, setMessage] = useState("");
  const selectedPlan = plans.find((item) => item.id === planId);
  const stale = selectedPlan?.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.revision !== reference.caseRevision).length ?? 0;
  const inactive = selectedPlan?.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.status !== "active").length ?? 0;

  const submit = async () => {
    if (!context.environment.trim() || !context.tester.trim()) {
      setMessage("Ambiente e responsável são obrigatórios.");
      return;
    }
    const result = await startRun(planId, context, sourceRun?.id);
    setMessage(result.message);
    if (result.ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="start-run-title">
      <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-3xl sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between"><div><h2 id="start-run-title" className="text-xl font-black text-slate-950">{sourceRun ? "Nova tentativa" : "Iniciar execução"}</h2><p className="mt-1 text-sm text-slate-500">O plano e os casos atuais serão congelados em um snapshot.</p></div><button type="button" aria-label="Fechar" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
        {message && <div className="mt-4"><Notice tone="error">{message}</Notice></div>}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-700 md:col-span-2">Plano<select className={`${inputClass} mt-1`} value={planId} onChange={(event) => setPlanId(event.target.value)} disabled={Boolean(sourceRun)}><option value="">Selecione</option>{plans.filter((item) => item.status === "active").map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.caseRefs.length} caso(s)</option>)}</select></label>
          {selectedPlan && <div className="md:col-span-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><strong>{selectedPlan.caseRefs.length} caso(s)</strong> · plano rev. {selectedPlan.revision}{stale > 0 && <span className="ml-2 font-bold text-amber-700">{stale} referência(s) precisam ser revisadas.</span>}{inactive > 0 && <span className="ml-2 font-bold text-violet-700">{inactive} caso(s) não estão ativos.</span>}</div>}
          <label className="text-sm font-bold text-slate-700">Ambiente <span className="text-rose-600">*</span><input className={`${inputClass} mt-1`} value={context.environment} onChange={(event) => setContext({ ...context, environment: event.target.value })} placeholder="Homologação, staging..." /></label>
          <label className="text-sm font-bold text-slate-700">Responsável <span className="text-rose-600">*</span><input className={`${inputClass} mt-1`} value={context.tester} onChange={(event) => setContext({ ...context, tester: event.target.value })} /></label>
          <label className="text-sm font-bold text-slate-700">Build<input className={`${inputClass} mt-1`} value={context.build} onChange={(event) => setContext({ ...context, build: event.target.value })} /></label>
          <label className="text-sm font-bold text-slate-700">Plataforma<input className={`${inputClass} mt-1`} value={context.platform} onChange={(event) => setContext({ ...context, platform: event.target.value })} placeholder="Web, Android, iOS..." /></label>
          <label className="text-sm font-bold text-slate-700">Dispositivo<input className={`${inputClass} mt-1`} value={context.device} onChange={(event) => setContext({ ...context, device: event.target.value })} /></label>
          <label className="text-sm font-bold text-slate-700">Navegador<input className={`${inputClass} mt-1`} value={context.browser} onChange={(event) => setContext({ ...context, browser: event.target.value })} /></label>
          <label className="text-sm font-bold text-slate-700 md:col-span-2">Notas<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={context.notes} onChange={(event) => setContext({ ...context, notes: event.target.value })} /></label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button><button type="button" className={buttonPrimary} disabled={!planId || stale > 0 || inactive > 0} onClick={() => void submit()}><Play size={16} /> Iniciar tentativa</button></div>
      </div>
    </div>
  );
}

export function RunsScreen({ requestedPlanId, onRequestHandled }: { requestedPlanId?: string; onRequestHandled: () => void }) {
  const runs = useQaStore((state) => state.runs);
  const activeRunId = useQaStore((state) => state.activeRunId);
  const setActiveRun = useQaStore((state) => state.setActiveRun);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(activeRunId);
  const [dialog, setDialog] = useState<{ planId?: string; sourceRun?: TestRun } | null>(requestedPlanId ? { planId: requestedPlanId } : null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RunStatus | "all">("all");
  const selectedRun = runs.find((item) => item.id === selectedRunId);

  const filtered = useMemo(() => runs.filter((run) =>
    `${run.id} ${run.snapshot.plan.name} ${run.context.environment} ${run.context.tester}`.toLowerCase().includes(query.toLowerCase()) &&
    (status === "all" || run.status === status),
  ), [query, runs, status]);

  if (selectedRun) return <RunRunner run={selectedRun} onBack={() => { setSelectedRunId(null); setActiveRun(null); }} />;

  return (
    <>
      <PageHeader title="Execuções" description="Cada tentativa é independente, preserva o snapshot utilizado e permanece disponível para auditoria e relatórios." actions={<button type="button" className={buttonPrimary} onClick={() => setDialog({})}><Play size={17} /> Nova execução</button>} />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <label className="relative"><span className="sr-only">Buscar execuções</span><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar plano, ambiente, responsável ou ID" /></label>
        <label className="relative"><span className="sr-only">Filtrar status</span><Filter className="absolute left-3 top-3 text-slate-400" size={18} /><select className={`${inputClass} pl-10`} value={status} onChange={(event) => setStatus(event.target.value as RunStatus | "all")}><option value="all">Todos os status</option>{(Object.keys(runStatusLabel) as RunStatus[]).map((value) => <option key={value} value={value}>{runStatusLabel[value]}</option>)}</select></label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma execução encontrada" description={runs.length ? "Ajuste a busca ou o filtro." : "Inicie uma execução a partir de um plano ativo e atualizado."} action={!runs.length ? <button type="button" className={buttonPrimary} onClick={() => setDialog({})}>Iniciar primeira tentativa</button> : undefined} />
      ) : (
        <div className="space-y-3">
          {filtered.map((run) => {
            const progress = runProgress(run);
            return (
              <article key={run.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedRunId(run.id); setActiveRun(run.id); }}>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs font-bold text-slate-500">Tentativa {run.attempt}</span><span className="text-xs text-slate-400">snapshot do plano rev. {run.planRevision}</span></div>
                  <h2 className="mt-2 truncate text-lg font-black text-slate-950">{run.snapshot.plan.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">{run.context.environment || "Sem ambiente"} · {run.context.tester || "Sem responsável"} · atualizado em {new Date(run.updatedAt).toLocaleString("pt-BR")}</p>
                  <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${progress.percent}%` }} /></div><span className="text-xs font-black text-slate-500">{progress.percent}%</span></div>
                </button>
                <div className="flex shrink-0 flex-wrap gap-2"><button type="button" className={buttonSecondary} onClick={() => { setSelectedRunId(run.id); setActiveRun(run.id); }}>{run.status === "completed" || run.status === "aborted" ? "Consultar" : "Continuar"}</button><button type="button" className={buttonSecondary} onClick={() => setDialog({ sourceRun: run })}><RotateCcw size={15} /> Nova tentativa</button></div>
              </article>
            );
          })}
        </div>
      )}
      {dialog && <StartRunDialog initialPlanId={dialog.planId} sourceRun={dialog.sourceRun} onClose={() => { setDialog(null); onRequestHandled(); const active = useQaStore.getState().activeRunId; if (active) setSelectedRunId(active); }} />}
    </>
  );
}
