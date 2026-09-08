import assert from "node:assert/strict";
import test from "node:test";
import { bytesToDataUrl, dataUrlToBytes } from "./binary.ts";

test("bytes e MIME sobrevivem ao round-trip por data URL", () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255]);
  const dataUrl = bytesToDataUrl(bytes, "application/octet-stream");

  assert.match(dataUrl, /^data:application\/octet-stream;base64,/);
  assert.deepEqual([...dataUrlToBytes(dataUrl)], [...bytes]);
});

test("data URL inválida é rejeitada antes de converter bytes", () => {
  assert.throws(
    () => dataUrlToBytes("https://example.invalid/evidence.png"),
    (error: unknown) => (error as { code?: string }).code === "VALIDATION",
  );
});

