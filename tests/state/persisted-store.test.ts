import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { PersistedStore } from "../../src/state/persisted-store";

class FakeDataAdapter {
  readonly saved: unknown[] = [];

  constructor(private readonly loaded: unknown) {}

  async loadData(): Promise<unknown> {
    return this.loaded;
  }

  async saveData(data: unknown): Promise<void> {
    await Promise.resolve();
    this.saved.push(structuredClone(data));
  }
}

describe("PersistedStore", () => {
  it("merges known partial persisted data over defaults and drops unknown data", async () => {
    const store = new PersistedStore(
      new FakeDataAdapter({
        settings: { accountName: "Personal", unknownSetting: true },
        state: { cursor: 0, unknownState: true },
        unknownRoot: true,
      }),
    );

    await expect(store.load()).resolves.toEqual({
      schemaVersion: 1,
      settings: { ...DEFAULT_SETTINGS, accountName: "Personal" },
      state: { renderSnapshots: {} },
    });
  });

  it("serializes concurrent writes without losing settings or state", async () => {
    const adapter = new FakeDataAdapter(undefined);
    const store = new PersistedStore(adapter);
    await store.load();

    await Promise.all([
      store.saveSettings({ ...DEFAULT_SETTINGS, accountName: "Work" }),
      store.updateState((state) => ({ ...state, cursor: 42 })),
    ]);

    expect(adapter.saved).toHaveLength(2);
    expect(adapter.saved.at(-1)).toEqual({
      schemaVersion: 1,
      settings: { ...DEFAULT_SETTINGS, accountName: "Work" },
      state: { cursor: 42, renderSnapshots: {} },
    });
  });

  it("preserves sync state while saving settings", async () => {
    const adapter = new FakeDataAdapter({
      state: { cursor: 42, lastSuccessfulSyncDate: "2026-08-08" },
    });
    const store = new PersistedStore(adapter);
    await store.load();

    await store.saveSettings({ ...DEFAULT_SETTINGS, enabled: false });

    expect(adapter.saved.at(-1)).toMatchObject({
      settings: { enabled: false },
      state: {
        cursor: 42,
        lastSuccessfulSyncDate: "2026-08-08",
        renderSnapshots: {},
      },
    });
  });

  it("retains a prepared finalization journal through a queued settings save", async () => {
    const adapter = new FakeDataAdapter({ state: { cursor: 99, renderSnapshots: {} } });
    const store = new PersistedStore(adapter);
    await store.load();
    const journal = {
      priorState: { cursor: 99, renderSnapshots: {} },
      nextState: { cursor: 100, renderSnapshots: {} },
      deletions: [{ path: "Memos/2026-01-19-10.md", content: "original" }],
    };

    await Promise.all([
      store.prepareFinalization(journal),
      store.saveSettings({ ...DEFAULT_SETTINGS, accountName: "Updated while prepared" }),
    ]);

    await expect(store.load()).resolves.toMatchObject({
      settings: { accountName: "Updated while prepared" },
      finalizationJournal: journal,
    });
  });
});
