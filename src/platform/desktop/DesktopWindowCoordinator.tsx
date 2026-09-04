import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQaStore } from "../../store/useQaStore";
import {
  hideDesktopCompanion,
  showDesktopCompanion,
  WORKSPACE_CHANGED_EVENT,
} from "./desktopCompanion";

export function DesktopWindowCoordinator() {
  const activeRunId = useQaStore((state) => state.activeRunId);
  const ready = useQaStore((state) => state.ready);
  const refreshWorkspace = useQaStore((state) => state.refreshWorkspace);
  const lastRunId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen(WORKSPACE_CHANGED_EVENT, () => { void refreshWorkspace(); }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!ready || lastRunId.current === activeRunId) return;
    lastRunId.current = activeRunId;
    if (activeRunId) void showDesktopCompanion(activeRunId);
    else void hideDesktopCompanion();
  }, [activeRunId, ready]);

  return null;
}
