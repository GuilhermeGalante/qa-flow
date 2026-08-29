import { APP_VERSION } from "../../version.ts";
import { IPC_CONTRACT_VERSION, type LocalPreferences, type RuntimeInfo, type UpdateState } from "../contracts/dtos.ts";
import type { RuntimePort } from "../contracts/ports";

const SIDEBAR_KEY = "qa-flow-sidebar-collapsed";
const DEMAND_VIEW_KEY = "qa-flow-demand-view-mode";
const DEMAND_WIDTH_KEY = "qa-flow-demand-sidebar-width";

export class WebRuntimeAdapter implements RuntimePort {
  async getRuntimeInfo(): Promise<RuntimeInfo> {
    return {
      ipcContractVersion: IPC_CONTRACT_VERSION,
      runtime: "web",
      persistence: "indexeddb",
      platform: navigator.platform || "browser",
      appVersion: APP_VERSION,
      nativeFiles: true,
    };
  }

  async getPreferences(): Promise<LocalPreferences> {
    try {
      const demandViewMode = window.localStorage.getItem(DEMAND_VIEW_KEY);
      const demandSidebarWidth = Number(window.localStorage.getItem(DEMAND_WIDTH_KEY));
      return {
        sidebarCollapsed: window.localStorage.getItem(SIDEBAR_KEY) === "true",
        demandViewMode: demandViewMode === "modal" || demandViewMode === "sidebar" || demandViewMode === "fullscreen"
          ? demandViewMode
          : undefined,
        demandSidebarWidth: Number.isFinite(demandSidebarWidth) ? demandSidebarWidth : undefined,
      };
    } catch {
      return {};
    }
  }

  async setPreferences(changes: LocalPreferences): Promise<void> {
    if (typeof changes.sidebarCollapsed === "boolean") {
      window.localStorage.setItem(SIDEBAR_KEY, String(changes.sidebarCollapsed));
    }
    if (changes.demandViewMode) {
      window.localStorage.setItem(DEMAND_VIEW_KEY, changes.demandViewMode);
    }
    if (typeof changes.demandSidebarWidth === "number") {
      window.localStorage.setItem(DEMAND_WIDTH_KEY, String(changes.demandSidebarWidth));
    }
  }

  async checkForUpdate(): Promise<UpdateState> {
    return { status: "unsupported" };
  }
}
