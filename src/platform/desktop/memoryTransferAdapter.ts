import type {
  ApplyImportRequest,
  ExportRequest,
  GeneratedFileRequest,
  ImportPreview,
  ImportReceipt,
  RepositoryPreview,
  RepositoryPullRequest,
  RepositoryPushRequest,
  TransferResult,
} from "../contracts/dtos";
import { desktopError } from "../contracts/errors.ts";
import type { TransferPort } from "../contracts/ports";

function unavailable(): never {
  throw desktopError(
    "IO",
    "Os diálogos e arquivos nativos entram na fase de integração desktop. O workspace atual continua temporário.",
    { retryable: false },
  );
}

export class MemoryDesktopTransferAdapter implements TransferPort {
  async exportBackup(request: ExportRequest): Promise<TransferResult> { void request; return unavailable(); }
  async inspectBackup(): Promise<ImportPreview> { return unavailable(); }
  async applyImport(request: ApplyImportRequest): Promise<ImportReceipt> { void request; return unavailable(); }
  async pushRepository(request: RepositoryPushRequest): Promise<TransferResult> { void request; return unavailable(); }
  async inspectRepository(): Promise<RepositoryPreview> { return unavailable(); }
  async pullRepository(request: RepositoryPullRequest): Promise<ImportReceipt> { void request; return unavailable(); }
  async saveGeneratedFile(request: GeneratedFileRequest, bytes: Uint8Array): Promise<TransferResult> { void request; void bytes; return unavailable(); }
}
