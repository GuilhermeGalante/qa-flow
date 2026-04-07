import { useState } from "react";
import { TestRunner } from "./components/test-runner/TestRunner";
import { TestBuilder } from "./components/test-builder/TestBuilder";
import { CsvImporter } from "./components/csv-importer/CsvImporter";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ReportsScreen } from "./components/reports/ReportsScreen";
import { AppLayout, type View } from "./components/layout/AppLayout";
import { useTestStore } from "./store/useTestStore";
import type { TestPlan } from "./types";

function App() {
  const [view, setView] = useState<View>("dashboard");
  const currentPlan = useTestStore((state) => state.currentPlan);
  const setCurrentPlan = useTestStore((state) => state.setCurrentPlan);

  const handleRunPlan = (plan: TestPlan) => {
    setCurrentPlan(plan);
    setView("runner");
  };

  return (
    <AppLayout view={view} onNavigate={setView} currentPlan={currentPlan}>
      {view === "dashboard" && <Dashboard onRunPlan={handleRunPlan} />}
      {view === "csv" && (
        <CsvImporter onImportSuccess={() => setView("dashboard")} />
      )}
      {view === "builder" && (
        <TestBuilder onSaveSuccess={() => setView("dashboard")} />
      )}
      {view === "runner" && <TestRunner />}
      {view === "reports" && <ReportsScreen />}
    </AppLayout>
  );
}

export default App;
