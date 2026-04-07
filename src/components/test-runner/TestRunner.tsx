import React, { useState } from "react";
import { useTestStore } from "../../store/useTestStore";
import {
  CheckCircle2,
  XCircle,
  PlaySquare,
  MinusCircle,
  Loader2,
  PieChart,
  FileImage,
  MessageSquare,
  Paperclip,
  ChevronDown,
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
};

const BADGE: Record<RunStatus, string> = {
  passed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
  blocked: "bg-slate-100 text-slate-500 border border-slate-300",
  pending: "bg-slate-50 text-slate-400 border border-slate-200",
};

const LABEL: Record<RunStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  pending: "Pendente",
};

const STEP_ROW: Record<RunStatus, string> = {
  passed: "bg-emerald-50/30",
  failed: "bg-red-50/30",
  blocked: "bg-slate-50",
  pending: "bg-white",
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
};

const EVIDENCE_LABEL_COLOR: Record<RunStatus, string> = {
  passed: "text-emerald-600",
  failed: "text-red-400",
  blocked: "text-slate-400",
  pending: "text-slate-400",
};

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
  const total = scenarios.length;
  const passed = scenarios.filter((s) => s.status === "passed").length;
  const failed = scenarios.filter((s) => s.status === "failed").length;
  const blocked = scenarios.filter((s) => s.status === "blocked").length;
  const done = passed + failed + blocked;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Cabeçalho do plano ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-widest text-blue-600 uppercase flex items-center gap-1.5 mb-1">
            <PlaySquare size={13} /> Em Execução
          </span>
          <h1 className="text-xl font-bold text-slate-900 leading-snug">
            {currentPlan.name}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {currentPlan.meta.project}
            {currentPlan.meta.section ? ` · ${currentPlan.meta.section}` : ""}
          </p>

          {/* Progresso */}
          <div className="mt-3 w-72">
            <div className="flex gap-4 text-xs text-slate-500 mb-1">
              <span className="text-emerald-600 font-semibold">
                {passed} Passed
              </span>
              <span className="text-red-500 font-semibold">
                {failed} Failed
              </span>
              <span className="text-slate-400 font-semibold">
                {blocked} Blocked
              </span>
              <span className="text-slate-300 ml-auto">
                {done}/{total}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background:
                    failed > 0
                      ? "linear-gradient(90deg, #2db39e, #ef4444)"
                      : "#2db39e",
                }}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 self-start flex flex-col sm:flex-row gap-2">
          {/* Botão 1: Resumo Executivo */}
          <button
            onClick={handleExecutivePDF}
            disabled={!!generatingType}
            title="Gera PDF leve com estatísticas e lista de cenários (sem steps ou imagens)"
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer shadow"
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
            className={`bg-white border-l-4 border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all ${STATUS_BORDER[scenario.status]}`}
          >
            {/* Accordion header — clicável */}
            <button
              type="button"
              onClick={() => toggleScenario(scenario.id)}
              className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded">
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

                {/* Tabela de steps */}
                <div className="border-t border-slate-100">
                  {/* Header */}
                  <div
                    className="grid bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400"
                    style={{ gridTemplateColumns: "36px 1fr 1fr 120px" }}
                  >
                    <div className="px-3 py-2 text-center">#</div>
                    <div className="px-4 py-2 border-l border-slate-200">
                      Action
                    </div>
                    <div className="px-4 py-2 border-l border-slate-200">
                      Expected Result
                    </div>
                    <div className="px-3 py-2 border-l border-slate-200 text-center">
                      Result
                    </div>
                  </div>

                  {scenario.steps.map((step, idx) => (
                    <div key={step.id}>
                      {/* Linha do step */}
                      <div
                        className={`grid border-b border-slate-100 last:border-b-0 transition-colors ${STEP_ROW[step.status]}`}
                        style={{ gridTemplateColumns: "36px 1fr 1fr 120px" }}
                      >
                        {/* Número */}
                        <div className="flex items-start justify-center px-2 pt-4 text-sm text-slate-300 font-mono">
                          {idx + 1}
                        </div>

                        {/* Ação */}
                        <div className="px-4 py-3 border-l border-slate-100">
                          <span
                            className={`inline-block text-xs font-bold mr-1.5 ${TYPE_COLOR[step.type] ?? "text-slate-400"}`}
                          >
                            {step.type}
                          </span>
                          <span className="text-sm text-slate-700 leading-relaxed">
                            {step.action}
                          </span>
                        </div>

                        {/* Resultado esperado */}
                        <div className="px-4 py-3 border-l border-slate-100">
                          <span className="text-sm text-slate-600 leading-relaxed">
                            {step.expectedResult}
                          </span>
                        </div>

                        {/* Coluna de ações: status + ícones de anotação */}
                        <div className="flex flex-col items-center justify-center gap-1.5 px-2 py-2 border-l border-slate-100">
                          {/* Botões de status */}
                          <div className="flex items-center gap-1">
                            {(
                              [
                                {
                                  s: "passed" as RunStatus,
                                  icon: <CheckCircle2 size={20} />,
                                  active:
                                    "bg-emerald-500 text-white shadow shadow-emerald-300",
                                  idle: "text-slate-300 hover:text-emerald-500 hover:bg-emerald-50",
                                  title: "Passou",
                                },
                                {
                                  s: "failed" as RunStatus,
                                  icon: <XCircle size={20} />,
                                  active:
                                    "bg-red-500 text-white shadow shadow-red-300",
                                  idle: "text-slate-300 hover:text-red-500 hover:bg-red-50",
                                  title: "Falhou",
                                },
                                {
                                  s: "blocked" as RunStatus,
                                  icon: <MinusCircle size={20} />,
                                  active:
                                    "bg-slate-500 text-white shadow shadow-slate-300",
                                  idle: "text-slate-300 hover:text-slate-500 hover:bg-slate-100",
                                  title: "Bloqueado",
                                },
                              ] as const
                            ).map(({ s, icon, active, idle, title }) => (
                              <button
                                key={s}
                                onClick={() =>
                                  updateStepStatus(
                                    scenario.id,
                                    step.id,
                                    s,
                                    step.comment,
                                  )
                                }
                                title={title}
                                className={`p-1.5 rounded-full transition-all cursor-pointer ${step.status === s ? `${active} scale-110` : `bg-transparent ${idle}`}`}
                              >
                                {icon}
                              </button>
                            ))}
                          </div>

                          {/* Ícones de anotação — Progressive Disclosure */}
                          <div className="flex items-center gap-1 border-t border-slate-100 pt-1.5 w-full justify-center">
                            <button
                              type="button"
                              onClick={() => toggleComment(step.id)}
                              title={EVIDENCE_LABEL[step.status]}
                              className={`relative p-1 rounded transition-all cursor-pointer ${openComments.has(step.id) ? "text-slate-600 bg-slate-100" : "text-slate-300 hover:text-slate-500"}`}
                            >
                              <MessageSquare size={14} />
                              {step.comment && (
                                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleEvidence(step.id)}
                              title="Evidência / Imagem"
                              className={`relative p-1 rounded transition-all cursor-pointer ${openEvidence.has(step.id) ? "text-slate-600 bg-slate-100" : "text-slate-300 hover:text-slate-500"}`}
                            >
                              <Paperclip size={14} />
                              {step.evidence && (
                                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Painel de comentário (Progressive Disclosure) */}
                      {openComments.has(step.id) && (
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70">
                          <div className="flex gap-3 items-start">
                            <span
                              className={`text-xs font-semibold uppercase tracking-wider mt-2 shrink-0 w-20 ${EVIDENCE_LABEL_COLOR[step.status]}`}
                            >
                              {EVIDENCE_LABEL[step.status]}
                            </span>
                            <textarea
                              placeholder="Adicione um comentário ou observação sobre este passo..."
                              defaultValue={step.comment}
                              onBlur={(e) =>
                                updateStepStatus(
                                  scenario.id,
                                  step.id,
                                  step.status,
                                  e.target.value,
                                )
                              }
                              rows={2}
                              className="flex-1 text-sm px-3 py-2 border border-slate-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-slate-300/40 resize-none text-slate-700 placeholder-slate-300"
                            />
                          </div>
                        </div>
                      )}

                      {/* Painel de evidência (Progressive Disclosure) */}
                      {openEvidence.has(step.id) && (
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70">
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
  );
};
