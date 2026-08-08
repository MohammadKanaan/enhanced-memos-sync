import { PluginSettingTab, Setting, type App, type TextComponent, type ToggleComponent } from "obsidian";

import { DEFAULT_SETTINGS } from "../settings/defaults";
import type { PluginSettings } from "../settings/types";
import {
  normalizeHeader,
  validateApiUrl,
  validateCommentOrderRegex,
  validateFolder,
  validateNonNegativeInteger,
  type ValidationResult,
} from "../settings/validation";

export interface SettingsTabHost {
  app: App;
  settings: PluginSettings;
  updateSetting<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]): Promise<void>;
  updateToken(value: string): Promise<void>;
  getToken(): Promise<string | undefined>;
}

/** Standard single-account settings UI. Every accepted edit is durable before it is shown as saved. */
export class EnhancedMemosSyncSettingsTab extends PluginSettingTab {
  constructor(private readonly host: SettingsTabHost) {
    super(host.app, host as never);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Enhanced Memos Sync" });

    this.text("Account name", "Used in memo metadata and diagnostics.", "accountName", (value, previous) => ({ value: value.trim() || previous }));
    this.toggle("Enabled", "Synchronize this Memos account.", "enabled");
    this.text("API URL", "Your Memos server URL.", "apiUrl", validateApiUrl);
    this.token();
    this.text("Daily-note header", "Heading for the managed daily-note section.", "dailyNoteHeader", (value) => ({ value: normalizeHeader(value) }));
    this.integer("Sync-days limit", "Days to include; 0 means unlimited.", "syncDaysLimit");
    this.text("Memo-note folder", "Folder for generated memo notes.", "memoNoteFolder", (value, previous) => validateFolder(value, previous, DEFAULT_SETTINGS.memoNoteFolder));
    this.text("Attachment folder", "Folder for downloaded attachments.", "attachmentFolder", (value, previous) => validateFolder(value, previous, DEFAULT_SETTINGS.attachmentFolder));
    this.toggle("Create missing daily notes", "Create daily notes when a memo needs one.", "createMissingDailyNotes");
    this.toggle("Skip images", "Do not download or embed image resources.", "skipImages");
    this.toggle("Merge comments into parent", "Write replies into their parent memo note.", "mergeCommentsIntoParent");
    this.text("Comment-order regex", "Optional pattern; blank keeps chronological order.", "commentOrderRegex", validateCommentOrderRegex);
    this.toggle("Sync on startup", "Run a smart sync after Obsidian finishes loading.", "syncOnStartup");
    this.integer("Startup delay", "Seconds to wait before startup sync.", "startupDelaySeconds");
    this.toggle("Skip startup sync if synced today", "Avoid startup sync after a complete sync today.", "skipStartupSyncIfSyncedToday");
    this.integer("Periodic sync interval", "Minutes between smart syncs; 0 disables it.", "periodicSyncIntervalMinutes");
  }

  private text<K extends TextKey | NumberKey>(
    name: string,
    description: string,
    key: K,
    validate: (input: string, previous: PluginSettings[K]) => ValidationResult<PluginSettings[K]>,
  ): void {
    const setting = new Setting(this.containerEl).setName(name).setDesc(description);
    const error = setting.descEl.createDiv({ cls: "enhanced-memos-sync-validation-error" });
    setting.addText((component) => {
      component.setValue(String(this.host.settings[key] ?? ""));
      component.onChange(async (input) => {
        const previous = this.host.settings[key];
        const result = validate(input, previous);
        if (result.error) {
          component.setValue(String(result.value));
          error.textContent = result.error;
          return;
        }
        try {
          await this.host.updateSetting(key, result.value);
          component.setValue(String(this.host.settings[key] ?? result.value));
          error.textContent = "";
        } catch {
          component.setValue(String(previous));
          error.textContent = "Unable to save this setting.";
        }
      });
    });
  }

  private integer<K extends NumberKey>(name: string, description: string, key: K): void {
    this.text(name, description, key, validateNonNegativeInteger as (
      input: string,
      previous: PluginSettings[K],
    ) => ValidationResult<PluginSettings[K]>);
  }

  private toggle<K extends ToggleKey>(name: string, description: string, key: K): void {
    new Setting(this.containerEl).setName(name).setDesc(description).addToggle((component: ToggleComponent) => {
      component.setValue(this.host.settings[key]);
      component.onChange(async (value) => {
        try {
          await this.host.updateSetting(key, value as PluginSettings[K]);
        } catch {
          component.setValue(this.host.settings[key]);
        }
      });
    });
  }

  private token(): void {
    const setting = new Setting(this.containerEl)
      .setName("API token")
      .setDesc("Stored securely when supported by Obsidian.");
    const error = setting.descEl.createDiv({ cls: "enhanced-memos-sync-validation-error" });
    setting.addText((component: TextComponent) => {
      component.inputEl.type = "password";
      component.setValue(this.host.settings.apiToken ?? "");
      let changed = false;
      void this.host.getToken().then(
        (token) => {
          if (!changed) component.setValue(token ?? "");
        },
        () => {
          if (!changed) error.textContent = "Unable to load the stored API token.";
        },
      );
      component.onChange(async (value) => {
        changed = true;
        try {
          await this.host.updateToken(value);
          error.textContent = "";
        } catch {
          // Never include a token or a host error (which could contain one) in the settings UI.
          error.textContent = "Unable to save the API token.";
        }
      });
    });
  }
}

type TextKey = "accountName" | "apiUrl" | "dailyNoteHeader" | "memoNoteFolder" | "attachmentFolder" | "commentOrderRegex";
type NumberKey = "syncDaysLimit" | "startupDelaySeconds" | "periodicSyncIntervalMinutes";
type ToggleKey = "enabled" | "createMissingDailyNotes" | "skipImages" | "mergeCommentsIntoParent" | "syncOnStartup" | "skipStartupSyncIfSyncedToday";
