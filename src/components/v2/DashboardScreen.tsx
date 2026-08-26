import { AlertTriangle, ArrowRight, BookOpenCheck, ClipboardList, Link2, PlayCircle } from "lucide-react";
import { runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import type { QaView } from "./QaLayout";
import { EmptyState, PageHeader, StatusBadge, buttonPrimary, buttonSecondary, runStatusLabel } from "./Shared";

export function DashboardScreen({ onNavigate }: { onNavigate: (view: QaView) => void }) {
  const cases = useQaStore((state) => state.cases);
  const plans = useQaStore((state) => state.plans);
  const runs = useQaStore((state) => state.runs);

  const activeCases = cases.filter((item) => item.status === "active");
  const activePlans = plans.filter((item) => item.status === "active");
  const activeRuns = runs.filter((item) => item.status === "in_progress" || item.status === "paused");
  const automated = activeCases.filter((item) => item.automationLinks.length > 0).length;
  const staleRefs = activePlans.reduce((sum, plan) => sum + plan.caseRefs.filter((reference) => {
    const current = cases.find((item) => item.id === reference.caseId);
    return !current || current.revision !== reference.caseRevision;
  }).length, 0);
  const recentRuns = [...runs]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 5);

  const metrics = [
    { label: "Casos ativos", value: activeCases.length, icon: BookOpenCheck, detail: `${cases.length} no catálogo` },
    { label: "Planos ativos", value: activePlans.length, icon: ClipboardList, detail: `${staleRefs} referência(s) desatualizada(s)` },
    { label: "Execuções abertas", value: activeRuns.length, icon: PlayCircle, detail: `${runs.length} tentativa(s) no histórico` },
    { label: "Cobertura automatizada", value: `${activeCases.length ? Math.round((automated / activeCases.length) * 100) : 0}%`, icon: Link2, detail: `${automated} caso(s) com vínculo` },
  ];

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Acompanhe o catálogo, a saúde dos planos e cada tentativa sem perder o histórico das definições usadas."
        actions={(
          <>
            <button type="button" className={buttonSecondary} onClick={() => onNavigate("cases")}>Novo caso</button>
            <button type="button" className={buttonPrimary} onClick={() => onNavigate("runs")}>Iniciar execução</button>
          </>
        )}
      />

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{metric.value}</p>
                </div>
                <span className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Icon size={20} /></span>
              </div>
              <p className="mt-3 text-xs text-slate-500">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      {staleRefs > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-bold">Há referências de plano em revisões antigas</p>
            <p className="mt-1 text-sm">Isso não quebra o histórico. Abra o plano para revisar e atualizar explicitamente as referências.</p>
          </div>
          <button type="button" className="text-sm font-bold underline" onClick={() => onNavigate("plans")}>Revisar</button>
        </div>
      )}

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Execuções recentes</h2>
          {recentRuns.length > 0 && <button type="button" className="flex items-center gap-1 text-sm font-bold text-cyan-700" onClick={() => onNavigate("runs")}>Ver histórico <ArrowRight size={15} /></button>}
        </div>
        {recentRuns.length === 0 ? (
          <EmptyState
            title="Seu workspace ainda está vazio"
            description="Cadastre ou importe casos, monte um plano com referências e inicie a primeira tentativa."
            action={<button type="button" className={buttonPrimary} onClick={() => onNavigate("cases")}>Começar pela biblioteca</button>}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {recentRuns.map((run) => {
                const progress = runProgress(run);
                return (
                  <button key={run.id} type="button" onClick={() => onNavigate("runs")} className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">{run.snapshot.plan.name} · tentativa {run.attempt}</p>
                      <p className="mt-1 text-xs text-slate-500">{run.context.environment || "Ambiente não informado"} · {new Date(run.updatedAt).toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-500">{progress.percent}%</span>
                      <StatusBadge value={run.status} label={runStatusLabel[run.status]} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
