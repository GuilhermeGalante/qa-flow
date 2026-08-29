import { APP_VERSION } from "../../version.ts";
import { IPC_CONTRACT_VERSION, type LocalPreferences, type RuntimeInfo, type UpdateState } from "../contracts/dtos.ts";
import type { RuntimePort } from "../contracts/ports";

export class MemoryDesktopRuntimeAdapter implements RuntimePort {
  private preferences: LocalPreferences = {};

  async getRuntimeInfo(): Promise<RuntimeInfo> {
    return {
      ipcContractVersion: IPC_CONTRACT_VERSION,
      runtime: "desktop",
      persistence: "memory",
      platform: "windows",
      appVersion: APP_VERSION,
      nativeFiles: false,
    };
  }

  async getPreferences(): Promise<LocalPreferences> {
    return { ...this.preferences };
  }

  async setPreferences(changes: LocalPreferences): Promise<void> {
    this.preferences = { ...this.preferences, ...changes };
  }

  async checkForUpdate(): Promise<UpdateState> {
    return { status: "unsupported" };
  }
}
