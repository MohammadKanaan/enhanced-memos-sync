import { Setting } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { EnhancedMemosSyncSettingsTab, type SettingsTabHost } from "../../src/ui/settings-tab";

interface MockSetting {
  name: string;
  text?: { inputEl: { type: string }; value: string; trigger(value: string): Promise<void> };
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
  };
}

describe("settings tab", () => {
  beforeEach(() => { MockSettings.instances.splice(0); });

  it("renders one direct account surface with all controls and a password token input", () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);
    tab.display();

    expect(MockSettings.instances.map((candidate) => candidate.name)).toEqual([
      "Account name", "Enabled", "API URL", "API token", "Daily-note header", "Sync-days limit",
      "Memo-note folder", "Attachment folder", "Create missing daily notes", "Skip images",
      "Merge comments into parent", "Comment-order regex", "Sync on startup", "Startup delay",
      "Skip startup sync if synced today", "Periodic sync interval",
    ]);
    expect(setting("API token").text?.inputEl.type).toBe("password");
  });

  it("persists valid values immediately and keeps the prior regex with a persistent inline error", async () => {
    const plugin = host();
    const tab = new EnhancedMemosSyncSettingsTab(plugin);
    tab.display();

    await setting("API URL").text?.trigger(" https://new.example/// ");
    await setting("Comment-order regex").text?.trigger("[");

    expect(plugin.saves).toContainEqual(["apiUrl", "https://new.example"]);
    expect(plugin.saves).not.toContainEqual(["commentOrderRegex", "["]);
    expect(setting("Comment-order regex").text?.value).toBe(DEFAULT_SETTINGS.commentOrderRegex);
    expect(setting("Comment-order regex").descEl.children.map((child) => child.text)).toContain("Enter a valid regular expression.");
  });
});
