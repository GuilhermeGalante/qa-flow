import assert from "node:assert/strict";
import test from "node:test";
import type { SaveState } from "../platform/contracts/dtos.ts";
import { desktopError } from "../platform/contracts/errors.ts";
import { CommitCoordinator, skipped } from "./commitCoordinator.ts";

test("falha de commit não envenena a fila e a operação seguinte confirma", async () => {
  let revision = 0;
  const states: SaveState[] = [];
  const coordinator = new CommitCoordinator({
    getStorageRevision: () => revision,
    setSaveState: (state) => states.push(state),
  });

  const failed = coordinator.enqueue("OP-FAIL", () => ({
    kind: "commit" as const,
    execute: async () => {
      throw desktopError("DISK_FULL", "Disco cheio.", { retryable: true });
    },
    apply: () => assert.fail("commit com erro não pode aplicar estado"),
    result: () => ({ ok: true, message: "não alcançado" }),
  }));
  const succeeded = coordinator.enqueue("OP-NEXT", () => ({
    kind: "commit" as const,
    execute: async (expectedStorageRevision: number) => ({
      storageRevision: expectedStorageRevision + 1,
      committedAt: "2026-09-08T12:00:00.000Z",
    }),
    apply: (confirmation: { storageRevision: number }) => { revision = confirmation.storageRevision; },
    result: () => ({ ok: true, message: "confirmado" }),
  }));

  assert.equal((await failed).error?.code, "DISK_FULL");
  assert.equal((await succeeded).ok, true);
  assert.equal(revision, 1);
  assert.deepEqual(states.map((state) => state.kind), ["saving", "error", "saving", "idle"]);
});

test("operação ignorada não entra em saving nem executa commit", async () => {
  const states: SaveState[] = [];
  const coordinator = new CommitCoordinator({
    getStorageRevision: () => 7,
    setSaveState: (state) => states.push(state),
  });

  const result = await coordinator.enqueue("OP-SKIP", () => skipped({
    ok: false,
    message: "Validação rejeitada antes de persistir.",
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(states, []);
});

