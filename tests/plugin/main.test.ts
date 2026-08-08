import { Notice, Plugin } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import EnhancedMemosSyncPlugin, { MEMOS_COMMANDS } from "../../src/main";

const MockNotice = Notice as unknown as { messages: string[] };
interface MockPlugin {
  commands: Array<{ id: string; name: string; callback: () => Promise<void> }>;
  ribbon: Array<{ icon: string; title: string; callback: () => Promise<void> }>;
  data?: unknown;
}

describe("plugin entry point", () => {
  beforeEach(() => { MockNotice.messages.splice(0); });

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
