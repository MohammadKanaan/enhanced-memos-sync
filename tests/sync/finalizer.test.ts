import { describe, expect, it } from "vitest";

import { PersistedSyncFinalizer } from "../../src/sync/finalizer";
import { PersistedStore } from "../../src/state/persisted-store";
import { InMemoryVault } from "../support/in-memory-vault";

class DataAdapter {
  saved: unknown;
  attempts = 0;
  failAttempt?: number;

  constructor(initial: unknown) {
    this.saved = structuredClone(initial);
  }

  async loadData(): Promise<unknown> {
    return structuredClone(this.saved);
  }

  async saveData(data: unknown): Promise<void> {
    this.attempts += 1;
    if (this.attempts === this.failAttempt) throw new Error("save failed");
    this.saved = structuredClone(data);
  }
}

const priorState = { cursor: 99, lastSuccessfulSyncDate: "2026-01-18", renderSnapshots: {} };
const nextState = { cursor: 100, lastSuccessfulSyncDate: "2026-01-20", renderSnapshots: {} };
const content = "---\nmemo_id: 10\n---\noriginal\n";

describe("persisted sync finalizer", () => {
  it("restores preflight content and prior cursor state when the terminal state save fails", async () => {
    const adapter = new DataAdapter({ state: priorState });
    adapter.failAttempt = 2;
    const store = new PersistedStore(adapter);
    const vault = new InMemoryVault();
    vault.text.set("Memos/2026-01-19-10.md", content);
    const finalizer = new PersistedSyncFinalizer(store, vault);

    await expect(finalizer.finalizeSuccessfulSync({
      priorState,
      nextState,
      deletions: [{ path: "Memos/2026-01-19-10.md", content }],
    })).rejects.toMatchObject({ stage: "state" });

    expect(vault.text.get("Memos/2026-01-19-10.md")).toBe(content);
    await expect(store.load()).resolves.toMatchObject({ state: priorState });
    expect(adapter.saved).not.toMatchObject({ finalizationJournal: expect.anything() });
  });

  it("recovers a durable prepared journal after an interrupted deletion", async () => {
    const adapter = new DataAdapter({ state: priorState });
    const vault = new InMemoryVault();
    vault.text.set("Memos/2026-01-19-10.md", content);
    const firstStore = new PersistedStore(adapter);
    await firstStore.prepareFinalization({
      priorState,
      nextState,
      deletions: [{ path: "Memos/2026-01-19-10.md", content }],
    });
    await vault.trash("Memos/2026-01-19-10.md");

    const recoveredStore = new PersistedStore(adapter);
    await expect(recoveredStore.recoverPendingFinalization(vault)).resolves.toBe(true);

    expect(vault.text.get("Memos/2026-01-19-10.md")).toBe(content);
    await expect(recoveredStore.load()).resolves.toMatchObject({ state: priorState });
    expect(adapter.saved).not.toMatchObject({ finalizationJournal: expect.anything() });
  });

  it("does not overwrite a candidate that is still present during startup recovery", async () => {
    const adapter = new DataAdapter({ state: priorState });
    const vault = new InMemoryVault();
    vault.text.set("Memos/2026-01-19-10.md", "local content written after preparation");
    const store = new PersistedStore(adapter);
    await store.prepareFinalization({
      priorState,
      nextState,
      deletions: [{ path: "Memos/2026-01-19-10.md", content }],
    });

    await store.recoverPendingFinalization(vault);

    expect(vault.text.get("Memos/2026-01-19-10.md")).toBe("local content written after preparation");
    await expect(store.load()).resolves.toMatchObject({ state: priorState });
  });

  it("does not replace a prepared journal when trash succeeded but recovery failed", async () => {
    const adapter = new DataAdapter({ state: priorState });
    adapter.failAttempt = 2;
    const vault = new InMemoryVault();
    vault.text.set("Memos/2026-01-19-10.md", content);
    vault.failWritesFor.add("Memos/2026-01-19-10.md");
    const store = new PersistedStore(adapter);
    const finalizer = new PersistedSyncFinalizer(store, vault);
    const first = {
      priorState,
      nextState,
      deletions: [{ path: "Memos/2026-01-19-10.md", content }],
    };

    await expect(finalizer.finalizeSuccessfulSync(first)).rejects.toMatchObject({ stage: "state" });
    await expect(finalizer.finalizeSuccessfulSync({
      priorState: nextState,
      nextState: { cursor: 101, renderSnapshots: {} },
      deletions: [],
    })).rejects.toMatchObject({ stage: "state" });

    await expect(store.load()).resolves.toMatchObject({ finalizationJournal: first });
  });
});
