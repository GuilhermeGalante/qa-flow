import { useState } from 'react';
import { TestRunner } from './components/test-runner/TestRunner';
import { TestBuilder } from './components/test-builder/TestBuilder';
import { CsvImporter } from './components/csv-importer/CsvImporter';
import { useTestStore } from './store/useTestStore';
import { LayoutTemplate, PlaySquare, FileSpreadsheet } from 'lucide-react';

type View = 'builder' | 'csv' | 'runner';

function App() {
  const [view, setView] = useState<View>('csv');
  const currentPlan = useTestStore((state) => state.currentPlan);

  const tabs: { id: View; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'csv', label: 'Importar CSV', icon: <FileSpreadsheet size={16} /> },
    { id: 'builder', label: 'Criar Manual', icon: <LayoutTemplate size={16} /> },
    {
      id: 'runner',
      label: 'Execução',
      icon: <PlaySquare size={16} />,
      disabled: !currentPlan,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="font-bold text-xl text-slate-800">QA</span>
            <span className="font-bold text-xl text-blue-600">Flow</span>
          </div>

          <nav className="flex gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setView(tab.id)}
                disabled={tab.disabled}
                title={tab.disabled ? 'Importe ou crie um plano primeiro' : undefined}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-all
                  ${view === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : tab.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'runner' && currentPlan && (
                  <span className="ml-1 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {currentPlan.scenarios.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {view === 'csv' && <CsvImporter onImportSuccess={() => setView('runner')} />}
        {view === 'builder' && <TestBuilder onSaveSuccess={() => setView('runner')} />}
        {view === 'runner' && <TestRunner />}
      </main>
    </div>
  );
}

export default App;
