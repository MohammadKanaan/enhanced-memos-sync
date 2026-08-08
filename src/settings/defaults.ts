import type { PluginSettings, SyncState } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  accountName: "Default",
  enabled: true,
  apiUrl: "",
  dailyNoteHeader: "## 📓 Memos",
  syncDaysLimit: 30,
  memoNoteFolder: "Memos",
  attachmentFolder: "attachments",
  createMissingDailyNotes: true,
  skipImages: false,
  mergeCommentsIntoParent: false,
  commentOrderRegex: "-- (\\d+)/(\\d+) --",
  syncOnStartup: false,
  startupDelaySeconds: 5,
  skipStartupSyncIfSyncedToday: true,
  periodicSyncIntervalMinutes: 0,
};

export const DEFAULT_STATE: SyncState = {
  renderSnapshots: {},
};
