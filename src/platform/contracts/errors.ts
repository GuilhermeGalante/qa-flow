import type { DesktopError, DesktopErrorCode } from "./dtos";

const ERROR_CODES = new Set<DesktopErrorCode>([
  "CANCELLED",
  "CONFLICT",
  "VALIDATION",
  "UNSUPPORTED_SCHEMA",
  "STORAGE_LOCKED",
  "DISK_FULL",
  "PERMISSION_DENIED",
  "CORRUPT_STORAGE",
  "RECOVERY_REQUIRED",
  "IO",
  "UPDATE",
  "INTERNAL",
]);

export function desktopError(
  code: DesktopErrorCode,
  message: string,
  options: Partial<Omit<DesktopError, "code" | "message">> = {},
): DesktopError {
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    ...options,
  };
}

export function toDesktopError(value: unknown, operationId?: string): DesktopError {
  if (value && typeof value === "object") {
    const candidate = value as Partial<DesktopError>;
    if (typeof candidate.code === "string" && ERROR_CODES.has(candidate.code as DesktopErrorCode)) {
      return {
        code: candidate.code as DesktopErrorCode,
        message: typeof candidate.message === "string" ? candidate.message : "A operação desktop falhou.",
        operationId: candidate.operationId ?? operationId,
        retryable: candidate.retryable === true,
        issues: Array.isArray(candidate.issues) ? candidate.issues : undefined,
        currentStorageRevision: typeof candidate.currentStorageRevision === "number"
          ? candidate.currentStorageRevision
          : undefined,
      };
    }
  }

  return desktopError(
    "INTERNAL",
    value instanceof Error && value.message ? value.message : "A operação não pôde ser concluída.",
    { operationId, retryable: false },
  );
}

