import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  FileUp,
  History,
  Link2,
  LockKeyhole,
  PlayCircle,
  Plus,
  ShieldCheck,
  Timer,
  Zap,
} from "lucide-react";
import { runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import type { QaView } from "./QaLayout";
import { MetricCard, PageHeader, buttonPrimary, buttonSecondary } from "./Shared";

interface DashboardScreenProps {
  onNavigate: (view: QaView) => void;
  onCreateCase: () => void;
}

function FirstUse({ onCreateCase, onNavigate }: DashboardScreenProps) {
  const steps = [
    { title: "Casos", description: "Modele comportamentos reutilizáveis com passos e resultados claros." },
    { title: "Planos", description: "Agrupe revisões de casos para organizar uma finalidade específica." },
    { title: "Execuções", description: "Registre resultados, evidências e riscos sem alterar o histórico." },
  ];

  return (
    <section aria-labelledby="next-action-title" className="qa-state-enter overflow-hidden rounded-2xl border border-hairline bg-raised shadow-sm">
      <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_clamp(22.5rem,26vw,30rem)]">
        <div className="flex flex-col p-5 md:p-8">
          <div>
            <h1 id="next-action-title" className="text-2xl font-black tracking-[-0.035em] text-body">Sua próxima ação</h1>
            <p className="mt-1 text-sm text-subtle">Para começar a operar, crie ou importe seu primeiro caso de teste.</p>
          </div>
          <div className="my-auto flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-xl px-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pass-tint text-pass ring-1 ring-pass-line"><FilePlus2 size={27} /></div>
              <h2 className="mt-5 text-xl font-bold text-body">Crie seu primeiro caso</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-subtle">Casos são a base de tudo: deles nascem planos versionados e execuções com histórico confiável.</p>
              <div className="mx-auto mt-6 grid max-w-sm gap-2">
                <button type="button" className={buttonPrimary} onClick={onCreateCase}><Plus size={17} /> Criar primeiro caso</button>
                <button type="button" className={buttonSecondary} onClick={() => onNavigate("cases")}><FileUp size={17} /> Importar dados</button>
              </div>
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck size={15} className="text-pass" /> Alterações ficam neste dispositivo. Você mantém o controle.</p>
        </div>
        <aside className="border-t border-hairline bg-surface p-5 md:p-7 lg:border-l lg:border-t-0" aria-label="Como o QA Flow funciona">
          <h2 className="font-bold text-body">Como o QA Flow funciona</h2>
          <ol className="mt-6 space-y-1">
            {steps.map((step, index) => (
              <li key={step.title} className="relative grid grid-cols-[36px_1fr] gap-3 pb-7 last:pb-0">
                {index < steps.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-28px)] w-px bg-hairline-strong" aria-hidden="true" />}
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-pass-line bg-raised text-xs font-bold text-pass">{index + 1}</span>
                <div><h3 className="text-sm font-bold text-body">{step.title}</h3><p className="mt-1 text-xs leading-relaxed text-subtle">{step.description}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-xl border border-hairline bg-raised p-4 text-xs leading-relaxed text-subtle">
            <LockKeyhole size={16} className="mb-2 text-control" /><strong className="block text-body">Privacidade por design</strong>Seus dados não saem do dispositivo sem uma ação explícita.
          </div>
        </aside>
      </div>
    </section>
  );
}

export function DashboardScreen({ onNavigate, onCreateCase }: DashboardScreenProps) {
  const cases = useQaStore((state) => state.cases);
  const plans = useQaStore((state) => state.plans);
  const runs = useQaStore((state) => state.runs);
  const demands = useQaStore((state) => state.demands);
  const demandColumns = useQaStore((state) => state.demandColumns);

  const activeCases = cases.filter((item) => item.status === "active");
  const activePlans = plans.filter((item) => item.status === "active");
  const activeRuns = runs.filter((item) => item.status === "in_progress" || item.status === "paused");
  const activeRun = [...activeRuns].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const progress = activeRun ? runProgress(activeRun) : null;
  const failedInActiveRun = activeRun ? Object.values(activeRun.results).filter((result) => result.status === "failed").length : 0;
  const blockedInActiveRun = activeRun ? Object.values(activeRun.results).filter((result) => result.status === "blocked").length : 0;
  const staleRefs = activePlans.reduce((sum, plan) => sum + plan.caseRefs.filter((reference) => {
    const current = cases.find((item) => item.id === reference.caseId);
    return !current || current.revision !== reference.caseRevision;
  }).length, 0);
  const isFirstUse = cases.length === 0 && plans.length === 0 && runs.length === 0 && demands.length === 0;
  if (isFirstUse) return <FirstUse onCreateCase={onCreateCase} onNavigate={onNavigate} />;

  const failedResults = runs.reduce((sum, run) => sum + Object.values(run.results).filter((result) => result.status === "failed").length, 0);
  const automationCount = activeCases.filter((item) => item.automationLinks.length > 0).length;
  const automationCoverage = activeCases.length ? Math.round((automationCount / activeCases.length) * 100) : 0;
  const doneColumnIds = new Set(demandColumns.filter((column) => column.semantic === "done").map((column) => column.id));
  const openDemands = demands.filter((demand) => !doneColumnIds.has(demand.columnId));
  const activities = [
    ...cases.map((item) => ({ id: `case-${item.id}`, at: item.updatedAt, text: `${item.revision > 1 ? "Caso revisado" : "Caso criado"}: “${item.title}”` })),
    ...plans.map((item) => ({ id: `plan-${item.id}`, at: item.updatedAt, text: `${item.revision > 1 ? "Plano revisado" : "Plano criado"}: “${item.name}”` })),
    ...runs.map((item) => ({ id: `run-${item.id}`, at: item.updatedAt, text: `${item.status === "completed" ? "Execução concluída" : item.status === "aborted" ? "Execução abortada" : "Execução atualizada"}: ${item.snapshot.plan.name}` })),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 5);
  const risks = [
    staleRefs > 0 ? { title: "Referências desatualizadas", detail: `${staleRefs} vínculo(s) de plano precisam de revisão`, target: "plans" as QaView, tone: "warn" } : null,
    failedResults > 0 ? { title: "Falhas registradas", detail: `${failedResults} resultado(s) reprovado(s) no histórico`, target: "runs" as QaView, tone: "fail" } : null,
    activeRuns.length > 0 ? { title: "Execuções em aberto", detail: `${activeRuns.length} tentativa(s) ainda não concluída(s)`, target: "runs" as QaView, tone: "run" } : null,
  ].filter((risk): risk is NonNullable<typeof risk> => Boolean(risk));
  const orderedColumns = [...demandColumns].sort((left, right) => left.order - right.order);
  const maxColumnCount = Math.max(1, ...orderedColumns.map((column) => demands.filter((demand) => demand.columnId === column.id).length));

  return (
    <div className="qa-state-enter">
      <PageHeader
        title="Visão geral"
        description="Centralize o trabalho em andamento, acompanhe a cobertura e trate riscos antes que virem retrabalho."
        actions={<><span role="status" className="inline-flex items-center gap-1.5 px-2 text-xs font-bold text-pass"><CheckCircle2 size={15} /> Salvo localmente</span><button type="button" className={buttonPrimary} onClick={onCreateCase}><Plus size={16} /> Novo caso</button></>}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores do workspace">
        <MetricCard label="Demandas abertas" value={openDemands.length} detail={`${demands.length - openDemands.length} concluída(s) no quadro`} icon={<ClipboardCheck size={18} />} />
        <MetricCard label="Casos ativos" value={activeCases.length} detail={`${cases.length} caso(s) no catálogo`} icon={<BookOpenCheck size={18} />} tone="pass" />
        <MetricCard label="Cobertura de automação" value={`${automationCoverage}%`} detail={`${automationCount} de ${activeCases.length} caso(s) vinculados`} icon={<Zap size={18} />} tone="pass" />
        <MetricCard label="Execuções em andamento" value={activeRuns.length} detail={`${runs.length} tentativa(s) no histórico`} icon={<Timer size={18} />} tone={activeRuns.length ? "run" : "neutral"} />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-hairline bg-raised shadow-[0_10px_30px_rgb(15_23_42/0.04)]" aria-labelledby="current-work-title">
        <div className="p-5 md:p-6">
          {activeRun && progress ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-xs font-bold text-pass"><span className="h-2 w-2 rounded-full bg-pass-mark" /> Execução ativa</span><span className="text-xs text-muted">Atualizada em {new Date(activeRun.updatedAt).toLocaleString("pt-BR")}</span></div>
              <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div><h2 id="current-work-title" className="text-xl font-bold text-body">{activeRun.snapshot.plan.name}</h2><p className="mt-1 text-sm text-subtle">{activeRun.context.environment || "Ambiente não informado"} · {activeRun.context.tester || "Sem responsável"}</p></div>
                <strong className="text-sm tabular-nums text-body">{progress.executed} de {progress.total} passos · {progress.percent}%</strong>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-shell" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-pass-mark transition-[width]" style={{ width: `${progress.percent}%` }} /></div>
              {(failedInActiveRun > 0 || blockedInActiveRun > 0) && <p className="mt-3 text-xs font-bold text-fail">{failedInActiveRun} falha(s) · {blockedInActiveRun} bloqueio(s) exigem revisão</p>}
            </>
          ) : (
            <><span className="inline-flex items-center gap-2 text-xs font-bold text-muted"><span className="h-2 w-2 rounded-full bg-faint" /> Nenhuma execução ativa</span><h2 id="current-work-title" className="mt-4 text-xl font-bold text-body">Prepare a próxima tentativa</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-subtle">Revise os planos ativos e inicie uma execução quando o conjunto de casos estiver pronto.</p></>
          )}
        </div>
        <div className="border-t border-hairline p-3"><button type="button" className={`${buttonPrimary} w-full`} onClick={() => onNavigate("runs")}><PlayCircle size={17} /> {activeRun ? "Continuar execução" : "Abrir execuções"}<ArrowRight size={16} className="ml-auto" /></button></div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-[0_8px_24px_rgb(15_23_42/0.035)]" aria-labelledby="pipeline-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="pipeline-title" className="font-bold text-body">Pipeline de demandas</h2><p className="mt-1 text-xs text-muted">Distribuição atual do trabalho de qualidade.</p></div><button type="button" className="text-xs font-bold text-pass hover:underline" onClick={() => onNavigate("demands")}>Abrir quadro</button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {orderedColumns.map((column) => {
              const count = demands.filter((demand) => demand.columnId === column.id).length;
              return <div key={column.id} className="rounded-xl bg-surface p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-subtle">{column.name}</span><strong className="text-sm tabular-nums text-body">{count}</strong></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hairline"><div className={`h-full rounded-full ${column.semantic === "blocked" ? "bg-fail-mark" : column.semantic === "done" ? "bg-pass-mark" : column.semantic === "active" ? "bg-run-mark" : "bg-faint"}`} style={{ width: `${Math.max(count ? 12 : 0, (count / maxColumnCount) * 100)}%` }} /></div></div>;
            })}
          </div>
          <div className="mt-5 border-t border-hairline pt-5"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-subtle">Automação do catálogo ativo</span><strong className="tabular-nums text-body">{automationCount} automatizado(s) · {activeCases.length - automationCount} manuais</strong></div><div className="mt-3 flex h-2 overflow-hidden rounded-full bg-shell"><div className="bg-pass-mark" style={{ width: `${automationCoverage}%` }} /><div className="flex-1 bg-hairline-strong" /></div></div>
        </section>

        <aside className="space-y-5" aria-label="Riscos e atividade">
          <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-[0_8px_24px_rgb(15_23_42/0.035)]" aria-labelledby="risks-title">
            <div className="flex items-center justify-between gap-3"><h2 id="risks-title" className="font-bold text-body">Riscos e revisões</h2>{risks.length > 0 && <span className="rounded-full bg-fail-tint px-2 py-0.5 text-xs font-bold text-fail">{risks.length}</span>}</div>
            {risks.length ? <div className="mt-3 divide-y divide-shell">{risks.map((risk) => <button key={risk.title} type="button" onClick={() => onNavigate(risk.target)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-surface"><span className={`mt-0.5 rounded-lg p-1.5 ${risk.tone === "warn" ? "bg-warn-tint text-warn" : risk.tone === "fail" ? "bg-fail-tint text-fail" : "bg-run-tint text-run"}`}><AlertTriangle size={15} /></span><span className="min-w-0 flex-1"><strong className="block text-xs text-body">{risk.title}</strong><span className="mt-1 block text-xs leading-relaxed text-muted">{risk.detail}</span></span><ArrowRight size={14} className="mt-1 text-faint" /></button>)}</div> : <p className="mt-4 flex items-center gap-2 rounded-xl bg-pass-tint p-3 text-xs font-bold text-pass"><CheckCircle2 size={16} /> Nenhum risco imediato identificado.</p>}
          </section>
          <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-[0_8px_24px_rgb(15_23_42/0.035)]" aria-labelledby="activity-title">
            <h2 id="activity-title" className="flex items-center gap-2 font-bold text-body"><History size={16} /> Atividade recente</h2>
            {activities.length ? <ul className="mt-4 space-y-3">{activities.map((activity) => <li key={activity.id} className="grid grid-cols-[1fr_auto] gap-3 text-xs leading-relaxed"><span className="text-subtle">{activity.text}</span><time className="tabular-nums text-muted" dateTime={activity.at}>{new Date(activity.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time></li>)}</ul> : <p className="mt-3 text-xs text-muted">As alterações do workspace aparecerão aqui.</p>}
          </section>
          {activeCases.some((item) => item.automationLinks.length > 0) && <p className="flex items-center gap-2 px-1 text-xs text-muted"><Link2 size={14} /> Casos automatizados continuam disponíveis para execução manual.</p>}
        </aside>
      </div>
    </div>
  );
}
