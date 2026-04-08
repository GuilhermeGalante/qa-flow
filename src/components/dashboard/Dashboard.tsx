import React, { useState } from "react";
import {
  PlayCircle,
  ChevronDown,
  ClipboardList,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Hourglass,
  PauseCircle,
  Trash2,
} from "lucide-react";
import { useTestStore } from "../../store/useTestStore";
import type { RunStatus, TestPlan } from "../../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeProgress(plan: TestPlan) {
  const steps = plan.scenarios.flatMap((s) => s.steps);
  const total = steps.length;
  const passed = steps.filter((s) => s.status === "passed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const blocked = steps.filter((s) => s.status === "blocked").length;
  const paused = steps.filter((s) => s.status === "paused").length;
  const done = passed + failed + blocked + paused;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, passed, failed, blocked, paused, done, pct };
}

// ── Mapas de estilo ───────────────────────────────────────────────────────────

const STATUS_ICON: Record<RunStatus, React.ReactNode> = {
  passed: <CheckCircle2 size={14} className="text-emerald-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
  blocked: <MinusCircle size={14} className="text-slate-400" />,
  pending: <Clock size={14} className="text-slate-300" />,
  untested: <Hourglass size={14} className="text-slate-300" />,
  paused: <PauseCircle size={14} className="text-amber-400" />,
};

const STATUS_BADGE: Record<RunStatus, string> = {
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  blocked: "bg-slate-100 text-slate-500 border-slate-300",
  pending: "bg-slate-50 text-slate-400 border-slate-200",
  untested: "bg-slate-50 text-slate-400 border-slate-200",
  paused: "bg-amber-50 text-amber-600 border-amber-200",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  pending: "Pending",
  untested: "Untested",
  paused: "Paused",
};

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  onRunPlan: (plan: TestPlan) => void;
}

export const Dashboard: React.FC<Props> = ({ onRunPlan }) => {
  const plans = useTestStore((s) => s.plans);
  const setCurrentPlan = useTestStore((s) => s.setCurrentPlan);
  const removePlan = useTestStore((s) => s.removePlan);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const handleRun = async (plan: TestPlan) => {
    await setCurrentPlan(plan);
    onRunPlan(plan);
  };

  const handleDelete = async (testId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir o plano de teste? Esta ação é irreversível.",
    );

    if (!confirmed) {
      return;
    }

    await removePlan(testId);

    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(testId);
      return next;
    });
  };

  // ── Estado vazio ────────────────────────────────────────────────────────────
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
        <ClipboardList size={48} strokeWidth={1.2} />
        <p className="text-xl font-semibold text-slate-500">
          Nenhum plano de teste
        </p>
        <p className="text-sm text-slate-400">
          Importe um CSV ou crie um plano manualmente para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tabela header */}
      <div
        className="grid text-xs font-bold uppercase tracking-widest text-slate-400 px-4 py-2"
        style={{ gridTemplateColumns: "1fr 160px 180px 110px 120px 56px" }}
      >
        <span>Name</span>
        <span>Project</span>
        <span className="text-center">Tested</span>
        <span className="text-center">ID</span>
        <span className="text-center">Status</span>
        <span className="text-center">Ações</span>
      </div>

      {plans.map((plan) => {
        const isOpen = expanded.has(plan.id);
        const prog = computeProgress(plan);
        const dateStr = new Date(plan.createdAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        // Cor da barra: vermelho se houver falha, verde caso contrário
        const barColor =
          prog.failed > 0
            ? `linear-gradient(90deg, #2db39e ${Math.round((prog.passed / (prog.total || 1)) * 100)}%, #ef4444 ${Math.round(((prog.passed + prog.failed) / (prog.total || 1)) * 100)}%)`
            : "#2db39e";

        return (
          <div
            key={plan.id}
            className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
          >
            {/* Linha do plano (accordion header) */}
            <div
              className="grid items-center px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
              style={{ gridTemplateColumns: "1fr 160px 180px 110px 120px 56px" }}
              onClick={() => toggleExpand(plan.id)}
            >
              {/* Nome + botão Run */}
              <div className="flex items-center gap-2 min-w-0 pr-3">
                <ChevronDown
                  size={15}
                  className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">
                    {plan.name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {plan.meta.createdBy} · {dateStr}
                  </p>
                </div>
                {/* Botão Run — intercepta o click do accordion */}
                <button
                  type="button"
                  title="Iniciar execução"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRun(plan);
                  }}
                  className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-all shadow-sm hover:opacity-90"
                  style={{ backgroundColor: "#5A9EB7" }}
                >
                  <PlayCircle size={14} />
                  Run
                </button>
              </div>

              {/* Project */}
              <span className="text-sm text-slate-500 truncate">
                {plan.meta.project}
              </span>

              {/* Barra de progresso */}
              <div className="px-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${prog.pct}%`, background: barColor }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right">
                    {prog.pct}%
                  </span>
                </div>
              </div>

              {/* ID */}
              <span
                className="text-xs font-mono text-center"
                style={{ color: "#5A9EB7" }}
              >
                TP{plan.id.slice(0, 4).toUpperCase()}
              </span>

              {/* Status geral */}
              <div className="flex justify-center">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                  Open
                </span>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  title="Excluir plano de teste"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(plan.id);
                  }}
                  className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Accordion: lista de cenários */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {/* Sub-header */}
                <div
                  className="grid text-[11px] font-bold uppercase tracking-widest text-slate-400 bg-gray-50 px-6 py-1.5 border-b border-gray-100"
                  style={{ gridTemplateColumns: "80px 1fr 130px 90px" }}
                >
                  <span>ID</span>
                  <span>Cenário</span>
                  <span className="text-center">Test Run Status</span>
                  <span className="text-center">Suite</span>
                </div>

                {plan.scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="grid items-center px-6 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors"
                    style={{ gridTemplateColumns: "80px 1fr 130px 90px" }}
                  >
                    {/* caseId */}
                    <span
                      className="font-mono text-xs border px-2 py-0.5 rounded w-fit"
                      style={{
                        color: "#5A9EB7",
                        backgroundColor: "#f0f7fa",
                        borderColor: "#b8d8e6",
                      }}
                    >
                      {scenario.caseId}
                    </span>

                    {/* Título */}
                    <span className="text-sm text-slate-700 truncate pr-4">
                      {scenario.title}
                    </span>

                    {/* Status badge */}
                    <div className="flex justify-center items-center gap-1.5">
                      {STATUS_ICON[scenario.status]}
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[scenario.status]}`}
                      >
                        {STATUS_LABEL[scenario.status]}
                      </span>
                    </div>

                    {/* Suite */}
                    <span className="text-xs text-slate-400 text-center truncate">
                      {scenario.suite || "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
