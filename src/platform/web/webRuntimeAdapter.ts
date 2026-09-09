import { APP_VERSION } from "../../version.ts";
import { IPC_CONTRACT_VERSION, type LocalPreferences, type RuntimeInfo, type UpdateState } from "../contracts/dtos.ts";
import type { RuntimePort } from "../contracts/ports";

const SIDEBAR_KEY = "qa-flow-sidebar-collapsed";
const DEMAND_VIEW_KEY = "qa-flow-demand-view-mode";
const DEMAND_WIDTH_KEY = "qa-flow-demand-sidebar-width";
const THEME_KEY = "qa-flow-theme";
const LOCALE_KEY = "qa-flow-locale";

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
      const demandSidebarWidthRaw = window.localStorage.getItem(DEMAND_WIDTH_KEY);
      const demandSidebarWidth = demandSidebarWidthRaw === null ? undefined : Number(demandSidebarWidthRaw);
      const theme = window.localStorage.getItem(THEME_KEY);
      const locale = window.localStorage.getItem(LOCALE_KEY);
      return {
        sidebarCollapsed: window.localStorage.getItem(SIDEBAR_KEY) === "true",
        demandViewMode: demandViewMode === "modal" || demandViewMode === "sidebar" || demandViewMode === "fullscreen"
          ? demandViewMode
          : undefined,
        demandSidebarWidth: demandSidebarWidth !== undefined && Number.isFinite(demandSidebarWidth) ? demandSidebarWidth : undefined,
        theme: theme === "light" || theme === "dark" || theme === "system" ? theme : undefined,
        locale: locale === "pt-BR" || locale === "en-US" || locale === "es-ES" ? locale : undefined,
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
    if (changes.theme === "light" || changes.theme === "dark" || changes.theme === "system") {
      window.localStorage.setItem(THEME_KEY, changes.theme);
    }
    if (changes.locale === "pt-BR" || changes.locale === "en-US" || changes.locale === "es-ES") {
      window.localStorage.setItem(LOCALE_KEY, changes.locale);
    }
  }

  async checkForUpdate(): Promise<UpdateState> {
    return { status: "unsupported" };
  }

  async installUpdate(): Promise<void> {
    throw new Error("Atualizações nativas não são suportadas no navegador.");
  }
}
