import {
  PluginSettingTab,
  Setting,
  type App,
  type SettingDefinition,
  type SettingDefinitionItem,
  type SettingDefinitionRender,
  type SettingGroup,
  type TextComponent,
  type ToggleComponent,
} from "obsidian";

import { DEFAULT_SETTINGS } from "../settings/defaults";
import type { PluginSettings } from "../settings/types";
import {
  SETTING_MAXIMUMS,
  validateAccountName,
  validateApiUrl,
  validateCommentOrderRegex,
  validateFolder,
  validateHeader,
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

type TextKey = "accountName" | "apiUrl" | "dailyNoteHeader" | "memoNoteFolder" | "attachmentFolder" | "commentOrderRegex";
type NumberKey = "syncDaysLimit" | "startupDelaySeconds" | "periodicSyncIntervalMinutes";
type ToggleKey = "enabled" | "createMissingDailyNotes" | "skipImages" | "mergeCommentsIntoParent" | "syncOnStartup" | "skipStartupSyncIfSyncedToday" | "debugLogging";

/**
 * Standard single-account settings UI. Every accepted edit is durable before it is shown as saved.
 * Uses the declarative settings API (getSettingDefinitions) for search indexing on 1.13.0+,
 * with display() as an imperative fallback for older Obsidian versions.
 */
export class EnhancedMemosSyncSettingsTab extends PluginSettingTab {
  constructor(private readonly host: SettingsTabHost) {
    super(host.app, host as never);
  }

  // --- declarative API (1.13.0+) ---

  /**
   * Route declarative control reads/writes through the host so persistence keeps
   * the PersistedStore envelope; the framework default would write raw settings
   * via the plugin's saveData and clobber it.
   */
  getControlValue(key: string): unknown {
    return (this.host.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Apply the same normalization as the imperative UI so both paths persist identical values.
    const result = normalizeControlValue(key, value, this.host.settings);
    if (result.error !== undefined) throw new Error(result.error);
    await this.host.updateSetting(key as keyof PluginSettings, result.value as PluginSettings[keyof PluginSettings]);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      this.group("Account", [
        this.textDef("accountName", "Account name", "Used in memo metadata and diagnostics.", (v) => validateAccountName(v, v).error),
        this.toggleDef("enabled", "Enabled", "Synchronize this Memos account."),
      ]),
      this.group("Connection", [
        this.textDef("apiUrl", "API URL", "Your Memos server URL.", (v) => validateApiUrl(v, v).error),
        this.tokenDefinition(),
      ]),
      this.group("Daily Notes", [
        this.textDef("dailyNoteHeader", "Daily-note header", "Heading for the managed daily-note section.", (v) => validateHeader(v, v).error),
        this.toggleDef("createMissingDailyNotes", "Create missing daily notes", "Create daily notes when a memo needs one."),
      ]),
      this.group("Folders", [
        this.textDef("memoNoteFolder", "Memo-note folder", "Folder for generated memo notes.", (v) => validateFolder(v, v, DEFAULT_SETTINGS.memoNoteFolder).error),
        this.textDef("attachmentFolder", "Attachment folder", "Folder for downloaded attachments.", (v) => validateFolder(v, v, DEFAULT_SETTINGS.attachmentFolder).error),
      ]),
      this.group("Sync", [
        this.numberDef("syncDaysLimit", "Sync-days limit", "Days to include; 0 means unlimited."),
        this.toggleDef("skipImages", "Skip images", "Do not download or embed image resources."),
        this.toggleDef("mergeCommentsIntoParent", "Merge comments into parent", "Write replies into their parent memo note."),
        this.textDef("commentOrderRegex", "Comment-order regex", "Optional pattern; blank keeps chronological order.", (v) => validateCommentOrderRegex(v, v).error),
        this.toggleDef("syncOnStartup", "Sync on startup", "Run a smart sync after Obsidian finishes loading."),
        this.numberDef("startupDelaySeconds", "Startup delay", "Seconds to wait before startup sync."),
        this.toggleDef("skipStartupSyncIfSyncedToday", "Skip startup sync if synced today", "Avoid startup sync after a complete sync today."),
        this.numberDef("periodicSyncIntervalMinutes", "Periodic sync interval", "Minutes between smart syncs; 0 disables it."),
        this.toggleDef("debugLogging", "Debug logging", "Log non-fatal sync diagnostics to the developer console."),
      ]),
    ];
  }

  private group(heading: string, items: SettingDefinition[]): SettingDefinitionItem {
    return { type: "group", heading, items };
  }

  private textDef(key: TextKey, name: string, desc: string, validate: (value: string) => string | void): SettingDefinition {
    return {
      name,
      desc,
      control: {
        type: "text" as const,
        key,
        defaultValue: DEFAULT_SETTINGS[key],
        validate,
      },
    };
  }

  private numberDef(key: NumberKey, name: string, desc: string): SettingDefinition {
    return {
      name,
      desc,
      control: {
        type: "number" as const,
        key,
        defaultValue: DEFAULT_SETTINGS[key],
        min: 0,
        max: SETTING_MAXIMUMS[key],
        step: 1,
        validate: (value: number) => validateNumber(key, value).error,
      },
    };
  }

  private toggleDef(key: ToggleKey, name: string, desc: string): SettingDefinition {
    return {
      name,
      desc,
      control: {
        type: "toggle" as const,
        key,
        defaultValue: DEFAULT_SETTINGS[key],
      },
    };
  }

  private tokenDefinition(): SettingDefinitionRender {
    return {
      name: "API token",
      desc: "Stored securely when supported by Obsidian.",
      render: (setting: Setting, _group: SettingGroup) => {
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
              error.textContent = "Unable to save the API token.";
            }
          });
        });
      },
    };
  }

  // --- imperative fallback (pre-1.13.0) ---

  display(): void {
    this.containerEl.empty();

    // Account
    new Setting(this.containerEl).setName("Account").setHeading();
    this.text("Account name", "Used in memo metadata and diagnostics.", "accountName", validateAccountName);
    this.toggle("Enabled", "Synchronize this Memos account.", "enabled");

    // Connection
    new Setting(this.containerEl).setName("Connection").setHeading();
    this.text("API URL", "Your Memos server URL.", "apiUrl", validateApiUrl);
    this.token();

    // Daily Notes
    new Setting(this.containerEl).setName("Daily Notes").setHeading();
    this.text("Daily-note header", "Heading for the managed daily-note section.", "dailyNoteHeader", validateHeader);
    this.toggle("Create missing daily notes", "Create daily notes when a memo needs one.", "createMissingDailyNotes");

    // Folders
    new Setting(this.containerEl).setName("Folders").setHeading();
    this.text("Memo-note folder", "Folder for generated memo notes.", "memoNoteFolder", (value, previous) => validateFolder(value, previous, DEFAULT_SETTINGS.memoNoteFolder));
    this.text("Attachment folder", "Folder for downloaded attachments.", "attachmentFolder", (value, previous) => validateFolder(value, previous, DEFAULT_SETTINGS.attachmentFolder));

    // Sync
    new Setting(this.containerEl).setName("Sync").setHeading();
    this.integer("Sync-days limit", "Days to include; 0 means unlimited.", "syncDaysLimit");
    this.toggle("Skip images", "Do not download or embed image resources.", "skipImages");
    this.toggle("Merge comments into parent", "Write replies into their parent memo note.", "mergeCommentsIntoParent");
    this.text("Comment-order regex", "Optional pattern; blank keeps chronological order.", "commentOrderRegex", validateCommentOrderRegex);
    this.toggle("Sync on startup", "Run a smart sync after Obsidian finishes loading.", "syncOnStartup");
    this.integer("Startup delay", "Seconds to wait before startup sync.", "startupDelaySeconds");
    this.toggle("Skip startup sync if synced today", "Avoid startup sync after a complete sync today.", "skipStartupSyncIfSyncedToday");
    this.integer("Periodic sync interval", "Minutes between smart syncs; 0 disables it.", "periodicSyncIntervalMinutes");
    this.toggle("Debug logging", "Log non-fatal sync diagnostics to the developer console.", "debugLogging");
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
      // onChange fires per keystroke: leave the user's text alone so partial input (a URL
      // being typed, a folder ending in "/") can be completed; only the saved value is normalized.
      component.onChange(async (input) => {
        const result = validate(input, this.host.settings[key]);
        if (result.error) {
          error.textContent = result.error;
          return;
        }
        try {
          await this.host.updateSetting(key, result.value);
          error.textContent = "";
        } catch {
          error.textContent = "Unable to save this setting.";
        }
      });
    });
  }

  private integer<K extends NumberKey>(name: string, description: string, key: K): void {
    this.text(name, description, key, (input, previous) => validateNonNegativeInteger(input, previous, SETTING_MAXIMUMS[key]));
  }

  private toggle<K extends ToggleKey>(name: string, description: string, key: K): void {
    new Setting(this.containerEl).setName(name).setDesc(description).addToggle((component: ToggleComponent) => {
      component.setValue(this.host.settings[key]);
      component.onChange(async (value) => {
        try {
          await this.host.updateSetting(key, value);
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
          error.textContent = "Unable to save the API token.";
        }
      });
    });
  }
}

