import React, { useState } from "react";
import { useTestStore } from "../../store/useTestStore";
import {
  CheckCircle2,
  XCircle,
  PlaySquare,
  MinusCircle,
  PauseCircle,
  Clock,
  Loader2,
  PieChart,
  FileImage,
  MessageSquare,
  Paperclip,
  ChevronDown,
  Trash2,
} from "lucide-react";
import {
  generateExecutiveSummary,
  generateEvidenceReport,
} from "../../utils/generatePdfReport.tsx";
import { EvidenceUploader } from "./EvidenceUploader";
import type { RunStatus } from "../../types";

const STATUS_BORDER: Record<RunStatus, string> = {
  passed: "border-l-emerald-400",
  failed: "border-l-red-400",
  blocked: "border-l-slate-400",
  pending: "border-l-slate-200",
  untested: "border-l-slate-200",
  paused: "border-l-amber-400",
};

const BADGE: Record<RunStatus, string> = {
  passed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
  blocked: "bg-slate-100 text-slate-500 border border-slate-300",
  pending: "bg-slate-50 text-slate-400 border border-slate-200",
  untested: "bg-slate-50 text-slate-400 border border-slate-200",
  paused: "bg-amber-50 text-amber-700 border border-amber-200",
};

const LABEL: Record<RunStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  pending: "Pendente",
  untested: "Não Testado",
  paused: "Pausado",
};

const STEP_CARD: Record<RunStatus, string> = {
  passed: "border-emerald-200 bg-white",
  failed: "border-red-200 bg-white",
  blocked: "border-slate-300 bg-white",
  pending: "border-gray-200 bg-white",
  untested: "border-gray-200 bg-white",
  paused: "border-amber-200 bg-white",
};

const TYPE_COLOR: Record<string, string> = {
  Dado: "text-indigo-600",
  Quando: "text-blue-600",
  Então: "text-violet-600",
  E: "text-slate-400",
};

const EVIDENCE_LABEL: Record<RunStatus, string> = {
  passed: "Comentário",
  failed: "Bug / Evidência",
  blocked: "Observação",
  pending: "Observação",
  untested: "Observação",
  paused: "Motivo da Pausa",
};

const EVIDENCE_LABEL_COLOR: Record<RunStatus, string> = {
  passed: "text-emerald-600",
  failed: "text-red-400",
  blocked: "text-slate-400",
  pending: "text-slate-400",
  untested: "text-slate-400",
  paused: "text-amber-600",
};

const DEFAULT_STEP_STATUS: RunStatus = "pending";

