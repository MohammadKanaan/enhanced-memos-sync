import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestedSyncMode, SyncResult } from "../../src/core/types";
import EnhancedMemosSyncPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

describe("sync error logging", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: () => 7,
      clearInterval: () => {},
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function loadedPlugin(settings: Partial<typeof DEFAULT_SETTINGS> = {}): Promise<EnhancedMemosSyncPlugin> {
    const app = {
      workspace: { onLayoutReady: (_callback: () => void) => {} },
      vault: {},
      fileManager: {},
    };
    const plugin = new EnhancedMemosSyncPlugin(app as never, {} as never);
    (plugin as unknown as { data: unknown }).data = {
      settings: { ...DEFAULT_SETTINGS, ...settings },
      state: { renderSnapshots: {} },
    };
    await plugin.onload();
    return plugin;
  }

  function stubCoordinator(plugin: EnhancedMemosSyncPlugin, run: () => Promise<SyncResult>) {
    (plugin as unknown as { coordinator: unknown }).coordinator = { run };
  }

  function syncCommand(plugin: EnhancedMemosSyncPlugin, mode: RequestedSyncMode): () => Promise<void> {
    const command = (plugin as unknown as { commands: Array<{ id: string; callback: () => unknown }> }).commands
      .find((candidate) => candidate.id === "sync-memos");
    if (!command) throw new Error("sync-memos command not registered");
    return command.callback as () => Promise<void>;
  }

  function result(diagnostics: SyncResult["diagnostics"]): SyncResult {
    return { requestedMode: "smart", complete: false, diagnostics, counts: {
      fetched: 0, normalized: 0, memoNotesWritten: 0, attachmentsDownloaded: 0, dailyNotesModified: 0, memoNotesTrashed: 0,
    } };
  }

  it("logs error diagnostics to the console with the plugin prefix", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const plugin = await loadedPlugin();
    stubCoordinator(plugin, async () => result([
      { severity: "error", stage: "memo-write", path: "Memos/a.md", message: "Memo note could not be written." },
      { severity: "warning", stage: "deletion", message: "Memo note was not eligible for deletion." },
    ]));
    await syncCommand(plugin, "smart")();
    expect(errorSpy).toHaveBeenCalledWith(
      "[Enhanced Memos Sync] [memo-write] Memo note could not be written. (Memos/a.md)",
    );
    expect(debugSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("logs warning diagnostics only when debug logging is enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const plugin = await loadedPlugin({ debugLogging: true });
    stubCoordinator(plugin, async () => result([
      { severity: "warning", stage: "deletion", message: "Memo note was not eligible for deletion." },
    ]));
    await syncCommand(plugin, "smart")();
    expect(debugSpy).toHaveBeenCalledWith(
      "[Enhanced Memos Sync] [deletion] Memo note was not eligible for deletion.",
    );
    debugSpy.mockRestore();
  });

  it("does not log warnings when debug logging is disabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const plugin = await loadedPlugin({ debugLogging: false });
    stubCoordinator(plugin, async () => result([
      { severity: "warning", stage: "deletion", message: "Memo note was not eligible for deletion." },
    ]));
    await syncCommand(plugin, "smart")();
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs a final-guard error when the coordinator itself throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const plugin = await loadedPlugin();
    stubCoordinator(plugin, async () => { throw new Error("boom"); });
    await syncCommand(plugin, "smart")();
    expect(errorSpy).toHaveBeenCalledWith("[Enhanced Memos Sync] sync failed unexpectedly");
    errorSpy.mockRestore();
  });

  it("keeps the console quiet on a clean sync", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const plugin = await loadedPlugin();
    stubCoordinator(plugin, async () => result([]));
    await syncCommand(plugin, "smart")();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });
});