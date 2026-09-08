import assert from "node:assert/strict";
import test from "node:test";
import { QA_FLOW_SCHEMA_VERSION } from "../../src/domain/types.ts";
import { createEmptyWorkspaceData } from "../../src/platform/contracts/workspaceData.ts";
import { WebWorkspaceAdapter, WEB_STORE_KEY, webEvidenceKey } from "../../src/platform/web/webWorkspaceAdapter.ts";
import { AsyncStorageHarness } from "../helpers/asyncStorageHarness.ts";
import { buildBundle, buildEvidence } from "../helpers/domainBuilders.ts";

test("INT-009: armazenamento corrompido falha sem substituir o conteúdo persistido", async () => {
  const storage = new AsyncStorageHarness();
  const corrupted = "{workspace truncado";
  storage.values.set(WEB_STORE_KEY, corrupted);
  const adapter = new WebWorkspaceAdapter(storage);

  await assert.rejects(
    adapter.initialize(),
    (error: unknown) => (error as { code?: string }).code === "CORRUPT_STORAGE",
  );

  assert.equal(storage.values.get(WEB_STORE_KEY), corrupted);
  assert.equal(adapter.snapshot().storageRevision, 0);
  assert.deepEqual(adapter.snapshot().workspace.cases, []);
});

test("INT-007: verificação de integridade detecta metadado sem binário", async () => {
  const storage = new AsyncStorageHarness();
  const workspace = createEmptyWorkspaceData();
  const meta = buildEvidence();
  workspace.evidence = [meta];
  storage.values.set(WEB_STORE_KEY, JSON.stringify({
    state: workspace,
    version: QA_FLOW_SCHEMA_VERSION,
  }));
  const adapter = new WebWorkspaceAdapter(storage);

  await adapter.initialize();
  const report = await adapter.verifyIntegrity();

  assert.equal(report.status, "degraded");
  assert.deepEqual(report.issues, [{
    path: `evidence.${meta.id}`,
    message: "Conteúdo binário ausente.",
  }]);
});

test("INT-008: falha ao confirmar metadados compensa o blob recém-gravado", async () => {
  const storage = new AsyncStorageHarness();
  const adapter = new WebWorkspaceAdapter(storage);
  await adapter.initialize();
  const meta = buildEvidence();

  storage.failNextSet(WEB_STORE_KEY);
  await assert.rejects(adapter.addEvidence({
    operationId: "OP-EVIDENCE",
    expectedStorageRevision: 0,
    meta,
    mutations: [],
  }, Uint8Array.from([137, 80, 78, 71])));

  assert.equal(storage.values.has(webEvidenceKey(meta.id)), false);
  assert.equal((await adapter.initialize()).storageRevision, 0);
  assert.deepEqual((await adapter.initialize()).workspace.evidence, []);
});

test("INT-008: falha na limpeza de blob obsoleto não reporta como falha um workspace já confirmado", async () => {
  const storage = new AsyncStorageHarness();
  const adapter = new WebWorkspaceAdapter(storage);
  await adapter.initialize();
  const meta = buildEvidence();
  await adapter.addEvidence({
    operationId: "OP-EVIDENCE",
    expectedStorageRevision: 0,
    meta,
    mutations: [],
  }, Uint8Array.from([137, 80, 78, 71]));

  storage.failNextDelete(webEvidenceKey(meta.id));
  const response = await adapter.removeEvidence({
    operationId: "OP-REMOVE",
    expectedStorageRevision: 1,
    evidenceId: meta.id,
    mutations: [],
  });

  assert.equal(response.storageRevision, 2);
  assert.deepEqual((await adapter.initialize()).workspace.evidence, []);
  const reopened = new WebWorkspaceAdapter(storage);
  assert.deepEqual((await reopened.initialize()).workspace.evidence, []);
});

test("INT-014: importação restaura blobs preparados quando o workspace não confirma", async () => {
  const storage = new AsyncStorageHarness();
  const adapter = new WebWorkspaceAdapter(storage);
  await adapter.initialize();
  const meta = buildEvidence({ id: "EVD-IMPORTED" });
  const key = webEvidenceKey(meta.id);

  storage.failNextSet(WEB_STORE_KEY);
  await assert.rejects(adapter.applyBundle(buildBundle({
    evidence: [{ meta, dataUrl: "data:image/png;base64,iVBORw==" }],
  }), "replace", 0));

  assert.equal(storage.values.has(key), false);
  assert.equal((await adapter.initialize()).storageRevision, 0);
  assert.deepEqual((await adapter.initialize()).workspace.evidence, []);
});
