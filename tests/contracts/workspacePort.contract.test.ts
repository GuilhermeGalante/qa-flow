import assert from "node:assert/strict";
import test from "node:test";
import type { StorageMutation } from "../../src/platform/contracts/dtos.ts";
import type { WorkspacePort } from "../../src/platform/contracts/ports.ts";
import { MemoryWorkspaceAdapter } from "../../src/platform/desktop/memoryWorkspaceAdapter.ts";
import { WebWorkspaceAdapter } from "../../src/platform/web/webWorkspaceAdapter.ts";
import { AsyncStorageHarness } from "../helpers/asyncStorageHarness.ts";
import { buildCase, buildEvidence } from "../helpers/domainBuilders.ts";

const implementations: Array<{ name: string; create(): WorkspacePort }> = [
  { name: "memory", create: () => new MemoryWorkspaceAdapter() },
  { name: "web", create: () => new WebWorkspaceAdapter(new AsyncStorageHarness()) },
];

for (const implementation of implementations) {
  test(`${implementation.name}: commit aplica a mutação, avança uma revisão e devolve clones`, async () => {
    const port = implementation.create();
    await port.initialize();
    const candidate = buildCase();
    const mutation: StorageMutation = {
      kind: "case",
      action: "upsert",
      id: candidate.id,
      payload: candidate,
    };

    const response = await port.commit({
      operationId: "OP-COMMIT",
      expectedStorageRevision: 0,
      mutations: [mutation],
    });
    const snapshot = await port.initialize();

    assert.equal(response.storageRevision, 1);
    assert.equal(snapshot.storageRevision, 1);
    assert.deepEqual(response.changed, [{ kind: "case", id: candidate.id, payload: candidate }]);
    assert.equal(snapshot.workspace.cases[0].title, candidate.title);

    snapshot.workspace.cases[0].title = "Mutado fora do adapter";
    assert.equal((await port.initialize()).workspace.cases[0].title, candidate.title);
  });

  test(`${implementation.name}: revisão divergente falha sem alterar o snapshot confirmado`, async () => {
    const port = implementation.create();
    await port.initialize();
    const candidate = buildCase();
    await port.commit({
      operationId: "OP-FIRST",
      expectedStorageRevision: 0,
      mutations: [{ kind: "case", action: "upsert", id: candidate.id, payload: candidate }],
    });

    await assert.rejects(
      port.commit({ operationId: "OP-STALE", expectedStorageRevision: 0, mutations: [] }),
      (error: unknown) => {
        const typed = error as { code?: string; currentStorageRevision?: number };
        return typed.code === "CONFLICT" && typed.currentStorageRevision === 1;
      },
    );

    const snapshot = await port.initialize();
    assert.equal(snapshot.storageRevision, 1);
    assert.deepEqual(snapshot.workspace.cases, [candidate]);
  });

  test(`${implementation.name}: payload inválido reverte o commit inteiro`, async () => {
    const port = implementation.create();
    await port.initialize();
    const candidate = buildCase();

    await assert.rejects(port.commit({
      operationId: "OP-INVALID",
      expectedStorageRevision: 0,
      mutations: [{ kind: "case", action: "upsert", id: "CASE-OTHER", payload: candidate }],
    }), (error: unknown) => (error as { code?: string }).code === "VALIDATION");

    const snapshot = await port.initialize();
    assert.equal(snapshot.storageRevision, 0);
    assert.deepEqual(snapshot.workspace.cases, []);
  });

  test(`${implementation.name}: ciclo de evidência preserva bytes e remove metadados`, async () => {
    const port = implementation.create();
    await port.initialize();
    const meta = buildEvidence();
    const bytes = Uint8Array.from([137, 80, 78, 71]);

    const added = await port.addEvidence({
      operationId: "OP-EVIDENCE-ADD",
      expectedStorageRevision: 0,
      meta,
      mutations: [],
    }, bytes);
    const persisted = await port.readEvidence(meta.id);

    assert.equal(added.storageRevision, 1);
    assert.equal(persisted.mimeType, meta.mimeType);
    assert.deepEqual([...persisted.bytes], [...bytes]);

    const removed = await port.removeEvidence({
      operationId: "OP-EVIDENCE-REMOVE",
      expectedStorageRevision: 1,
      evidenceId: meta.id,
      mutations: [],
    });

    assert.equal(removed.storageRevision, 2);
    assert.deepEqual((await port.initialize()).workspace.evidence, []);
    await assert.rejects(port.readEvidence(meta.id));
  });
}

