import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileUp,
  History,
  Link2,
  LockKeyhole,
  PlayCircle,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import type { QaView } from "./QaLayout";
import { buttonPrimary, buttonSecondary } from "./Shared";

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
    <section aria-labelledby="next-action-title" className="qa-state-enter overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col p-5 md:p-8">
          <div>
            <h1 id="next-action-title" className="text-2xl font-black tracking-tight text-slate-950">Sua próxima ação</h1>
            <p className="mt-1 text-sm text-slate-600">Para começar a operar, crie ou importe seu primeiro caso de teste.</p>
          </div>

          <div className="my-auto flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
                <FilePlus2 size={27} aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-black text-slate-950">Crie seu primeiro caso</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">Casos são a base de tudo: deles nascem planos versionados e execuções com histórico confiável.</p>
              <div className="mx-auto mt-6 grid max-w-sm gap-2">
                <button type="button" className={`${buttonPrimary} ring-2 ring-cyan-400 ring-offset-2`} onClick={onCreateCase}><Plus size={17} /> Criar primeiro caso</button>
                <button type="button" className={buttonSecondary} onClick={() => onNavigate("cases")}><FileUp size={17} /> Importar dados</button>
              </div>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} className="text-emerald-600" aria-hidden="true" /> Alterações ficam neste dispositivo. Você mantém o controle.</p>
        </div>

        <aside className="border-t border-slate-200 bg-slate-50 p-5 md:p-7 lg:border-l lg:border-t-0" aria-label="Como o QA Flow funciona">
          <h2 className="font-black text-slate-950">Como o QA Flow funciona</h2>
          <ol className="mt-6 space-y-1">
            {steps.map((step, index) => (
              <li key={step.title} className="relative grid grid-cols-[36px_1fr] gap-3 pb-7 last:pb-0">
                {index < steps.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-28px)] w-px bg-slate-300" aria-hidden="true" />}
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300 bg-white text-xs font-black text-cyan-800">{index + 1}</span>
                <div>
                  <h3 className="text-sm font-black text-slate-950">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
            <LockKeyhole size={16} className="mb-2 text-slate-700" aria-hidden="true" />
            <strong className="block text-slate-900">Privacidade por design</strong>
            Seus dados não saem do dispositivo sem uma ação explícita.
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

  const isFirstUse = cases.length === 0 && plans.length === 0 && runs.length === 0;
  if (isFirstUse) return <FirstUse onCreateCase={onCreateCase} onNavigate={onNavigate} />;

  const failedResults = runs.reduce((sum, run) => sum + Object.values(run.results).filter((result) => result.status === "failed").length, 0);
  const activities = [
    ...cases.map((item) => ({ id: `case-${item.id}`, at: item.updatedAt, text: `${item.revision > 1 ? "Caso revisado" : "Caso criado"}: “${item.title}”` })),
    ...plans.map((item) => ({ id: `plan-${item.id}`, at: item.updatedAt, text: `${item.revision > 1 ? "Plano revisado" : "Plano criado"}: “${item.name}”` })),
    ...runs.map((item) => ({ id: `run-${item.id}`, at: item.updatedAt, text: `${item.status === "completed" ? "Execução concluída" : item.status === "aborted" ? "Execução abortada" : "Execução atualizada"}: ${item.id}` })),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 6);

  const risks = [
    staleRefs > 0 ? { title: "Referências desatualizadas", detail: `${staleRefs} vínculo(s) de plano precisam de revisão`, tone: "amber" } : null,
    failedResults > 0 ? { title: "Falhas registradas", detail: `${failedResults} resultado(s) reprovado(s) no histórico`, tone: "rose" } : null,
    activeRuns.length > 0 ? { title: "Execuções sem conclusão", detail: `${activeRuns.length} execução(ões) aberta(s)`, tone: "cyan" } : null,
  ].filter((risk): risk is NonNullable<typeof risk> => Boolean(risk));

  const nextActions = [
    staleRefs > 0
      ? { title: "Revisar referências de plano", detail: `${staleRefs} vínculo(s) em revisão antiga`, target: "plans" as QaView, icon: ClipboardList }
      : { title: "Organizar a fila de demandas", detail: "Priorize o trabalho antes da próxima execução", target: "demands" as QaView, icon: CheckCircle2 },
    activeCases.length > 0
      ? { title: "Revisar casos reutilizáveis", detail: `${activeCases.length} caso(s) ativo(s) no catálogo`, target: "cases" as QaView, icon: BookOpenCheck }
      : { title: "Criar o primeiro caso ativo", detail: "Modele o comportamento antes de montar um plano", target: "cases" as QaView, icon: FilePlus2 },
  ];

  return (
    <div className="qa-state-enter">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Agora</h1>
          <p className="mt-1 text-sm text-slate-600">Retome o trabalho em andamento e trate riscos antes que virem retrabalho.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} aria-hidden="true" /> Salvo localmente</span>
          <button type="button" className={buttonPrimary} onClick={onCreateCase}><Plus size={16} /> Novo caso</button>
        </div>
      </div>

      <div className="grid gap-5 min-[1120px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="current-work-title">
            <div className="border-b border-slate-200 p-5 md:p-6">
              {activeRun && progress ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> Execução ativa</span>
                    <span className="text-xs text-slate-500">Iniciada em {new Date(activeRun.startedAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <h2 id="current-work-title" className="mt-4 text-xl font-black text-slate-950">{activeRun.snapshot.plan.name}</h2>
                  <p className="mt-1 font-mono text-xs font-bold text-cyan-800">{activeRun.id}</p>
                  <div className="mt-5 flex items-center justify-between gap-4 text-xs text-slate-600">
                    <span>Progresso geral</span><strong className="tabular-nums text-slate-900">{progress.executed} / {progress.total} passos</strong>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-label="Progresso geral da execução"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    aria-valuetext={`${progress.executed} de ${progress.total} passos concluídos`}
                  >
                    <div className="h-full rounded-full bg-cyan-500 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
                  </div>
                  {(failedInActiveRun > 0 || blockedInActiveRun > 0) && (
                    <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      <span className="text-xs font-black uppercase tracking-wide">Atenção</span>
                      <p className="mt-1 font-bold">{failedInActiveRun} falha(s) e {blockedInActiveRun} bloqueio(s) exigem revisão.</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" /> Nenhuma execução ativa</span>
                  <h2 id="current-work-title" className="mt-4 text-xl font-black text-slate-950">Prepare a próxima tentativa</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Revise os planos ativos e inicie uma execução quando o conjunto de casos estiver pronto.</p>
                </>
              )}
            </div>
            <div className="p-3">
              <button type="button" className={`${buttonPrimary} w-full ring-2 ring-cyan-400 ring-offset-2`} onClick={() => onNavigate("runs")}>
                <PlayCircle size={17} /> {activeRun ? "Continuar execução" : "Abrir execuções"}<ArrowRight size={16} className="ml-auto" />
              </button>
            </div>
          </section>

          <section aria-labelledby="next-actions-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 id="next-actions-title" className="text-sm font-black text-slate-950">Próximas ações</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {nextActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.title} type="button" onClick={() => onNavigate(action.target)} className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-slate-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon size={17} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{action.title}</strong><span className="mt-0.5 block text-xs text-slate-500">{action.detail}</span></span>
                    <ArrowRight size={15} className="text-slate-400" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-4" aria-label="Saúde operacional">
          <section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Indicadores principais">
            {[
              ["Casos", activeCases.length],
              ["Planos", activePlans.length],
              ["Execuções", activeRuns.length],
            ].map(([label, value], index) => (
              <div key={label} className={`p-4 ${index < 2 ? "border-r border-slate-200" : ""}`}>
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-950">{value}</p>
                <p className="text-xs text-slate-500">ativos</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="risks-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="risks-title" className="text-sm font-black text-slate-950">Riscos e revisões</h2>
              {risks.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-700">{risks.length}</span>}
            </div>
            {risks.length ? (
              <div className="mt-3 divide-y divide-slate-100">
                {risks.map((risk) => (
                  <button key={risk.title} type="button" onClick={() => onNavigate(risk.tone === "amber" ? "plans" : "runs")} className="flex w-full items-start gap-3 py-3 text-left hover:bg-slate-50">
                    <span className={`mt-0.5 rounded-lg p-1.5 ${risk.tone === "amber" ? "bg-amber-50 text-amber-700" : risk.tone === "rose" ? "bg-rose-50 text-rose-700" : "bg-cyan-50 text-cyan-700"}`}><AlertTriangle size={15} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{risk.title}</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500">{risk.detail}</span></span>
                    <ArrowRight size={14} className="mt-1 text-slate-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" /> Nenhum risco imediato identificado.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="activity-title">
            <h2 id="activity-title" className="flex items-center gap-2 text-sm font-black text-slate-950"><History size={16} aria-hidden="true" /> Atividade recente</h2>
            {activities.length ? (
              <ul className="mt-3 space-y-3">
                {activities.map((activity) => (
                  <li key={activity.id} className="grid grid-cols-[1fr_auto] gap-3 text-xs leading-relaxed">
                    <span className="text-slate-600">{activity.text}</span>
                    <time className="tabular-nums text-slate-500" dateTime={activity.at}>{new Date(activity.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-xs text-slate-500">As alterações do workspace aparecerão aqui.</p>}
          </section>

          {activeCases.some((item) => item.automationLinks.length > 0) && (
            <p className="flex items-center gap-2 px-1 text-xs text-slate-500"><Link2 size={14} aria-hidden="true" /> Casos com automação continuam disponíveis para execução manual.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
