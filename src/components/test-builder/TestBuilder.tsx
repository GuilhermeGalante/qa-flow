import React, { useState } from 'react';
import { useTestStore } from '../../store/useTestStore';
import { Plus, Trash2, Save, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { TestPlan, TestScenario, TestStep, StepType } from '../../types';

// ─── Sub-componente: editor de um único cenário ──────────────────────────────

interface ScenarioEditorProps {
  scenario: Omit<TestScenario, 'id'>;
  index: number;
  onChange: (index: number, updated: Omit<TestScenario, 'id'>) => void;
  onRemove: (index: number) => void;
}

const TYPE_OPTIONS: StepType[] = ['Dado', 'Quando', 'Então', 'E'];

const ScenarioEditor: React.FC<ScenarioEditorProps> = ({ scenario, index, onChange, onRemove }) => {
  const [collapsed, setCollapsed] = useState(false);

  const update = (patch: Partial<Omit<TestScenario, 'id'>>) =>
    onChange(index, { ...scenario, ...patch });

  const addStep = () => {
    const step: TestStep = {
      id: crypto.randomUUID(),
      type: 'Dado',
      action: '',
      expectedResult: '',
      status: 'pending',
    };
    update({ steps: [...scenario.steps, step] });
  };

  const removeStep = (stepIdx: number) => {
    const steps = [...scenario.steps];
    steps.splice(stepIdx, 1);
    update({ steps });
  };

  const updateStep = (stepIdx: number, patch: Partial<TestStep>) => {
    const steps = scenario.steps.map((s, i) =>
      i === stepIdx ? { ...s, ...patch } : s
    );
    update({ steps });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Cabeçalho do cartão */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
            {scenario.caseId}
          </span>
          <span className="text-sm font-semibold text-slate-700 truncate max-w-xs">
            {scenario.title || 'Novo Caso de Teste'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((p) => !p)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            onClick={() => onRemove(index)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-5">
          {/* Title + Precondition */}
          <div className="mb-6 space-y-4">
            <div className="flex gap-6 items-start">
              <label className="text-sm font-semibold text-slate-700 w-28 shrink-0 pt-2.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={scenario.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Ex: Marcando todas as opções do share"
                className="flex-1 px-3 py-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-800"
              />
            </div>

            <div className="flex gap-6 items-start">
              <label className="text-sm font-semibold text-slate-700 w-28 shrink-0 pt-2.5">
                Precondition
              </label>
              <textarea
                value={scenario.precondition}
                onChange={(e) => update({ precondition: e.target.value })}
                placeholder="Ex: Possuir um QT em agrupamento e com a ferramenta de share ativada no JOB."
                rows={3}
                className="flex-1 px-3 py-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-700 resize-y"
              />
            </div>

            <div className="flex gap-6 items-center">
              <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">
                Suite
              </label>
              <div className="flex gap-3 flex-wrap">
                {(['Happy path', 'Cenário negativo', 'Fluxo alternativo'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => update({ suite: s })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      scenario.suite === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Steps</h3>
              <div className="flex gap-2">
                <button
                  onClick={addStep}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-2 border-slate-700 text-slate-700 hover:bg-slate-700 hover:text-white rounded transition-colors"
                >
                  ADD NEW STEP
                </button>
              </div>
            </div>

            {/* Tabela de steps */}
            <div className="border border-slate-200 rounded overflow-hidden">
              {/* Header */}
              <div className="grid bg-slate-50 border-b border-slate-200"
                style={{ gridTemplateColumns: '40px 1fr 1fr 36px' }}>
                <div className="px-3 py-2 text-xs font-bold text-slate-400 text-center">#</div>
                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-l border-slate-200">
                  Action
                </div>
                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-l border-slate-200">
                  Expected Result
                </div>
                <div />
              </div>

              {/* Rows */}
              {scenario.steps.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">
                  Nenhum passo adicionado. Clique em "ADD NEW STEP".
                </div>
              )}

              {scenario.steps.map((step, si) => (
                <div
                  key={step.id}
                  className="grid border-b border-slate-200 last:border-b-0 hover:bg-slate-50/60 transition-colors"
                  style={{ gridTemplateColumns: '40px 1fr 1fr 36px' }}
                >
                  {/* Número */}
                  <div className="flex items-start justify-center px-2 pt-4 text-sm text-slate-400 font-mono">
                    {si + 1}
                  </div>

                  {/* Action: select de prefixo + textarea */}
                  <div className="px-3 py-3 border-l border-slate-200 flex flex-col gap-1.5">
                    <select
                      value={step.type}
                      onChange={(e) => updateStep(si, { type: e.target.value as StepType })}
                      className="w-24 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 outline-none focus:border-blue-500"
                    >
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <textarea
                      value={step.action}
                      onChange={(e) => updateStep(si, { action: e.target.value })}
                      placeholder="Descreva a ação deste passo..."
                      rows={2}
                      className="w-full text-sm text-slate-700 border-0 outline-none resize-none bg-transparent placeholder-slate-300 leading-relaxed"
                    />
                  </div>

                  {/* Expected Result */}
                  <div className="px-3 py-3 border-l border-slate-200 flex items-start">
                    <textarea
                      value={step.expectedResult}
                      onChange={(e) => updateStep(si, { expectedResult: e.target.value })}
                      placeholder="Descreva o resultado esperado..."
                      rows={3}
                      className="w-full text-sm text-slate-700 border-0 outline-none resize-none bg-transparent placeholder-slate-300 leading-relaxed"
                    />
                  </div>

                  {/* Deletar */}
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => removeStep(si)}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      title="Remover passo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Componente principal TestBuilder ────────────────────────────────────────

export const TestBuilder: React.FC<{ onSaveSuccess: () => void }> = ({ onSaveSuccess }) => {
  const addPlan = useTestStore((s) => s.addPlan);
  const setCurrentPlan = useTestStore((s) => s.setCurrentPlan);

  const [planName, setPlanName] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [scenarios, setScenarios] = useState<Omit<TestScenario, 'id'>[]>([]);

  const handleAdd = () => {
    setScenarios((prev) => [
      ...prev,
      {
        title: '',
        subsection: '',
        suite: 'Happy path',
        initialStatus: 'Ready for testing',
        priority: '',
        reference: '',
        precondition: '',
        caseId: `TC-${prev.length + 1}`,
        status: 'pending',
        steps: [],
      },
    ]);
  };

  const handleChange = (i: number, updated: Omit<TestScenario, 'id'>) => {
    setScenarios((prev) => prev.map((s, idx) => (idx === i ? updated : s)));
  };

  const handleRemove = (i: number) => {
    setScenarios((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = () => {
    if (!planName.trim()) {
      alert('Dê um nome ao Plano de Testes antes de salvar.');
      return;
    }
    if (scenarios.length === 0) {
      alert('Adicione pelo menos um caso de teste.');
      return;
    }

    const plan: TestPlan = {
      id: crypto.randomUUID(),
      name: planName,
      description: '',
      createdAt: new Date().toISOString(),
      meta: {
        project: planName,
        section: '',
        createdBy: createdBy || 'Não informado',
        createdAt: new Date().toISOString(),
      },
      scenarios: scenarios.map((s, i) => ({
        ...s,
        id: crypto.randomUUID(),
        caseId: `TC-${i + 1}`,
        steps: s.steps.map((st) => ({ ...st, id: crypto.randomUUID() })),
      })),
    };

    addPlan(plan);
    setCurrentPlan(plan);
    onSaveSuccess();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Cabeçalho do plano */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Novo Plano de Testes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Nome do Plano <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Ex: Validação do Módulo de Login"
              className="w-full px-3 py-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Criado por</label>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="Seu nome (aparece no PDF)"
              className="w-full px-3 py-2.5 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
        </div>
      </div>

      {/* Lista de cenários */}
      {scenarios.map((s, i) => (
        <ScenarioEditor
          key={i}
          scenario={s}
          index={i}
          onChange={handleChange}
          onRemove={handleRemove}
        />
      ))}

      {/* Ações globais */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Adicionar Caso de Teste
        </button>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-blue-500/30"
        >
          <Save size={16} /> Salvar Plano e Executar
        </button>
      </div>
    </div>
  );
};
