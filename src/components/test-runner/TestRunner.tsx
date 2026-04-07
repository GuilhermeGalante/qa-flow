import React, { useState } from 'react';
import { useTestStore } from '../../store/useTestStore';
import {
  CheckCircle2,
  XCircle,
  FileDown,
  PlaySquare,
  MinusCircle,
  Loader2,
} from 'lucide-react';
import { generatePdfReport } from '../../utils/generatePdfReport.tsx';
import { EvidenceUploader } from './EvidenceUploader';
import type { RunStatus } from '../../types';

const STATUS_BORDER: Record<RunStatus, string> = {
  passed:  'border-l-emerald-400',
  failed:  'border-l-red-400',
  blocked: 'border-l-slate-400',
  pending: 'border-l-slate-200',
};

const BADGE: Record<RunStatus, string> = {
  passed:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed:  'bg-red-50 text-red-700 border border-red-200',
  blocked: 'bg-slate-100 text-slate-500 border border-slate-300',
  pending: 'bg-slate-50 text-slate-400 border border-slate-200',
};

const LABEL: Record<RunStatus, string> = {
  passed:  'Passed',
  failed:  'Failed',
  blocked: 'Blocked',
  pending: 'Pendente',
};

const STEP_ROW: Record<RunStatus, string> = {
  passed:  'bg-emerald-50/30',
  failed:  'bg-red-50/30',
  blocked: 'bg-slate-50',
  pending: 'bg-white',
};

const TYPE_COLOR: Record<string, string> = {
  Dado:   'text-indigo-600',
  Quando: 'text-blue-600',
  Então:  'text-violet-600',
  E:      'text-slate-400',
};

