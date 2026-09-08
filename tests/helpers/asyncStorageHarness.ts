import type { AsyncKeyValueStorage } from "../../src/platform/web/webWorkspaceAdapter.ts";

export class AsyncStorageHarness implements AsyncKeyValueStorage {
  readonly values = new Map<string, unknown>();
  private readonly setFailures = new Map<string, Error>();
  private readonly deleteFailures = new Map<string, Error>();

  failNextSet(key: string, error = new Error(`Falha ao gravar ${key}`)): void {
    this.setFailures.set(key, error);
  }

  failNextDelete(key: string, error = new Error(`Falha ao remover ${key}`)): void {
    this.deleteFailures.set(key, error);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const failure = this.setFailures.get(key);
    if (failure) {
      this.setFailures.delete(key);
      throw failure;
    }
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<void> {
    const failure = this.deleteFailures.get(key);
    if (failure) {
      this.deleteFailures.delete(key);
      throw failure;
    }
    this.values.delete(key);
  }
}

