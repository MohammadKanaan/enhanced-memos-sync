import { Setting } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { EnhancedMemosSyncSettingsTab, type SettingsTabHost } from "../../src/ui/settings-tab";

interface MockSetting {
  name: string;
  text?: { inputEl: { type: string }; value: string; trigger(value: string): Promise<void> };
  toggle?: { value: boolean };
  descEl: { children: Array<{ text: string }> };
}

const MockSettings = Setting as unknown as { instances: MockSetting[] };

function setting(name: string): MockSetting {
  const found = MockSettings.instances.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing setting: ${name}`);
  return found;
}

function host(): SettingsTabHost & { saves: Array<[string, unknown]>; tokens: string[] } {
  const saves: Array<[string, unknown]> = [];
  const tokens: string[] = [];
  return {
    app: {} as never,
    settings: { ...DEFAULT_SETTINGS, apiUrl: "https://memos.example" },
    saves,
    tokens,
    updateSetting: async (key, value) => {
      saves.push([key, value]);
    },
    updateToken: async (value) => { tokens.push(value); },
    getToken: async () => "stored-token",
  };
}

describe("settings tab", () => {
  beforeEach(() => { MockSettings.instances.splice(0); });

  it("renders one direct account surface with all controls and restores the stored token into a password input", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);
    tab.display();

    expect(MockSettings.instances.filter((c) => c.text || c.toggle).map((candidate) => candidate.name)).toEqual([
      "Account name", "Enabled",
      "API URL", "API token",
      "Daily-note header", "Create missing daily notes",
      "Memo-note folder", "Attachment folder",
      "Sync-days limit", "Skip images", "Merge comments into parent", "Comment-order regex",
      "Sync on startup", "Startup delay", "Skip startup sync if synced today", "Periodic sync interval",
      "Debug logging",
    ]);
    expect(setting("API token").text?.inputEl.type).toBe("password");
    await Promise.resolve();
    expect(setting("API token").text?.value).toBe("stored-token");
  });

  it("persists valid values immediately and keeps the prior regex with a persistent inline error", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);
    tab.display();

    await setting("API URL").text?.trigger(" https://new.example/// ");
    await setting("Comment-order regex").text?.trigger("[");

    expect(plugin.saves).toContainEqual(["apiUrl", "https://new.example"]);
    expect(plugin.saves).not.toContainEqual(["commentOrderRegex", "["]);
    expect(plugin.settings.commentOrderRegex).toBe(DEFAULT_SETTINGS.commentOrderRegex);
    expect(setting("Comment-order regex").descEl.children.map((child) => child.text)).toContain("Enter a valid regular expression.");
  });

  it("lets partial input be typed character by character without resetting the field", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);
    tab.display();

    for (const partial of ["h", "https:", "https://new.example", "https://new.example/"]) {
      await setting("API URL").text?.trigger(partial);
    }
    await setting("Memo-note folder").text?.trigger("Notes/");
    await setting("Memo-note folder").text?.trigger("Notes/Memos");

    expect(setting("API URL").text?.value).toBe("https://new.example/");
    expect(setting("Memo-note folder").text?.value).toBe("Notes/Memos");
    expect(plugin.saves).toEqual([
      ["apiUrl", "https://new.example"],
      ["apiUrl", "https://new.example"],
      ["memoNoteFolder", "Notes"],
      ["memoNoteFolder", "Notes/Memos"],
    ]);
  });

  it("routes declarative control writes through the host instead of raw settings", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);

    expect(tab.getControlValue("apiUrl")).toBe("https://memos.example");
    await tab.setControlValue("apiUrl", "https://declarative.example");

    expect(plugin.saves).toContainEqual(["apiUrl", "https://declarative.example"]);
    expect(plugin.saves).not.toContainEqual(["commentOrderRegex", "["]);
  });

  it("normalizes declarative control writes exactly like the imperative settings", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);

    await tab.setControlValue("apiUrl", " https://memos.example/sub/// ");
    await tab.setControlValue("accountName", "  Work  ");
    await tab.setControlValue("dailyNoteHeader", "  ## Memos  ");
    await tab.setControlValue("memoNoteFolder", " /Notes/Memos/ ");
    await tab.setControlValue("periodicSyncIntervalMinutes", 15);
    await tab.setControlValue("enabled", false);

    expect(plugin.saves).toEqual([
      ["apiUrl", "https://memos.example/sub"],
      ["accountName", "Work"],
      ["dailyNoteHeader", "## Memos"],
      ["memoNoteFolder", "Notes/Memos"],
      ["periodicSyncIntervalMinutes", 15],
      ["enabled", false],
    ]);
  });

  it("rejects invalid declarative values without persisting them", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);

    await expect(tab.setControlValue("apiUrl", "ftp://memos.example")).rejects.toThrow();
    await expect(tab.setControlValue("dailyNoteHeader", "   ")).rejects.toThrow();
    await expect(tab.setControlValue("memoNoteFolder", "../outside")).rejects.toThrow();
    await expect(tab.setControlValue("periodicSyncIntervalMinutes", 99_999)).rejects.toThrow();
    await expect(tab.setControlValue("syncDaysLimit", 1.5)).rejects.toThrow();
    await expect(tab.setControlValue("enabled", "yes")).rejects.toThrow();
    await expect(tab.setControlValue("unknown", 1)).rejects.toThrow();

    expect(plugin.saves).toEqual([]);
  });

  it("declares bounded numeric controls", () => {
    const tab = new EnhancedMemosSyncSettingsTab(host());
    const controls = tab.getSettingDefinitions()
      .flatMap((item) => "items" in item ? item.items ?? [] : [item])
      .flatMap((item) => "control" in item ? [item.control] : []);
    const periodic = controls.find((control) => control?.key === "periodicSyncIntervalMinutes");

    expect(periodic).toMatchObject({ type: "number", min: 0, max: 10_080 });
    expect(periodic && "validate" in periodic ? periodic.validate?.(99_999 as never) : undefined).toEqual(expect.any(String));
  });
});