export const TestRunner: React.FC = () => {
  const currentPlan        = useTestStore((s) => s.currentPlan);
  const updateStepStatus   = useTestStore((s) => s.updateStepStatus);
  const updateStepEvidence = useTestStore((s) => s.updateStepEvidence);
  const clearStepEvidence  = useTestStore((s) => s.clearStepEvidence);
  const [generating, setGenerating] = useState(false);

  const handlePDF = async () => {
    if (!currentPlan || generating) return;
    setGenerating(true);
    await generatePdfReport(currentPlan);
    setGenerating(false);
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
  const total     = scenarios.length;
  const passed    = scenarios.filter((s) => s.status === 'passed').length;
  const failed    = scenarios.filter((s) => s.status === 'failed').length;
  const blocked   = scenarios.filter((s) => s.status === 'blocked').length;
  const done      = passed + failed + blocked;
  const progress  = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Cabeçalho do plano ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-widest text-blue-600 uppercase flex items-center gap-1.5 mb-1">
            <PlaySquare size={13} /> Em Execução
          </span>
          <h1 className="text-xl font-bold text-slate-900 leading-snug">{currentPlan.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {currentPlan.meta.project}
            {currentPlan.meta.section ? ` · ${currentPlan.meta.section}` : ''}
          </p>

          {/* Progresso */}
          <div className="mt-3 w-72">
            <div className="flex gap-4 text-xs text-slate-500 mb-1">
              <span className="text-emerald-600 font-semibold">{passed} Passed</span>
              <span className="text-red-500 font-semibold">{failed} Failed</span>
              <span className="text-slate-400 font-semibold">{blocked} Blocked</span>
              <span className="text-slate-300 ml-auto">{done}/{total}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: failed > 0
                    ? 'linear-gradient(90deg, #2db39e, #ef4444)'
                    : '#2db39e',
                }}
              />
            </div>
          </div>
        </div>

        <button
          onClick={handlePDF}
          disabled={generating}
          className="shrink-0 self-start flex items-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-wait text-white px-5 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer shadow"
        >
          {generating
            ? <><Loader2 size={17} className="animate-spin" /> Gerando...</>
            : <><FileDown size={17} /> Gerar PDF</>}
        </button>
      </div>

      {/* ── Cenários ── */}
      {scenarios.map((scenario) => (
        <div
          key={scenario.id}
          className={`bg-white border-l-4 border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all ${STATUS_BORDER[scenario.status]}`}
        >
          {/* Header do cenário */}
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="font-mono text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded">
                  {scenario.caseId}
                </span>
                {scenario.suite && <span className="text-xs text-slate-400">{scenario.suite}</span>}
                {scenario.priority && (
                  <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded">
                    {scenario.priority}
                  </span>
                )}
              </div>
              <h2 className="font-semibold text-slate-800 text-base">{scenario.title}</h2>
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${BADGE[scenario.status]}`}>
              {LABEL[scenario.status]}
            </span>
          </div>

          {/* Pré-condição */}
          {scenario.precondition && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
              <span className="font-semibold">Pré-condição: </span>
              {scenario.precondition}
            </div>
          )}

          {/* Tabela de steps */}
          <div>
            {/* Header */}
            <div
              className="grid bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-400"
              style={{ gridTemplateColumns: '36px 1fr 1fr 112px' }}
            >
              <div className="px-3 py-2 text-center">#</div>
              <div className="px-4 py-2 border-l border-slate-200">Action</div>
              <div className="px-4 py-2 border-l border-slate-200">Expected Result</div>
              <div className="px-3 py-2 border-l border-slate-200 text-center">Result</div>
            </div>

            {scenario.steps.map((step, idx) => (
              <div key={step.id}>
                {/* Linha do step */}
                <div
                  className={`grid border-b border-slate-100 last:border-b-0 transition-colors ${STEP_ROW[step.status]}`}
                  style={{ gridTemplateColumns: '36px 1fr 1fr 112px' }}
                >
                  {/* Número */}
                  <div className="flex items-start justify-center px-2 pt-4 text-sm text-slate-300 font-mono">
                    {idx + 1}
                  </div>

                  {/* Ação */}
                  <div className="px-4 py-3 border-l border-slate-100">
                    <span className={`inline-block text-xs font-bold mr-1.5 ${TYPE_COLOR[step.type] ?? 'text-slate-400'}`}>
                      {step.type}
                    </span>
                    <span className="text-sm text-slate-700 leading-relaxed">{step.action}</span>
                  </div>

                  {/* Resultado esperado */}
                  <div className="px-4 py-3 border-l border-slate-100">
                    <span className="text-sm text-slate-600 leading-relaxed">{step.expectedResult}</span>
                  </div>

                  {/* Botões */}
                  <div className="flex items-center justify-center gap-1.5 px-2 py-2 border-l border-slate-100">
                    {(
                      [
                        { s: 'passed'  as RunStatus, icon: <CheckCircle2 size={20} />, active: 'bg-emerald-500 text-white shadow shadow-emerald-300', idle: 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50', title: 'Passou' },
                        { s: 'failed'  as RunStatus, icon: <XCircle size={20} />,       active: 'bg-red-500 text-white shadow shadow-red-300',         idle: 'text-slate-300 hover:text-red-500 hover:bg-red-50',         title: 'Falhou' },
                        { s: 'blocked' as RunStatus, icon: <MinusCircle size={20} />,   active: 'bg-slate-500 text-white shadow shadow-slate-300',      idle: 'text-slate-300 hover:text-slate-500 hover:bg-slate-100',    title: 'Bloqueado' },
                      ] as const
                    ).map(({ s, icon, active, idle, title }) => (
                      <button
                        key={s}
                        onClick={() => updateStepStatus(scenario.id, step.id, s, step.comment)}
                        title={title}
                        className={`p-1.5 rounded-full transition-all cursor-pointer ${step.status === s ? `${active} scale-110` : `bg-transparent ${idle}`}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Painel de falha: comentário + evidência ── */}
                {step.status === 'failed' && (
                  <div className="bg-red-50/60 px-5 py-4 border-b border-red-100 space-y-3">
                    {/* Campo de comentário */}
                    <div className="flex gap-3 items-start">
                      <span className="text-xs text-red-400 font-semibold uppercase tracking-wider mt-2 shrink-0 w-20">
                        Bug / Evidência
                      </span>
                      <textarea
                        placeholder="Descreva o comportamento incorreto ou cole o link da evidência..."
                        defaultValue={step.comment}
                        onBlur={(e) =>
                          updateStepStatus(scenario.id, step.id, 'failed', e.target.value)
                        }
                        rows={2}
                        className="flex-1 text-sm px-3 py-2 border border-red-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-red-300/40 resize-none text-slate-700 placeholder-red-300"
                      />
                    </div>

                    {/* Upload de evidência visual */}
                    <div className="ml-[92px]">
                      <EvidenceUploader
                        evidence={step.evidence}
                        onSave={(b64) => updateStepEvidence(scenario.id, step.id, b64)}
                        onClear={() => clearStepEvidence(scenario.id, step.id)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
