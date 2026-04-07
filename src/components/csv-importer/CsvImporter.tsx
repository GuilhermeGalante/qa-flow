import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { useTestStore } from '../../store/useTestStore';
import { Upload, FileSpreadsheet, User, CheckCircle2 } from 'lucide-react';
import type { TestPlan, TestScenario, TestStep } from '../../types';

interface CsvRow {
  Project: string;
  Suite: string;
  Section: string;
  Subsection: string;
  Title: string;
  Precondition: string;
  Status: string;
  Reference: string;
  Action: string;
  'Expected result': string;
  'Custom field 1': string;
}

interface Props {
  onImportSuccess: () => void;
}

export const CsvImporter: React.FC<Props> = ({ onImportSuccess }) => {
  const addPlan = useTestStore((s) => s.addPlan);
  const setCurrentPlan = useTestStore((s) => s.setCurrentPlan);

  const [createdBy, setCreatedBy] = useState('');
  const [planName, setPlanName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<TestScenario[] | null>(null);
  const [rawRows, setRawRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Parseia as linhas do CSV no nosso modelo de dados */
  const parseRows = (rows: CsvRow[]): TestScenario[] => {
    const scenarios: TestScenario[] = [];
    let currentScenario: TestScenario | null = null;
    let caseCounter = 0;

    for (const row of rows) {
      const isNewCase = row.Project.trim() !== '' && row.Title.trim() !== '';

      if (isNewCase) {
        caseCounter++;
        currentScenario = {
          id: crypto.randomUUID(),
          caseId: `TC-${caseCounter}`,
          title: row.Title.trim(),
          subsection: row.Subsection.trim(),
          suite: row.Suite.trim(),
          initialStatus: row.Status.trim(),
          priority: row['Custom field 1']?.trim() ?? '',
          reference: row.Reference.trim(),
          precondition: row.Precondition.trim(),
          status: 'pending',
          steps: [],
        };
        scenarios.push(currentScenario);
      }

      // Toda linha com Action preenchida vira um step (nova ou de continuação)
      if (currentScenario && row.Action.trim() !== '') {
        const step: TestStep = {
          id: crypto.randomUUID(),
          type: 'Dado',        // CSV não tem prefixo BDD; usamos Dado como padrão
          action: row.Action.trim(),
          expectedResult: row['Expected result']?.trim() ?? '',
          status: 'pending',
        };
        currentScenario.steps.push(step);
      }
    }

    return scenarios;
  };

  const handleFile = (file: File) => {
    setError('');
    setFileName(file.name);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: false, // keep continuation rows
      complete: (result) => {
        // Remove linhas completamente vazias (sem nenhum campo)
        const rows = (result.data as CsvRow[]).filter(
          (r) => Object.values(r).some((v) => v && v.trim() !== '')
        );
        setRawRows(rows);

        // Extrai nome do plano a partir do arquivo se não digitado ainda
        if (!planName) {
          const projectVal = rows.find((r) => r.Project?.trim())?.Project ?? '';
          const sectionVal = rows.find((r) => r.Section?.trim())?.Section ?? '';
          setPlanName(`${projectVal} - ${sectionVal}`.trim() || file.name.replace(/\.csv$/i, ''));
        }

        const scenarios = parseRows(rows);
        setPreview(scenarios);
      },
      error: (err) => {
        setError(`Erro ao parsear o CSV: ${err.message}`);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = () => {
    if (!preview || preview.length === 0) return;

    const firstRow = rawRows.find((r) => r.Project?.trim());
    const plan: TestPlan = {
      id: crypto.randomUUID(),
      name: planName || 'Plano Importado',
      description: `Importado via CSV — ${fileName}`,
      createdAt: new Date().toISOString(),
      meta: {
        project: firstRow?.Project?.trim() ?? '',
        section: firstRow?.Section?.trim() ?? '',
        createdBy: createdBy.trim() || 'Não informado',
        createdAt: new Date().toISOString(),
      },
      scenarios: preview,
    };

    addPlan(plan);
    setCurrentPlan(plan);
    onImportSuccess();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
      <header className="mb-8 border-b border-slate-100 pb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <FileSpreadsheet className="text-emerald-600" />
          Importar CSV de Testes
        </h2>
        <p className="text-slate-500 mt-1">
          Faça upload do seu arquivo CSV no formato padrão (colunas: Project, Suite, Section,
          Subsection, Title, Action, Expected result…).
        </p>
      </header>

      <div className="space-y-6">
        {/* Campos de meta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Nome do Plano
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Preenchido automaticamente pelo CSV"
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <User size={14} /> Criado por (aparece no PDF)
            </label>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              placeholder="Ex: Guilherme Galante"
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Área de Drop */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          <Upload
            size={36}
            className={isDragging ? 'text-emerald-500' : 'text-slate-400'}
          />
          {fileName ? (
            <div className="text-center">
              <p className="font-semibold text-emerald-700">{fileName}</p>
              <p className="text-sm text-slate-500">Clique para trocar o arquivo</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-medium text-slate-600">
                Arraste o CSV aqui ou <span className="text-emerald-600 underline">clique para selecionar</span>
              </p>
              <p className="text-sm text-slate-400 mt-1">Apenas arquivos .csv</p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
            {error}
          </p>
        )}

        {/* Preview dos cenários parseados */}
        {preview && preview.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500" />
              {preview.length} casos de teste detectados — pré-visualização:
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {preview.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-100 text-sm"
                >
                  <span className="font-mono text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded shrink-0 mt-0.5">
                    {s.caseId}
                  </span>
                  <div>
                    <p className="font-medium text-slate-800">{s.title}</p>
                    <p className="text-slate-400 text-xs">
                      {s.suite} · {s.subsection} · {s.steps.length} passo(s) · Prioridade: {s.priority || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botão de importar */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={handleImport}
            disabled={!preview || preview.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl font-medium transition-colors shadow-sm shadow-emerald-500/30"
          >
            <FileSpreadsheet size={18} />
            Importar e Executar Testes
          </button>
        </div>
      </div>
    </div>
  );
};
