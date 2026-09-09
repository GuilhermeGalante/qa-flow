import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, Play, RotateCcw, Search, ShieldAlert } from "lucide-react";
import type { RunContext, RunStatus, TestRun } from "../../domain/types";
import { runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { SegmentedControl, type SegmentedOption } from "../../ui/SegmentedControl";
import { Select, type SelectOption } from "../../ui/Select";
import { useToast } from "../../ui/ToastProvider";
import { EmptyState, MetricCard, Notice, PageHeader, StatusBadge, buttonPrimary, buttonSecondary, inputClass, runStatusLabel } from "./Shared";
import { RunRunner } from "./RunRunner";
import { getActiveLocale, tr } from "../../i18n";

const blankContext: RunContext = { environment: "", build: "", platform: "", device: "", browser: "", tester: "", notes: "" };

function StartRunDialog({ initialPlanId, sourceRun, onClose }: { initialPlanId?: string; sourceRun?: TestRun; onClose: () => void }) {
  const plans = useQaStore((state) => state.plans);
  const cases = useQaStore((state) => state.cases);
  const startRun = useQaStore((state) => state.startRun);
  const toast = useToast();
  const [planId, setPlanId] = useState(initialPlanId ?? sourceRun?.planId ?? plans.find((item) => item.status === "active")?.id ?? "");
  const [context, setContext] = useState<RunContext>(sourceRun ? { ...sourceRun.context, notes: sourceRun.context.notes ? `${sourceRun.context.notes}\n${tr(`Reexecução da tentativa ${sourceRun.attempt}.`)}` : tr(`Reexecução da tentativa ${sourceRun.attempt}.`) } : blankContext);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const selectedPlan = plans.find((item) => item.id === planId);
  const stale = selectedPlan?.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.revision !== reference.caseRevision).length ?? 0;
  const inactive = selectedPlan?.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.status !== "active").length ?? 0;

  // A lista de planos cresce, e cada opção carrega revisão e contagem: busca e segunda
  // linha existem justamente porque o `<select>` nativo achatava isso em uma linha só.
  const planOptions: SelectOption[] = plans
    .filter((plan) => plan.status === "active")
    .map((plan) => ({
      value: plan.id,
      label: plan.name,
      hint: `${plan.project || tr("Sem projeto")} · ${plan.caseRefs.length} ${tr("caso(s)")} · ${tr("rev.")} ${plan.revision}`,
      localizeLabel: false,
    }));

  const submit = async () => {
    if (!context.environment.trim() || !context.tester.trim()) {
      setError(tr("Ambiente e responsável são obrigatórios."));
      return;
    }
    setStarting(true);
    const result = await startRun(planId, context, sourceRun?.id);
    setStarting(false);
    if (result.ok) {
      toast.fromResult(result);
      onClose();
      return;
    }
    setError(result.message);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={sourceRun ? tr("Nova tentativa") : tr("Iniciar execução")}
      description={tr("O plano e os casos atuais serão congelados em um snapshot.")}
      size="lg"
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className={buttonSecondary} onClick={onClose}>{tr("Cancelar")}</button>
          <Button variant="primary" loading={starting} loadingLabel="Iniciando…" disabled={!planId || stale > 0 || inactive > 0} icon={<Play size={16} />} onClick={() => void submit()}>{tr("Iniciar tentativa")}</Button>
        </>
      )}
    >
      {error && <div className="mb-4"><Notice tone="error" onDismiss={() => setError("")}>{error}</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="text-sm font-bold text-control md:col-span-2">
          <label htmlFor="run-plan">{tr("Plano")}</label>
          <Select
            id="run-plan"
            className="mt-1"
            ariaLabel={tr("Plano da execução")}
            value={planId}
            onChange={setPlanId}
            options={planOptions}
            disabled={Boolean(sourceRun)}
            searchable={planOptions.length > 8}
            searchPlaceholder={tr("Buscar plano…")}
            placeholder={tr("Selecione")}
            emptyLabel={tr("Nenhum plano ativo encontrado.")}
          />
        </div>
        {selectedPlan && <div className="rounded-xl bg-surface p-3 text-xs text-subtle md:col-span-2"><strong>{selectedPlan.caseRefs.length} {tr("caso(s)")}</strong> · {tr("plano rev.")} {selectedPlan.revision}{stale > 0 && <span className="ml-2 font-bold text-warn">{tr(`${stale} referência(s) precisam ser revisadas.`)}</span>}{inactive > 0 && <span className="ml-2 font-bold text-explore">{tr(`${inactive} caso(s) não estão ativos.`)}</span>}</div>}
        <label className="text-sm font-bold text-control">{tr("Ambiente")} <span className="text-fail">*</span><input className={`${inputClass} mt-1`} value={context.environment} onChange={(event) => setContext({ ...context, environment: event.target.value })} placeholder={tr("Homologação, staging...")} /></label>
        <label className="text-sm font-bold text-control">{tr("Responsável")} <span className="text-fail">*</span><input className={`${inputClass} mt-1`} value={context.tester} onChange={(event) => setContext({ ...context, tester: event.target.value })} /></label>
        <label className="text-sm font-bold text-control">{tr("Build")}<input className={`${inputClass} mt-1`} value={context.build} onChange={(event) => setContext({ ...context, build: event.target.value })} /></label>
        <label className="text-sm font-bold text-control">{tr("Plataforma")}<input className={`${inputClass} mt-1`} value={context.platform} onChange={(event) => setContext({ ...context, platform: event.target.value })} placeholder="Web, Android, iOS..." /></label>
        <label className="text-sm font-bold text-control">{tr("Dispositivo")}<input className={`${inputClass} mt-1`} value={context.device} onChange={(event) => setContext({ ...context, device: event.target.value })} /></label>
        <label className="text-sm font-bold text-control">{tr("Navegador")}<input className={`${inputClass} mt-1`} value={context.browser} onChange={(event) => setContext({ ...context, browser: event.target.value })} /></label>
        <label className="text-sm font-bold text-control md:col-span-2">{tr("Notas")}<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={context.notes} onChange={(event) => setContext({ ...context, notes: event.target.value })} /></label>
      </div>
    </Modal>
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

  const completedRuns = runs.filter((run) => run.status === "completed");
  const activeRuns = runs.filter((run) => run.status === "in_progress" || run.status === "paused");
  const allResults = runs.flatMap((run) => Object.values(run.results));
  const decisiveResults = allResults.filter((result) => result.status === "passed" || result.status === "failed");
  const successRate = decisiveResults.length
    ? Math.round((decisiveResults.filter((result) => result.status === "passed").length / decisiveResults.length) * 100)
    : 0;
  const completedDurations = completedRuns
    .filter((run) => run.finishedAt)
    .map((run) => Math.max(0, Date.parse(run.finishedAt!) - Date.parse(run.startedAt)));
  const averageDurationMinutes = completedDurations.length
    ? Math.round(completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length / 60_000)
    : 0;
  const failedOrBlocked = allResults.filter((result) => result.status === "failed" || result.status === "blocked").length;

  const matching = useMemo(() => runs.filter((run) =>
    `${run.id} ${run.snapshot.plan.name} ${run.context.environment} ${run.context.tester}`.toLowerCase().includes(query.toLowerCase())), [query, runs]);
  const filtered = matching.filter((run) => status === "all" || run.status === status);

  const statusOptions: SegmentedOption<RunStatus | "all">[] = [
    { value: "all", label: tr("Todos"), count: matching.length },
    ...(Object.keys(runStatusLabel) as RunStatus[])
      .map((value) => ({ value, label: runStatusLabel[value], count: matching.filter((run) => run.status === value).length }))
      // Um status sem nenhuma execução só ocuparia espaço no filtro.
      .filter((option) => option.count > 0 || option.value === status),
  ];

  if (selectedRun) return <RunRunner run={selectedRun} onBack={() => { setSelectedRunId(null); setActiveRun(null); }} />;

  return (
    <>
      <PageHeader title={tr("Execuções")} description={tr("Cada tentativa é independente, preserva o snapshot utilizado e permanece disponível para auditoria e relatórios.")} actions={<button type="button" className={buttonPrimary} onClick={() => setDialog({})}><Play size={17} /> {tr("Nova execução")}</button>} />
      <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={tr("Indicadores das execuções")}>
        <MetricCard label={tr("Total de execuções")} value={runs.length} detail={`${activeRuns.length} em andamento`} icon={<Activity size={18} />} />
        <MetricCard label={tr("Taxa de sucesso global")} value={`${successRate}%`} detail={`${decisiveResults.length} resultado(s) decisivo(s)`} icon={<CheckCircle2 size={18} />} tone="pass" />
        <MetricCard label={tr("Tempo médio")} value={averageDurationMinutes ? `${averageDurationMinutes} min` : "—"} detail={tr(`${completedRuns.length} execução(ões) concluída(s)`)} icon={<Clock3 size={18} />} tone="run" />
        <MetricCard label={tr("Falhas e bloqueios")} value={failedOrBlocked} detail={tr("resultados que exigem atenção")} icon={<ShieldAlert size={18} />} tone={failedOrBlocked ? "fail" : "neutral"} />
      </section>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-hairline bg-raised p-3 shadow-[0_8px_24px_rgb(15_23_42/0.03)] lg:flex-row lg:items-center">
        <label className="relative lg:w-80"><span className="sr-only">{tr("Buscar execuções")}</span><Search className="absolute left-3 top-3 text-faint" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Buscar plano, ambiente, responsável ou ID")} /></label>
        <SegmentedControl size="sm" ariaLabel={tr("Filtrar status")} value={status} onChange={setStatus} options={statusOptions} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title={tr("Nenhuma execução encontrada")} description={runs.length ? tr("Ajuste a busca ou o filtro.") : tr("Inicie uma execução a partir de um plano ativo e atualizado.")} action={!runs.length ? <button type="button" className={buttonPrimary} onClick={() => setDialog({})}>{tr("Iniciar primeira tentativa")}</button> : undefined} />
      ) : (
        <div className="space-y-3">
          {filtered.map((run) => {
            const progress = runProgress(run);
            const resultValues = Object.values(run.results);
            const passed = resultValues.filter((result) => result.status === "passed").length;
            const failed = resultValues.filter((result) => result.status === "failed").length;
            const blocked = resultValues.filter((result) => result.status === "blocked").length;
            return (
              <article key={run.id} className="rounded-2xl border border-hairline bg-raised p-5 shadow-[0_8px_24px_rgb(15_23_42/0.03)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedRunId(run.id); setActiveRun(run.id); }}>
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs font-bold text-muted">{tr("Tentativa")} {run.attempt}</span><span className="text-xs text-faint">Snapshot rev. {run.planRevision}</span></div>
                    <h2 className="mt-2 truncate text-lg font-bold text-body">{run.snapshot.plan.name}</h2>
                    <p className="mt-1 text-xs text-muted">{run.context.environment || tr("Sem ambiente")} · {run.context.tester || tr("Sem responsável")} · {new Date(run.updatedAt).toLocaleString(getActiveLocale())}</p>
                  </button>
                  <div className="flex shrink-0 flex-wrap gap-2"><button type="button" className={buttonSecondary} onClick={() => { setSelectedRunId(run.id); setActiveRun(run.id); }}>{run.status === "completed" || run.status === "aborted" ? tr("Consultar") : tr("Continuar")}</button><button type="button" className={buttonSecondary} onClick={() => setDialog({ sourceRun: run })}><RotateCcw size={15} /> {tr("Nova tentativa")}</button></div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"><span className="text-muted">{tr(`${passed} aprovado(s) · ${failed} reprovado(s) · ${blocked} bloqueado(s)`)}</span><strong className="tabular-nums text-body">{tr(`${progress.executed} de ${progress.total} passos · ${progress.percent}%`)}</strong></div>
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-shell"><div className="bg-pass-mark" style={{ width: `${progress.total ? (passed / progress.total) * 100 : 0}%` }} /><div className="bg-fail-mark" style={{ width: `${progress.total ? (failed / progress.total) * 100 : 0}%` }} /><div className="bg-warn" style={{ width: `${progress.total ? (blocked / progress.total) * 100 : 0}%` }} /><div className="bg-run-mark" style={{ width: `${Math.max(0, progress.percent - (progress.total ? ((passed + failed + blocked) / progress.total) * 100 : 0))}%` }} /></div>
              </article>
            );
          })}
        </div>
      )}
      {dialog && <StartRunDialog initialPlanId={dialog.planId} sourceRun={dialog.sourceRun} onClose={() => { setDialog(null); onRequestHandled(); const active = useQaStore.getState().activeRunId; if (active) setSelectedRunId(active); }} />}
    </>
  );
}
