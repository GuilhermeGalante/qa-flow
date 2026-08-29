import { createQaStore, type QaStore } from "../../store/useQaStore";
import { invoke } from "@tauri-apps/api/core";
import { createTauriAdapters } from "../tauri/tauriAdapters";

export interface DesktopComposition {
  store: QaStore;
}

export function createDesktopComposition(): DesktopComposition {
  return {
    store: createQaStore(createTauriAdapters(invoke)),
  };
}
