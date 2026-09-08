import { desktopError } from "./errors.ts";

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const separator = dataUrl.indexOf(",");
  const header = separator >= 0 ? dataUrl.slice(0, separator) : "";
  if (!/^data:[^;,]+;base64$/i.test(header)) {
    throw desktopError("VALIDATION", "A evidência não usa uma data URL Base64 válida.", {
      retryable: false,
    });
  }
  try {
    const decoded = atob(dataUrl.slice(separator + 1));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw desktopError("VALIDATION", "A evidência contém Base64 inválido.", {
      retryable: false,
    });
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