export const TestRunner: React.FC = () => {
  const currentPlan = useTestStore((s) => s.currentPlan);
  const updateStepStatus = useTestStore((s) => s.updateStepStatus);
  const updateStepEvidence = useTestStore((s) => s.updateStepEvidence);
  const clearStepEvidence = useTestStore((s) => s.clearStepEvidence);
  const [generatingType, setGeneratingType] = useState<
    "executive" | "evidence" | null
  >(null);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(
    new Set(),
  );
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [openEvidence, setOpenEvidence] = useState<Set<string>>(new Set());

  const toggleScenario = (id: string) =>
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleComment = (id: string) =>
    setOpenComments((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleEvidence = (id: string) =>
    setOpenEvidence((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleStepStatusChange = (
    scenarioId: string,
    stepId: string,
    currentStatus: RunStatus,
    clickedStatus: RunStatus,
    comment?: string,
  ) => {
    const nextStatus =
      currentStatus === clickedStatus ? DEFAULT_STEP_STATUS : clickedStatus;

    void updateStepStatus(scenarioId, stepId, nextStatus, comment);
  };

  const handleExecutivePDF = async () => {
    if (!currentPlan || generatingType) return;
    setGeneratingType("executive");
    await generateExecutiveSummary(currentPlan);
    setGeneratingType(null);
  };

  const handleEvidencePDF = async () => {
    if (!currentPlan || generatingType) return;
    setGeneratingType("evidence");
    await generateEvidenceReport(currentPlan);
    setGeneratingType(null);
  };

  if (!currentPlan) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
        <PlaySquare size={40} strokeWidth={1.2} />
        <p className="text-lg font-medium">Nenhum plano ativo</p>
        <p className="text-sm">Importe um CSV ou crie um plano para começar.</p>
      </div>
    );
  }

  const scenarios = currentPlan.scenarios;

  // Progresso granular por steps
  const allSteps = scenarios.flatMap((s) => s.steps);
  const totalSteps = allSteps.length;
  const passedSteps = allSteps.filter((s) => s.status === "passed").length;
  const failedSteps = allSteps.filter((s) => s.status === "failed").length;
  const blockedSteps = allSteps.filter((s) => s.status === "blocked").length;
  const pausedSteps = allSteps.filter((s) => s.status === "paused").length;
  const doneSteps = passedSteps + failedSteps + blockedSteps + pausedSteps;
  const progressPct =
    totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const passedPct = totalSteps > 0 ? (passedSteps / totalSteps) * 100 : 0;
  const failedPct = totalSteps > 0 ? (failedSteps / totalSteps) * 100 : 0;
  const blockedPct = totalSteps > 0 ? (blockedSteps / totalSteps) * 100 : 0;
  const pausedPct = totalSteps > 0 ? (pausedSteps / totalSteps) * 100 : 0;

  // Cenários (para o cabeçalho)
  const total = scenarios.length;
  const passed = scenarios.filter((s) => s.status === "passed").length;
  const failed = scenarios.filter((s) => s.status === "failed").length;
  const blocked = scenarios.filter((s) => s.status === "blocked").length;
  const done = passed + failed + blocked;

  return (
    <>
      <div className="space-y-5">
        {/* ── Cabeçalho do plano ── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <span
              className="text-xs font-bold tracking-widest uppercase flex items-center gap-1.5 mb-1"
              style={{ color: "#5A9EB7" }}
            >
              <PlaySquare size={13} /> Em Execução
            </span>
            <h1 className="text-xl font-bold text-slate-900 leading-snug">
              {currentPlan.name}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {currentPlan.meta.project}
              {currentPlan.meta.section ? ` · ${currentPlan.meta.section}` : ""}
            </p>

            {/* Progresso granular por steps */}
            <div className="mt-3 w-72">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mb-1.5">
                {passedSteps > 0 && (
                  <span className="text-emerald-600 font-semibold">
                    {passedSteps} Passed
                  </span>
                )}
                {failedSteps > 0 && (
                  <span className="text-red-500 font-semibold">
                    {failedSteps} Failed
                  </span>
                )}
                {blockedSteps > 0 && (
                  <span className="text-slate-400 font-semibold">
                    {blockedSteps} Blocked
                  </span>
                )}
                {pausedSteps > 0 && (
                  <span className="text-amber-500 font-semibold">
                    {pausedSteps} Paused
                  </span>
                )}
                <span className="text-slate-300 ml-auto">
                  {doneSteps}/{totalSteps} steps · {progressPct}%
                </span>
              </div>
              {/* Barra segmentada por status */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                <div
                  className="h-full bg-emerald-400 transition-all duration-500"
                  style={{ width: `${passedPct}%` }}
                />
                <div
                  className="h-full bg-red-400 transition-all duration-500"
                  style={{ width: `${failedPct}%` }}
                />
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{ width: `${pausedPct}%` }}
                />
                <div
                  className="h-full bg-slate-300 transition-all duration-500"
                  style={{ width: `${blockedPct}%` }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {total} cenários · {done}/{total} concluídos
              </div>
            </div>
          </div>

          <div className="shrink-0 self-start flex flex-col sm:flex-row gap-2">
            {/* Botão 1: Resumo Executivo */}
            <button
              onClick={handleExecutivePDF}
              disabled={!!generatingType}
              title="Gera PDF leve com estatísticas e lista de cenários (sem steps ou imagens)"
              className="flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer shadow hover:opacity-90"
              style={{ backgroundColor: "#5A9EB7" }}
            >
              {generatingType === "executive" ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Gerando...
                </>
              ) : (
                <>
                  <PieChart size={16} /> Resumo Executivo
                </>
              )}
            </button>

            {/* Botão 2: Relatório Técnico de Evidências */}
            <button
              onClick={handleEvidencePDF}
              disabled={!!generatingType}
              title="Gera PDF com passos detalhados e imagens de evidência"
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-wait text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer shadow"
            >
              {generatingType === "evidence" ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Gerando...
                </>
              ) : (
                <>
                  <FileImage size={16} /> Relatório de Evidências
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Cenários (Accordion) ── */}
        {scenarios.map((scenario) => {
          const isExpanded = expandedScenarios.has(scenario.id);
          return (
            <div
              key={scenario.id}
              className={`bg-white border-l-4 border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all ${STATUS_BORDER[scenario.status]}`}
            >
              {/* Accordion header — clicável */}
              <button
                type="button"
                onClick={() => toggleScenario(scenario.id)}
                className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span
                      className="font-mono text-xs border px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "#f0f7fa",
                        color: "#5A9EB7",
                        borderColor: "#b8d8e6",
                      }}
                    >
                      {scenario.caseId}
                    </span>
                    {scenario.suite && (
                      <span className="text-xs text-slate-400">
                        {scenario.suite}
                      </span>
                    )}
                    {scenario.priority && (
                      <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded">
                        {scenario.priority}
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold text-slate-800 text-base">
                    {scenario.title}
                  </h2>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${BADGE[scenario.status]}`}
                  >
                    {LABEL[scenario.status]}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* Accordion body */}
              {isExpanded && (
                <>
                  {/* Pré-condição */}
                  {scenario.precondition && (
                    <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
                      <span className="font-semibold">Pré-condição: </span>
                      {scenario.precondition}
                    </div>
                  )}

                  {/* Steps em cards delimitados */}
                  <div className="border-t border-gray-100 bg-slate-50/50 p-4 space-y-4">
                    {scenario.steps.map((step, idx) => (
                      <div
                        key={step.id}
                        className={`bg-white border rounded-xl p-5 shadow-sm transition-colors ${STEP_CARD[step.status]}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-400 font-mono shrink-0">
                            {idx + 1}
                          </div>

                          <div className="flex-1 min-w-0 grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                Action
                              </p>
                              <div className="text-sm leading-relaxed text-slate-700">
                                <span
                                  className={`inline-block text-xs font-bold mr-1.5 ${TYPE_COLOR[step.type] ?? "text-slate-400"}`}
                                >
                                  {step.type}
                                </span>
                                <span>{step.action}</span>
                              </div>
                            </div>

                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                Expected Result
                              </p>
                              <p className="text-sm text-slate-600 leading-relaxed">
                                {step.expectedResult}
                              </p>
                            </div>
                          </div>
                        </div>

                        <hr className="my-3 border-gray-100" />

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                              Result
                            </p>
                            <div className="flex items-center flex-wrap gap-1.5">
                              {(
                                [
                                  {
                                    s: "passed" as RunStatus,
                                    icon: <CheckCircle2 size={18} />,
                                    active:
                                      "bg-emerald-500 text-white shadow shadow-emerald-300",
                                    idle: "text-slate-300 hover:text-emerald-500 hover:bg-emerald-50",
                                    title: "Passou",
                                  },
                                  {
                                    s: "failed" as RunStatus,
                                    icon: <XCircle size={18} />,
                                    active:
                                      "bg-red-500 text-white shadow shadow-red-300",
                                    idle: "text-slate-300 hover:text-red-500 hover:bg-red-50",
                                    title: "Falhou",
                                  },
                                  {
                                    s: "blocked" as RunStatus,
                                    icon: <MinusCircle size={18} />,
                                    active:
                                      "bg-slate-500 text-white shadow shadow-slate-300",
                                    idle: "text-slate-300 hover:text-slate-500 hover:bg-slate-100",
                                    title: "Bloqueado",
                                  },
                                  {
                                    s: "paused" as RunStatus,
                                    icon: <PauseCircle size={18} />,
                                    active:
                                      "bg-amber-400 text-white shadow shadow-amber-300",
                                    idle: "text-slate-300 hover:text-amber-500 hover:bg-amber-50",
                                    title: "Pausado",
                                  },
                                  {
                                    s: "untested" as RunStatus,
                                    icon: <Clock size={18} />,
                                    active:
                                      "bg-slate-400 text-white shadow shadow-slate-200",
                                    idle: "text-slate-300 hover:text-slate-400 hover:bg-slate-50",
                                    title: "Não Testado",
                                  },
                                ] as const
                              ).map(({ s, icon, active, idle, title }) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() =>
                                    handleStepStatusChange(
                                      scenario.id,
                                      step.id,
                                      step.status,
                                      s,
                                      step.comment,
                                    )
                                  }
                                  title={title}
                                  className={`p-1.5 rounded-full transition-all cursor-pointer ${
                                    step.status === s
                                      ? `${active} scale-110`
                                      : `bg-transparent ${idle}`
                                  }`}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                              Controles
                            </p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleComment(step.id)}
                                title={EVIDENCE_LABEL[step.status]}
                                className={`relative p-1.5 rounded-lg transition-all cursor-pointer ${
                                  openComments.has(step.id)
                                    ? "text-slate-600 bg-slate-100"
                                    : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
                                }`}
                              >
                                <MessageSquare size={14} />
                                {step.comment && (
                                  <span
                                    className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: "#5A9EB7" }}
                                  />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleEvidence(step.id)}
                                title="Evidência / Imagem"
                                className={`relative p-1.5 rounded-lg transition-all cursor-pointer ${
                                  openEvidence.has(step.id)
                                    ? "text-slate-600 bg-slate-100"
                                    : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
                                }`}
                              >
                                <Paperclip size={14} />
                                {step.evidence && (
                                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {openComments.has(step.id) && (
                          <div className="pt-3">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                              <span
                                className={`text-xs font-semibold uppercase tracking-wider ${EVIDENCE_LABEL_COLOR[step.status]}`}
                              >
                                {EVIDENCE_LABEL[step.status]}
                              </span>
                              {step.comment?.trim() && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStepStatus(
                                      scenario.id,
                                      step.id,
                                      step.status,
                                      undefined,
                                    )
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={12} />
                                  Excluir comentário
                                </button>
                              )}
                            </div>
                            <textarea
                              key={`${step.id}-${step.comment ?? ""}`}
                              placeholder="Adicione um comentário ou observação sobre este passo..."
                              defaultValue={step.comment}
                              onBlur={(e) =>
                                updateStepStatus(
                                  scenario.id,
                                  step.id,
                                  step.status,
                                  e.target.value.trim() || undefined,
                                )
                              }
                              rows={2}
                              className="w-full text-sm px-3 py-2 border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-slate-300/40 resize-none text-slate-700 placeholder-slate-300"
                            />
                          </div>
                        )}

                        {openEvidence.has(step.id) && (
                          <div className="pt-3">
                            <EvidenceUploader
                              evidence={step.evidence}
                              onSave={(b64) =>
                                updateStepEvidence(scenario.id, step.id, b64)
                              }
                              onClear={() =>
                                clearStepEvidence(scenario.id, step.id)
                              }
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};
