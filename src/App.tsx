import { useEffect, useState } from "react";
import { CasesScreen } from "./components/v2/CasesScreen";
import { DashboardScreen } from "./components/v2/DashboardScreen";
import { PlansScreen } from "./components/v2/PlansScreen";
import { QaLayout, type QaView } from "./components/v2/QaLayout";
import { ReportsScreen } from "./components/v2/ReportsScreen";
import { RunsScreen } from "./components/v2/RunsScreen";
import { SettingsScreen } from "./components/v2/SettingsScreen";
import { useQaStore } from "./store/useQaStore";

function App() {
  const [view, setView] = useState<QaView>("dashboard");
  const [requestedPlanId, setRequestedPlanId] = useState<string>();
  const ready = useQaStore((state) => state.ready);
  const initialize = useQaStore((state) => state.initialize);
  const workspaceName = useQaStore((state) => state.settings.name);

  useEffect(() => { void initialize(); }, [initialize]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div>
          <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-cyan-400 font-black text-slate-950">QA</div>
          <h1 className="mt-4 text-xl font-black">Preparando seu workspace</h1>
          <p className="mt-1 text-sm text-slate-400">Validando o armazenamento e procurando dados da versão anterior.</p>
        </div>
      </div>
    );
  }

  const runPlan = (planId: string) => {
    setRequestedPlanId(planId);
    setView("runs");
  };

  return (
    <QaLayout view={view} onNavigate={setView} workspaceName={workspaceName}>
      {view === "dashboard" && <DashboardScreen onNavigate={setView} />}
      {view === "cases" && <CasesScreen />}
      {view === "plans" && <PlansScreen onRun={runPlan} />}
      {view === "runs" && <RunsScreen requestedPlanId={requestedPlanId} onRequestHandled={() => setRequestedPlanId(undefined)} />}
      {view === "reports" && <ReportsScreen />}
      {view === "settings" && <SettingsScreen />}
    </QaLayout>
  );
}

export default App;
