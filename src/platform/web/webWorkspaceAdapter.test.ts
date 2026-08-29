import assert from "node:assert/strict";
import test from "node:test";
import { QA_FLOW_SCHEMA_VERSION } from "../../domain/types.ts";
import { decodePersistedWorkspace } from "./webWorkspaceAdapter.ts";

test("lê o envelope Zustand v2 já persistido sem exigir migração de schema", () => {
  const raw = JSON.stringify({
    state: {
      cases: [],
      plans: [],
      runs: [],
      reports: [],
      evidence: [],
      demandColumns: [],
      demands: [],
      settings: {
        mode: "browser",
        name: "Workspace existente",
        repositoryPath: ".qaflow",
        compactEvidence: true,
      },
      migrationReport: null,
      activeRunId: "RUN-SESSAO-ANTIGA",
    },
    version: QA_FLOW_SCHEMA_VERSION,
  });

  const decoded = decodePersistedWorkspace(raw);
  assert.equal(decoded?.workspace.settings.name, "Workspace existente");
  assert.equal(decoded?.storageRevision, 0);
  assert.equal("activeRunId" in (decoded?.workspace ?? {}), false);
  assert.equal(QA_FLOW_SCHEMA_VERSION, 2);
});

test("não converte conteúdo persistido corrompido em workspace vazio", () => {
  assert.equal(decodePersistedWorkspace("{json quebrado"), null);
});

