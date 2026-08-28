import { useMemo, useState } from "react";
import { Play, RotateCcw, Search } from "lucide-react";
import type { RunContext, RunStatus, TestRun } from "../../domain/types";
import { runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { SegmentedControl, type SegmentedOption } from "../../ui/SegmentedControl";
import { Select, type SelectOption } from "../../ui/Select";
import { useToast } from "../../ui/ToastProvider";
import { EmptyState, Notice, PageHeader, StatusBadge, buttonPrimary, buttonSecondary, inputClass, runStatusLabel } from "./Shared";
import { RunRunner } from "./RunRunner";

const blankContext: RunContext = { environment: "", build: "", platform: "", device: "", browser: "", tester: "", notes: "" };

function StartRunDialog({ initialPlanId, sourceRun, onClose }: { initialPlanId?: string; sourceRun?: TestRun; onClose: () => void }) {
  const plans = useQaStore((state) => state.plans);
  const cases = useQaStore((state) => state.cases);
  const startRun = useQaStore((state) => state.startRun);
  const toast = useToast();
  const [planId, setPlanId] = useState(initialPlanId ?? sourceRun?.planId ?? plans.find((item) => item.status === "active")?.id ?? "");
  const [context, setContext] = useState<RunContext>(sourceRun ? { ...sourceRun.context, notes: sourceRun.context.notes ? `${sourceRun.context.notes}\nReexecução da tentativa ${sourceRun.attempt}.` : `Reexecução da tentativa ${sourceRun.attempt}.` } : blankContext);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const selectedPlan = plans.find((item) => item.id === planId);
  const stale = selectedPlan?.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.revision !== reference.caseRevision).length ?? 0;
  const inactive = selectedPlan?.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.status !== "active").length ?? 0;

  // A lista de planos cresce, e cada opção carrega revisão e contagem: busca e segunda
  // linha existem justamente porque o `<select>` nativo achatava isso em uma linha só.
  const planOptions = useMemo<SelectOption[]>(() => plans
    .filter((plan) => plan.status === "active")
    .map((plan) => ({
      value: plan.id,
      label: plan.name,
      hint: `${plan.project || "Sem projeto"} · ${plan.caseRefs.length} caso(s) · rev. ${plan.revision}`,
    })), [plans]);

  const submit = async () => {
    if (!context.environment.trim() || !context.tester.trim()) {
      setError("Ambiente e responsável são obrigatórios.");
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
      title={sourceRun ? "Nova tentativa" : "Iniciar execução"}
      description="O plano e os casos atuais serão congelados em um snapshot."
      size="lg"
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button>
          <Button variant="primary" loading={starting} loadingLabel="Iniciando…" disabled={!planId || stale > 0 || inactive > 0} icon={<Play size={16} />} onClick={() => void submit()}>Iniciar tentativa</Button>
        </>
      )}
    >
      {error && <div className="mb-4"><Notice tone="error" onDismiss={() => setError("")}>{error}</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="text-sm font-bold text-control md:col-span-2">
          <label htmlFor="run-plan">Plano</label>
          <Select
            id="run-plan"
            className="mt-1"
            ariaLabel="Plano da execução"
            value={planId}
            onChange={setPlanId}
            options={planOptions}
            disabled={Boolean(sourceRun)}
            searchable={planOptions.length > 8}
            searchPlaceholder="Buscar plano…"
            placeholder="Selecione"
            emptyLabel="Nenhum plano ativo encontrado."
          />
        </div>
        {selectedPlan && <div className="rounded-xl bg-surface p-3 text-xs text-subtle md:col-span-2"><strong>{selectedPlan.caseRefs.length} caso(s)</strong> · plano rev. {selectedPlan.revision}{stale > 0 && <span className="ml-2 font-bold text-warn">{stale} referência(s) precisam ser revisadas.</span>}{inactive > 0 && <span className="ml-2 font-bold text-explore">{inactive} caso(s) não estão ativos.</span>}</div>}
        <label className="text-sm font-bold text-control">Ambiente <span className="text-fail">*</span><input className={`${inputClass} mt-1`} value={context.environment} onChange={(event) => setContext({ ...context, environment: event.target.value })} placeholder="Homologação, staging..." /></label>
        <label className="text-sm font-bold text-control">Responsável <span className="text-fail">*</span><input className={`${inputClass} mt-1`} value={context.tester} onChange={(event) => setContext({ ...context, tester: event.target.value })} /></label>
        <label className="text-sm font-bold text-control">Build<input className={`${inputClass} mt-1`} value={context.build} onChange={(event) => setContext({ ...context, build: event.target.value })} /></label>
        <label className="text-sm font-bold text-control">Plataforma<input className={`${inputClass} mt-1`} value={context.platform} onChange={(event) => setContext({ ...context, platform: event.target.value })} placeholder="Web, Android, iOS..." /></label>
        <label className="text-sm font-bold text-control">Dispositivo<input className={`${inputClass} mt-1`} value={context.device} onChange={(event) => setContext({ ...context, device: event.target.value })} /></label>
        <label className="text-sm font-bold text-control">Navegador<input className={`${inputClass} mt-1`} value={context.browser} onChange={(event) => setContext({ ...context, browser: event.target.value })} /></label>
        <label className="text-sm font-bold text-control md:col-span-2">Notas<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={context.notes} onChange={(event) => setContext({ ...context, notes: event.target.value })} /></label>
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

  const matching = useMemo(() => runs.filter((run) =>
    `${run.id} ${run.snapshot.plan.name} ${run.context.environment} ${run.context.tester}`.toLowerCase().includes(query.toLowerCase())), [query, runs]);
  const filtered = matching.filter((run) => status === "all" || run.status === status);

  const statusOptions: SegmentedOption<RunStatus | "all">[] = [
    { value: "all", label: "Todos", count: matching.length },
    ...(Object.keys(runStatusLabel) as RunStatus[])
      .map((value) => ({ value, label: runStatusLabel[value], count: matching.filter((run) => run.status === value).length }))
      // Um status sem nenhuma execução só ocuparia espaço no filtro.
      .filter((option) => option.count > 0 || option.value === status),
  ];

  if (selectedRun) return <RunRunner run={selectedRun} onBack={() => { setSelectedRunId(null); setActiveRun(null); }} />;

  return (
    <>
      <PageHeader title="Execuções" description="Cada tentativa é independente, preserva o snapshot utilizado e permanece disponível para auditoria e relatórios." actions={<button type="button" className={buttonPrimary} onClick={() => setDialog({})}><Play size={17} /> Nova execução</button>} />
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-hairline bg-raised p-4 shadow-sm lg:flex-row lg:items-center">
        <label className="relative lg:w-80"><span className="sr-only">Buscar execuções</span><Search className="absolute left-3 top-3 text-faint" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar plano, ambiente, responsável ou ID" /></label>
        <SegmentedControl size="sm" ariaLabel="Filtrar status" value={status} onChange={setStatus} options={statusOptions} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma execução encontrada" description={runs.length ? "Ajuste a busca ou o filtro." : "Inicie uma execução a partir de um plano ativo e atualizado."} action={!runs.length ? <button type="button" className={buttonPrimary} onClick={() => setDialog({})}>Iniciar primeira tentativa</button> : undefined} />
      ) : (
        <div className="space-y-3">
          {filtered.map((run) => {
            const progress = runProgress(run);
            return (
              <article key={run.id} className="flex flex-col gap-4 rounded-2xl border border-hairline bg-raised p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedRunId(run.id); setActiveRun(run.id); }}>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs font-bold text-muted">Tentativa {run.attempt}</span><span className="text-xs text-faint">snapshot do plano rev. {run.planRevision}</span></div>
                  <h2 className="mt-2 truncate text-lg font-bold text-body">{run.snapshot.plan.name}</h2>
                  <p className="mt-1 text-xs text-muted">{run.context.environment || "Sem ambiente"} · {run.context.tester || "Sem responsável"} · atualizado em {new Date(run.updatedAt).toLocaleString("pt-BR")}</p>
                  <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-shell"><div className="h-full rounded-full bg-run-mark" style={{ width: `${progress.percent}%` }} /></div><span className="text-xs font-bold tabular-nums text-muted">{progress.percent}%</span></div>
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
