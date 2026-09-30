import { Notice, Plugin } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EnhancedMemosSyncPlugin, { MEMOS_COMMANDS } from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

const MockNotice = Notice as unknown as { messages: string[] };
interface MockPlugin {
  commands: Array<{ id: string; name: string; callback: () => Promise<void> }>;
  ribbon: Array<{ icon: string; title: string; callback: () => Promise<void> }>;
  data?: unknown;
}

describe("plugin entry point", () => {
  beforeEach(() => { MockNotice.messages.splice(0); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("registers the exact public commands and a smart-sync ribbon callback", async () => {
    const app = appWithLayout();
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin;
    await plugin.onload();

    expect(MEMOS_COMMANDS).toEqual([
      { id: "sync-memos", name: "Smart Sync Memos", mode: "smart" },
      { id: "incremental-sync-memos", name: "Incremental Sync (New Only)", mode: "incremental" },
      { id: "force-sync-memos", name: "Force Sync All Memos", mode: "force" },
    ]);
    expect(mockPlugin.commands.map((command) => [command.id, command.name])).toEqual(MEMOS_COMMANDS.map(({ id, name }) => [id, name]));
    expect(mockPlugin.ribbon.map(({ icon, title }) => [icon, title])).toEqual([["refresh-cw", "Smart Sync Memos"]]);
    await mockPlugin.ribbon[0]?.callback();
    expect(MockNotice.messages.at(-1)).toContain("configuration is incomplete");
  });

  it("defers network work until layout readiness and cleans scheduler timers on unload", async () => {
    const app = appWithLayout();
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    await plugin.onload();

    expect(app.layout).toBeDefined();
    expect(MockNotice.messages).toEqual([]);
    plugin.onunload();
    expect(app.cleared).toEqual([]);
  });

  it("updates in-memory settings before persistence settles so rapid edits merge", async () => {
    const plugin = new EnhancedMemosSyncPlugin(appWithLayout() as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin;
    await plugin.onload();

    const first = plugin.updateSetting("apiUrl", "https://rapid.example");
    expect(plugin.settings.apiUrl).toBe("https://rapid.example");
    const second = plugin.updateSetting("accountName", "Rapid");
    await Promise.all([first, second]);

    expect(mockPlugin.data).toMatchObject({
      settings: { apiUrl: "https://rapid.example", accountName: "Rapid" },
    });
  });

  it("persists legacy token changes without interleaving a concurrent settings save", async () => {
    const plugin = new EnhancedMemosSyncPlugin(appWithLayout() as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin;
    await plugin.onload();

    await Promise.all([
      plugin.updateSetting("apiUrl", "https://legacy.example"),
      plugin.updateToken("legacy-token"),
    ]);

    expect(mockPlugin.data).toMatchObject({
      settings: { apiUrl: "https://legacy.example", apiToken: "legacy-token" },
    });
  });

  it("recovers a prepared deletion journal before registering sync lifecycle work", async () => {
    const files = new Map<string, string>();
    const app = appWithRecoveryVault(files);
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    (plugin as unknown as MockPlugin).data = {
      state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-18", renderSnapshots: {} },
      finalizationJournal: {
        priorState: { cursor: 99, lastSuccessfulSyncDate: "2026-01-18", renderSnapshots: {} },
        nextState: { cursor: 100, lastSuccessfulSyncDate: "2026-01-20", renderSnapshots: {} },
        deletions: [{ path: "Memos/2026-01-19-10.md", content: "restored" }],
      },
    };

    await plugin.onload();

    expect(files.get("Memos/2026-01-19-10.md")).toBe("restored");
    expect((plugin as unknown as MockPlugin).data).toMatchObject({ state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-18" } });
    expect((plugin as unknown as MockPlugin).data).not.toMatchObject({ finalizationJournal: expect.anything() });
  });

  it("restores settings that Obsidian's declarative framework saved outside the envelope", async () => {
    const plugin = new EnhancedMemosSyncPlugin(appWithLayout() as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin;
    mockPlugin.data = { ...DEFAULT_SETTINGS, apiUrl: "https://flat.example", accountName: "Flat" };

    await plugin.onload();

    expect(plugin.settings).toMatchObject({ apiUrl: "https://flat.example", accountName: "Flat" });
    expect(mockPlugin.data).toEqual({
      schemaVersion: 1,
      settings: { ...DEFAULT_SETTINGS, apiUrl: "https://flat.example", accountName: "Flat" },
      state: { renderSnapshots: {} },
    });
  });

  it("still loads recovered settings when the one-time migration rewrite fails", async () => {
    const plugin = new EnhancedMemosSyncPlugin(appWithLayout() as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin & { saveData(data: unknown): Promise<void> };
    mockPlugin.data = { ...DEFAULT_SETTINGS, apiUrl: "https://flat.example" };
    mockPlugin.saveData = async () => { throw new Error("vault locked"); };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(plugin.onload()).resolves.toBeUndefined();

    expect(plugin.settings.apiUrl).toBe("https://flat.example");
    expect(mockPlugin.commands).toHaveLength(MEMOS_COMMANDS.length);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("will retry"));
    errors.mockRestore();
  });

  it("reloads settings and reschedules periodic sync when data.json changes externally", async () => {
    const intervals: number[] = [];
    vi.stubGlobal("window", {
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: (_callback: () => void, milliseconds: number) => { intervals.push(milliseconds); return 3; },
      clearInterval: () => {},
    });
    const app = appWithLayout();
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin;
    await plugin.onload();
    app.layout?.();

    mockPlugin.data = {
      schemaVersion: 1,
      settings: { ...DEFAULT_SETTINGS, apiUrl: "https://synced.example", periodicSyncIntervalMinutes: 30 },
      state: { cursor: 12, renderSnapshots: {} },
    };
    await plugin.onExternalSettingsChange();
    await plugin.updateSetting("accountName", "After sync");

    expect(plugin.settings).toMatchObject({ apiUrl: "https://synced.example", accountName: "After sync" });
    expect(intervals).toEqual([1_800_000]);
    expect(mockPlugin.data).toMatchObject({
      settings: { apiUrl: "https://synced.example", accountName: "After sync" },
      state: { cursor: 12 },
    });
  });

  it("keeps scheduled syncs silent while sync is disabled", async () => {
    let tick!: () => void;
    vi.stubGlobal("window", {
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: (callback: () => void) => { tick = callback; return 3; },
      clearInterval: () => {},
    });
    const app = appWithLayout();
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    (plugin as unknown as MockPlugin).data = {
      settings: { ...DEFAULT_SETTINGS, enabled: false, apiUrl: "https://memos.example", periodicSyncIntervalMinutes: 5 },
    };
    await plugin.onload();
    app.layout?.();

    tick();
    await Promise.resolve();
    expect(MockNotice.messages).toEqual([]);

    await (plugin as unknown as MockPlugin).commands[0]?.callback();
    expect(MockNotice.messages.at(-1)).toContain("configuration is incomplete");
  });

  it("keeps unexpected command and ribbon errors redacted", async () => {
    const plugin = new EnhancedMemosSyncPlugin(appWithLayout() as never, {} as never) as EnhancedMemosSyncPlugin & Plugin;
    const mockPlugin = plugin as unknown as MockPlugin;
    await plugin.onload();
    (plugin as unknown as { coordinator: { run(mode: unknown): Promise<void> } }).coordinator = {
      run: async () => { throw new Error("token-to-redact"); },
    };

    await mockPlugin.commands[0]?.callback();
    await mockPlugin.ribbon[0]?.callback();

    expect(MockNotice.messages).toEqual([
      "Memos sync failed unexpectedly.",
      "Memos sync failed unexpectedly.",
    ]);
    expect(MockNotice.messages.join("\n")).not.toContain("token-to-redact");
  });
});

function appWithLayout(): { workspace: { onLayoutReady(callback: () => void): void }; vault: unknown; fileManager: unknown; layout?: () => void; cleared: number[] } {
  const app: { workspace: { onLayoutReady(callback: () => void): void }; vault: unknown; fileManager: unknown; layout?: () => void; cleared: number[] } = {
    workspace: { onLayoutReady: (callback) => { app.layout = callback; } },
    vault: {},
    fileManager: {},
    cleared: [],
  };
  return app;
}

function appWithRecoveryVault(files: Map<string, string>) {
  const app = appWithLayout();
  app.vault = {
    getAbstractFileByPath: (path: string) => files.has(path) ? { path, extension: "md" } : null,
    createFolder: async () => {},
    create: async (path: string, content: string) => {
      files.set(path, content);
      return { path, extension: "md" };
    },
    createBinary: async () => ({ path: "", extension: "" }),
    read: async (file: { path: string }) => files.get(file.path) ?? "",
    process: async (file: { path: string }, update: (content: string) => string) => {
      files.set(file.path, update(files.get(file.path) ?? ""));
      return files.get(file.path) ?? "";
    },
    getMarkdownFiles: () => [],
  };
  app.fileManager = { trashFile: async () => {} };
  return app;
}