const TOGGLE_KEYS: ReadonlySet<string> = new Set<ToggleKey>([
  "enabled", "createMissingDailyNotes", "skipImages", "mergeCommentsIntoParent", "syncOnStartup", "skipStartupSyncIfSyncedToday", "debugLogging",
]);

function validateNumber(key: NumberKey, value: number): ValidationResult<number> {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? validateNonNegativeInteger(String(value), value, SETTING_MAXIMUMS[key])
    : { value: DEFAULT_SETTINGS[key], error: "Enter a non-negative whole number." };
}

function normalizeControlValue(key: string, value: unknown, current: PluginSettings): ValidationResult<unknown> {
  switch (key) {
    case "accountName":
      return validateAccountName(String(value ?? ""), current.accountName);
    case "apiUrl":
      return validateApiUrl(String(value ?? ""), current.apiUrl);
    case "dailyNoteHeader":
      return validateHeader(String(value ?? ""), current.dailyNoteHeader);
    case "memoNoteFolder":
    case "attachmentFolder":
      return validateFolder(String(value ?? ""), current[key], DEFAULT_SETTINGS[key]);
    case "commentOrderRegex":
      return validateCommentOrderRegex(String(value ?? ""), current.commentOrderRegex);
    case "syncDaysLimit":
    case "startupDelaySeconds":
    case "periodicSyncIntervalMinutes":
      return typeof value === "string"
        ? validateNonNegativeInteger(value, current[key], SETTING_MAXIMUMS[key])
        : validateNumber(key, value as number);
    default:
      if (TOGGLE_KEYS.has(key)) {
        return typeof value === "boolean" ? { value } : { value: undefined, error: "Expected a toggle value." };
      }
      return { value: undefined, error: `Unknown setting: ${key}` };
  }
}
