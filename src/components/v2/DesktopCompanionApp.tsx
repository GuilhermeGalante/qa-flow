import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { DesktopRunCompanion } from "./DesktopRunCompanion";
import type { TestRun } from "../../domain/types";
import { useQaStore } from "../../store/useQaStore";
import { ToastProvider } from "../../ui/ToastProvider";
import {
  COMPANION_RUN_EVENT,
  hideDesktopCompanion,
  resizeDesktopCompanion,
  WORKSPACE_CHANGED_EVENT,
} from "../../platform/desktop/desktopCompanion";
import { useActiveUiPreferences } from "../../useActiveUiPreferences";
import { tr } from "../../i18n";

function CompanionRun({ run }: { run: TestRun }) {
  const firstCase = run.snapshot.cases[0];
  const [selectedCaseId, setSelectedCaseId] = useState(firstCase?.id ?? "");
  const [activeStepId, setActiveStepId] = useState(firstCase?.steps[0]?.id ?? "");

  return (
    <DesktopRunCompanion
      run={run}
      selectedCaseId={selectedCaseId}
      activeStepId={activeStepId}
      onSelectStep={(caseId, stepId) => {
        setSelectedCaseId(caseId);
        setActiveStepId(stepId);
      }}
      onBlocked={() => undefined}
      onCollapsedChange={(collapsed) => { void resizeDesktopCompanion(collapsed); }}
      onClose={() => { void hideDesktopCompanion(); }}
    />
  );
}

function CompanionContent({ initialRunId }: { initialRunId: string }) {
  const [runId, setRunId] = useState(initialRunId);
  const runs = useQaStore((state) => state.runs);
  const ready = useQaStore((state) => state.ready);
  const initialize = useQaStore((state) => state.initialize);
  const refreshWorkspace = useQaStore((state) => state.refreshWorkspace);
  const run = runs.find((item) => item.id === runId);

  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    let disposed = false;
    let disposeRun: (() => void) | undefined;
    let disposeWorkspace: (() => void) | undefined;
    void Promise.all([
      listen<string>(COMPANION_RUN_EVENT, (event) => setRunId(event.payload)),
      listen(WORKSPACE_CHANGED_EVENT, () => { void refreshWorkspace(); }),
    ]).then(([nextDisposeRun, nextDisposeWorkspace]) => {
      if (disposed) {
        nextDisposeRun();
        nextDisposeWorkspace();
      } else {
        disposeRun = nextDisposeRun;
        disposeWorkspace = nextDisposeWorkspace;
      }
    });
    return () => {
      disposed = true;
      disposeRun?.();
      disposeWorkspace?.();
    };
  }, [refreshWorkspace]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center bg-ink px-5 text-sm font-bold text-raised">{tr("Preparando assistente…")}</main>;
  }

  if (!run) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-raised p-6 text-center">
        <p className="text-sm font-bold text-body">{tr("Tentativa não encontrada")}</p>
        <button type="button" className="mt-4 text-xs font-bold text-run" onClick={() => void hideDesktopCompanion()}>{tr("Fechar assistente")}</button>
      </main>
    );
  }

  return <CompanionRun key={run.id} run={run} />;
}

export function DesktopCompanionApp({ runId }: { runId: string }) {
  useActiveUiPreferences();
  return <div data-runtime="qaflow-companion"><ToastProvider><CompanionContent initialRunId={runId} /></ToastProvider></div>;
}
