import { Plugin, requestUrl } from "obsidian";

import { MemosClient } from "./api/memos-client";
import { toLocalDate } from "./core/date";
import type { RequestedSyncMode } from "./core/types";
import { SyncScheduler } from "./lifecycle/scheduler";
import { CredentialStore } from "./obsidian/credential-store";
import { ObsidianDailyNotesAdapter } from "./obsidian/daily-notes-adapter";
import { ObsidianNoticeAdapter } from "./obsidian/notice-adapter";
import { ObsidianRequestAdapter } from "./obsidian/request-adapter";
import { ObsidianVaultAdapter } from "./obsidian/vault-adapter";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import type { PluginSettings, SyncState } from "./settings/types";
import { PersistedStore } from "./state/persisted-store";
import { SyncCoordinator } from "./sync/coordinator";
import { PersistedSyncFinalizer } from "./sync/finalizer";
import { EnhancedMemosSyncSettingsTab } from "./ui/settings-tab";

export const MEMOS_COMMANDS: ReadonlyArray<{ id: string; name: string; mode: RequestedSyncMode }> = [
  { id: "sync-memos", name: "Smart Sync Memos", mode: "smart" },
  { id: "incremental-sync-memos", name: "Incremental Sync (New Only)", mode: "incremental" },
  { id: "force-sync-memos", name: "Force Sync All Memos", mode: "force" },
];

export default class EnhancedMemosSyncPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  private state: SyncState = { renderSnapshots: {} };
  private store!: PersistedStore;
  private credentials!: CredentialStore;
  private scheduler!: SyncScheduler;
  private coordinator!: SyncCoordinator;
  private readonly notices = new ObsidianNoticeAdapter();

  async onload(): Promise<void> {
    this.store = new PersistedStore({
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
    });
    const vault = new ObsidianVaultAdapter({ vault: this.app.vault, fileManager: this.app.fileManager as never });
    const finalizer = new PersistedSyncFinalizer(this.store, vault);
    await finalizer.recoverPendingFinalization();
    const persisted = await this.store.load();
    this.settings = persisted.settings;
    this.state = persisted.state;

    this.credentials = new CredentialStore({
      app: this.app,
      saveSettings: () => this.persistCurrentSettings(),
    });
    await this.credentials.migrate(this.settings);

    const request = new ObsidianRequestAdapter(requestUrl);
    const dailyNotes = new ObsidianDailyNotesAdapter(this.app.vault);
    this.coordinator = new SyncCoordinator({
      settings: () => ({ ...this.settings }),
      state: () => cloneState(this.state),
      token: () => this.credentials.get(this.settings),
      fetch: async (threshold, _mode, apiUrl, token) => {
        return new MemosClient(request, apiUrl, token).list(threshold);
      },
      vault,
      dailyNotes,
      request,
      commit: async (state) => {
        const next = cloneState(state);
        await this.store.updateState(() => next);
        this.state = next;
      },
      recoverPendingFinalization: async () => {
        await finalizer.recoverPendingFinalization();
        this.state = cloneState((await this.store.load()).state);
      },
      finalizeSuccessfulSync: async (input) => {
        try {
          await finalizer.finalizeSuccessfulSync(input);
          this.state = cloneState(input.nextState);
        } catch (error) {
          this.state = cloneState(input.priorState);
          throw error;
        }
      },
      notice: (message) => this.notices.show(message),
      now: () => new Date(),
    });

    this.scheduler = new SyncScheduler({
      onLayoutReady: (callback) => this.app.workspace.onLayoutReady(callback),
      setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
      clearTimeout: (id) => window.clearTimeout(id),
      setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
      clearInterval: (id) => window.clearInterval(id),
      runSmart: () => this.runSyncSafely("smart"),
      today: () => toLocalDate(Math.floor(Date.now() / 1_000)),
    });

    this.addSettingTab(new EnhancedMemosSyncSettingsTab(this));
    for (const command of MEMOS_COMMANDS) {
      this.addCommand({
        id: command.id,
        name: command.name,
        callback: () => this.runSyncSafely(command.mode),
      });
    }
    this.addRibbonIcon("refresh-cw", "Smart Sync Memos", () => this.runSyncSafely("smart"));

    // Scheduling registration performs no I/O; its callback waits for layout readiness.
    this.scheduler.schedule(this.settings, this.state.lastSuccessfulSyncDate);
  }

  onunload(): void {
    this.scheduler?.clear();
  }

  async updateSetting<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]): Promise<void> {
    const previous = this.settings;
    const next = { ...previous, [key]: value };
    // Make the next edit build on this one even while PersistedStore serializes disk writes.
    this.settings = next;
    if (key === "periodicSyncIntervalMinutes") {
      this.scheduler.reschedulePeriodic(next.periodicSyncIntervalMinutes);
    }
    try {
      await this.store.saveSettings(next);
    } catch (error) {
      // Do not erase a newer user edit that arrived while this write was pending.
      if (this.settings === next) {
        this.settings = previous;
        if (key === "periodicSyncIntervalMinutes") {
          this.scheduler.reschedulePeriodic(previous.periodicSyncIntervalMinutes);
        }
      }
      throw error;
    }
  }

  async updateToken(value: string): Promise<void> {
    await this.credentials.set(this.settings, value);
  }

  async getToken(): Promise<string | undefined> {
    return this.credentials.get(this.settings);
  }

  private async persistCurrentSettings(): Promise<void> {
    await this.store.saveSettings(this.settings);
  }

  private async runSyncSafely(mode: RequestedSyncMode): Promise<void> {
    try {
      await this.coordinator.run(mode);
    } catch {
      // Boundary implementations redact known secrets; this final guard never reveals error text at all.
      this.notices.show("Memos sync failed unexpectedly.");
    }
  }
}

function cloneState(state: SyncState): SyncState {
  return {
    ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
    ...(state.lastSuccessfulSyncDate === undefined ? {} : { lastSuccessfulSyncDate: state.lastSuccessfulSyncDate }),
    renderSnapshots: Object.fromEntries(
      Object.entries(state.renderSnapshots).map(([id, snapshot]) => [
        id,
        { notePath: snapshot.notePath, segments: snapshot.segments.map((segment) => ({ ...segment })) },
      ]),
    ),
  };
}
