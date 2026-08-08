import { Plugin, Setting } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SyncScheduler } from "../../src/lifecycle/scheduler";
import EnhancedMemosSyncPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { validateApiUrl, validateCommentOrderRegex, validateNonNegativeInteger } from "../../src/settings/validation";
import { PersistedStore } from "../../src/state/persisted-store";
import { EnhancedMemosSyncSettingsTab } from "../../src/ui/settings-tab";
import { createAcceptanceSync } from "../support/acceptance";

describe("SPEC 10.1 settings and lifecycle", () => {
  beforeEach(() => { (Setting as unknown as { instances: unknown[] }).instances.splice(0); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("uses every documented single-account default", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      accountName: "Default", enabled: true, apiUrl: "", dailyNoteHeader: "## 📓 Memos", syncDaysLimit: 30,
      memoNoteFolder: "Memos", attachmentFolder: "attachments", createMissingDailyNotes: true, skipImages: false,
      mergeCommentsIntoParent: false, commentOrderRegex: "-- (\\d+)/(\\d+) --", syncOnStartup: false,
      startupDelaySeconds: 5, skipStartupSyncIfSyncedToday: true, periodicSyncIntervalMinutes: 0,
    });
  });

  it("rejects invalid URLs, negative or fractional numbers, and invalid regexes without replacing valid values", () => {
    expect(validateApiUrl("ftp://example.test", "https://saved.test")).toMatchObject({ value: "https://saved.test", error: expect.any(String) });
    expect(validateNonNegativeInteger("-1", 30)).toMatchObject({ value: 30, error: expect.any(String) });
    expect(validateNonNegativeInteger("1.5", 30)).toMatchObject({ value: 30, error: expect.any(String) });
    expect(validateCommentOrderRegex("[", "(\\d+)")).toMatchObject({ value: "(\\d+)", error: expect.any(String) });
  });

  it("exposes one direct account configuration and reports disabled or incomplete settings as non-success", async () => {
    const disabled = createAcceptanceSync({ settings: { enabled: false } });
    const missingToken = createAcceptanceSync({ token: "" });
    await expect(disabled.coordinator.run("smart")).resolves.toMatchObject({ complete: false });
    await expect(missingToken.coordinator.run("smart")).resolves.toMatchObject({ complete: false });
    expect(disabled.fetchCalls).toEqual([]);
    expect(missingToken.fetchCalls).toEqual([]);
  });

  it("renders a direct single-account settings surface with no profile controls", () => {
    const tab = new EnhancedMemosSyncSettingsTab({
      app: {} as never,
      settings: { ...DEFAULT_SETTINGS, apiUrl: "https://memos.example" },
      updateSetting: async () => {},
      updateToken: async () => {},
    });
    tab.display();
    const names = (Setting as unknown as { instances: Array<{ name: string }> }).instances.map((setting) => setting.name);
    expect(names.filter((name) => name === "Account name")).toEqual(["Account name"]);
    expect(names.filter((name) => /profile|add account|remove account/i.test(name))).toEqual([]);
  });

  it("persists accepted settings immediately while preserving in-flight sync state", async () => {
    const saved: unknown[] = [];
    const store = new PersistedStore({
      loadData: async () => ({ state: { cursor: 42, renderSnapshots: {} } }),
      saveData: async (data) => { saved.push(structuredClone(data)); },
    });
    await store.load();
    await store.saveSettings({ ...DEFAULT_SETTINGS, accountName: "Only account" });
    expect(saved.at(-1)).toMatchObject({ settings: { accountName: "Only account" }, state: { cursor: 42 } });
  });

  it("delays startup, skips a successful day, reschedules periodic work, and clears timers on unload", () => {
    let onLayout!: () => void;
    let timeout!: () => void;
    const calls: string[] = [];
    const scheduler = new SyncScheduler({
      onLayoutReady: (callback) => { onLayout = callback; },
      setTimeout: (callback, milliseconds) => { timeout = callback; calls.push(`timeout:${milliseconds}`); return 1; },
      clearTimeout: (id) => calls.push(`clear-timeout:${id}`),
      setInterval: (_callback, milliseconds) => { calls.push(`interval:${milliseconds}`); return 2; },
      clearInterval: (id) => calls.push(`clear-interval:${id}`),
      runSmart: () => { calls.push("sync"); },
      today: () => "2026-01-20",
    });
    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 2, skipStartupSyncIfSyncedToday: false, periodicSyncIntervalMinutes: 5 }, undefined);
    onLayout();
    timeout();
    scheduler.reschedulePeriodic(10);
    scheduler.clear();
    expect(calls).toEqual(["timeout:2000", "interval:300000", "sync", "clear-interval:2", "interval:600000", "clear-interval:2"]);

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: true, periodicSyncIntervalMinutes: 0 }, "2026-01-20");
    const syncCount = calls.filter((call) => call === "sync").length;
    onLayout();
    expect(calls.filter((call) => call === "sync")).toHaveLength(syncCount);
  });

  it("rejects an overlapping sync instead of queueing it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sync = createAcceptanceSync({ fetch: async () => { await gate; return []; } });
    const running = sync.coordinator.run("smart");
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    release();
    await running;
    expect(sync.notices).toContain("A Memos sync is already running.");
  });

  it("cleans the periodic timer through the plugin unload path", async () => {
    const scheduled: number[] = [];
    const cleared: number[] = [];
    vi.stubGlobal("window", {
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: (_callback: () => void, milliseconds: number) => { scheduled.push(milliseconds); return 7; },
      clearInterval: (id: number) => { cleared.push(id); },
    });
    const app = appWithLayout();
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    (plugin as unknown as { data: unknown }).data = {
      settings: { ...DEFAULT_SETTINGS, periodicSyncIntervalMinutes: 2 },
      state: { renderSnapshots: {} },
    };
    await plugin.onload();
    app.layout?.();
    plugin.onunload();
    expect(scheduled).toEqual([120_000]);
    expect(cleared).toEqual([7]);
  });
});

function appWithLayout(): { workspace: { onLayoutReady(callback: () => void): void }; vault: unknown; fileManager: unknown; layout?: () => void } {
  const app: { workspace: { onLayoutReady(callback: () => void): void }; vault: unknown; fileManager: unknown; layout?: () => void } = {
    workspace: { onLayoutReady: (callback) => { app.layout = callback; } },
    vault: {},
    fileManager: {},
  };
  return app;
}
