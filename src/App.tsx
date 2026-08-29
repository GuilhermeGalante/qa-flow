import { useEffect, useState } from "react";
import { CasesScreen } from "./components/v2/CasesScreen";
import { DashboardScreen } from "./components/v2/DashboardScreen";
import { DemandsScreen } from "./components/v2/DemandsScreen";
import { PlansScreen } from "./components/v2/PlansScreen";
import { QaLayout, type QaView } from "./components/v2/QaLayout";
import { ReportsScreen } from "./components/v2/ReportsScreen";
import { RunsScreen } from "./components/v2/RunsScreen";
import { SettingsScreen } from "./components/v2/SettingsScreen";
import { ConfirmProvider } from "./ui/ConfirmProvider";
import { Skeleton } from "./ui/Skeleton";
import { ToastProvider } from "./ui/ToastProvider";
import { useQaStore } from "./store/useQaStore";

/**
 * Carregamento inicial no formato do layout que vai aparecer, em vez de uma tela cheia
 * sem relação com ela: o usuário já entende onde as coisas vão estar.
 */
function BootSkeleton() {
  return (
    <div className="min-h-screen bg-shell" role="status" aria-live="polite">
      <span className="sr-only">Preparando o workspace: validando o armazenamento e procurando dados da versão anterior.</span>
      <aside aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink p-4 lg:flex">
        <div className="flex items-center gap-3 border-b border-ink-hover pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-run-mark text-sm font-black text-ink">QA</div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-16 bg-ink-hover" />
            <Skeleton className="h-2.5 w-24 bg-ink-hover" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-11 bg-ink-hover" />)}
        </div>
      </aside>
      <div className="lg:pl-64">
        <header aria-hidden="true" className="flex h-16 items-center gap-3 border-b border-hairline bg-raised px-4 md:px-7">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-56" />
          </div>
          <Skeleton className="ml-auto h-7 w-32 rounded-full" />
        </header>
        <main aria-hidden="true" className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-7">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid gap-5 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
          </div>
        </main>
      </div>
    </div>
  );
}

interface AppProps {
  runtimeMarker?: string;
}

function App({ runtimeMarker }: AppProps) {
  const [view, setView] = useState<QaView>("dashboard");
  const [requestedPlanId, setRequestedPlanId] = useState<string>();
  const [newCaseRequested, setNewCaseRequested] = useState(false);
  const [caseEditorOpen, setCaseEditorOpen] = useState(false);
  const ready = useQaStore((state) => state.ready);
  const initialize = useQaStore((state) => state.initialize);
  const storageError = useQaStore((state) => state.storageError);
  const workspaceName = useQaStore((state) => state.settings.name);
  const saveState = useQaStore((state) => state.saveState);
  const runtimeInfo = useQaStore((state) => state.runtimeInfo);
  const sidebarCollapsed = useQaStore((state) => state.preferences.sidebarCollapsed === true);
  const setPreference = useQaStore((state) => state.setPreference);

  useEffect(() => { void initialize(); }, [initialize]);

  if (storageError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-shell p-5" role="alert">
        <section className="w-full max-w-xl rounded-2xl border border-danger-line bg-raised p-6 shadow-sm">
          <h1 className="text-xl font-bold text-body">Não foi possível abrir o workspace</h1>
          <p className="mt-2 text-sm leading-relaxed text-subtle">{storageError}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted">Nenhum workspace vazio foi aplicado sobre os dados existentes.</p>
          <button type="button" className="mt-5 min-h-11 rounded-xl bg-run px-4 text-sm font-bold text-white" onClick={() => void initialize()}>Tentar novamente</button>
        </section>
      </main>
    );
  }

  if (!ready) return <BootSkeleton />;

  const runPlan = (planId: string) => {
    setRequestedPlanId(planId);
    setView("runs");
  };

  const createCase = () => {
    setNewCaseRequested(true);
    setView("cases");
  };

  const persistenceLabel = saveState.kind === "saving"
    ? "Salvando…"
    : saveState.kind === "conflict"
      ? "Conflito de gravação"
      : saveState.kind === "error"
        ? "Falha ao salvar"
        : runtimeInfo?.persistence === "memory"
          ? "Sessão temporária"
          : "Salvo localmente";

  return (
    <div data-runtime={runtimeMarker ?? "qaflow-web"}>
    <ToastProvider>
      <ConfirmProvider>
        <QaLayout
          view={view}
          onNavigate={setView}
          workspaceName={workspaceName}
          immersive={view === "cases" && caseEditorOpen}
          persistenceLabel={persistenceLabel}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapsedChange={(collapsed) => { void setPreference({ sidebarCollapsed: collapsed }); }}
        >
          {view === "dashboard" && <DashboardScreen onNavigate={setView} onCreateCase={createCase} />}
          {view === "demands" && <DemandsScreen />}
          {view === "cases" && (
            <CasesScreen
              newCaseRequested={newCaseRequested}
              onNewCaseRequestHandled={() => setNewCaseRequested(false)}
              onEditorStateChange={setCaseEditorOpen}
            />
          )}
          {view === "plans" && <PlansScreen onRun={runPlan} />}
          {view === "runs" && <RunsScreen requestedPlanId={requestedPlanId} onRequestHandled={() => setRequestedPlanId(undefined)} />}
          {view === "reports" && <ReportsScreen />}
          {view === "settings" && <SettingsScreen />}
        </QaLayout>
      </ConfirmProvider>
    </ToastProvider>
    </div>
  );
}

export default App;
