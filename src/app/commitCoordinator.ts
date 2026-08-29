import type { OperationResult } from "../domain/types";
import type { DesktopError, SaveState } from "../platform/contracts/dtos";
import { toDesktopError } from "../platform/contracts/errors.ts";

export interface ApplicationResult<T = undefined> extends OperationResult<T> {
  error?: DesktopError;
}

interface Confirmation {
  storageRevision: number;
  committedAt: string;
}

interface SkippedOperation<T> {
  kind: "skipped";
  result: ApplicationResult<T>;
}

interface CommitOperation<T, TConfirmation extends Confirmation> {
  kind: "commit";
  execute(expectedStorageRevision: number): Promise<TConfirmation>;
  apply(confirmation: TConfirmation): void;
  result(confirmation: TConfirmation): ApplicationResult<T>;
}

export type PreparedOperation<T, TConfirmation extends Confirmation = Confirmation> =
  | SkippedOperation<T>
  | CommitOperation<T, TConfirmation>;

interface CommitCoordinatorOptions {
  getStorageRevision(): number;
  setSaveState(saveState: SaveState): void;
}

export class CommitCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private readonly options: CommitCoordinatorOptions;

  constructor(options: CommitCoordinatorOptions) {
    this.options = options;
  }

  enqueue<T, TConfirmation extends Confirmation = Confirmation>(
    operationId: string,
    prepare: () => PreparedOperation<T, TConfirmation> | Promise<PreparedOperation<T, TConfirmation>>,
  ): Promise<ApplicationResult<T>> {
    const task = this.tail.then(async () => {
      let prepared: PreparedOperation<T, TConfirmation>;
      try {
        prepared = await prepare();
      } catch (value) {
        const error = toDesktopError(value, operationId);
        this.options.setSaveState({ kind: "error", operationId, error });
        return { ok: false, message: error.message, issues: error.issues, error };
      }
      if (prepared.kind === "skipped") return prepared.result;

      this.options.setSaveState({ kind: "saving", operationId });
      try {
        const confirmation = await prepared.execute(this.options.getStorageRevision());
        prepared.apply(confirmation);
        this.options.setSaveState({ kind: "idle", committedAt: confirmation.committedAt });
        return prepared.result(confirmation);
      } catch (value) {
        const error = toDesktopError(value, operationId);
        if (error.code === "CONFLICT") {
          this.options.setSaveState({
            kind: "conflict",
            operationId,
            currentStorageRevision: error.currentStorageRevision ?? this.options.getStorageRevision(),
          });
        } else {
          this.options.setSaveState({ kind: "error", operationId, error });
        }
        return {
          ok: false,
          message: error.message,
          issues: error.issues,
          error,
        };
      }
    });

    this.tail = task.then(() => undefined, () => undefined);
    return task;
  }
}

export function skipped<T>(result: ApplicationResult<T>): SkippedOperation<T> {
  return { kind: "skipped", result };
}
