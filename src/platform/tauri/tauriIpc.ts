import { toDesktopError } from "../contracts/errors.ts";

export type DesktopCommand =
  | "workspace_initialize"
  | "workspace_commit"
  | "evidence_add"
  | "evidence_read"
  | "evidence_remove"
  | "integrity_verify"
  | "backup_export_dialog"
  | "backup_inspect_dialog"
  | "backup_apply"
  | "repository_push_dialog"
  | "repository_inspect_dialog"
  | "repository_pull"
  | "generated_file_save_dialog"
  | "runtime_info"
  | "preferences_get"
  | "preferences_set"
  | "update_check";

export type TauriInvoke = <T>(command: DesktopCommand, args?: Record<string, unknown>) => Promise<T>;

/** Única fronteira que conhece a função invoke; os adapters só conhecem este cliente. */
export class TauriIpcClient {
  private readonly invoke: TauriInvoke;

  constructor(invoke: TauriInvoke) {
    this.invoke = invoke;
  }

  async call<T>(command: DesktopCommand, args?: Record<string, unknown>): Promise<T> {
    try {
      return await this.invoke<T>(command, args);
    } catch (value) {
      throw toDesktopError(value);
    }
  }
}
