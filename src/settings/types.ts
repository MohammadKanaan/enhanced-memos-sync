export interface PluginSettings {
  accountName: string;
  enabled: boolean;
  apiUrl: string;
  apiToken?: string;
  dailyNoteHeader: string;
  syncDaysLimit: number;
  memoNoteFolder: string;
  attachmentFolder: string;
  createMissingDailyNotes: boolean;
  skipImages: boolean;
  mergeCommentsIntoParent: boolean;
  commentOrderRegex: string;
  syncOnStartup: boolean;
  startupDelaySeconds: number;
  skipStartupSyncIfSyncedToday: boolean;
  periodicSyncIntervalMinutes: number;
}

export interface ThreadSegmentSnapshot {
  id: string;
  markdown: string;
}

export interface ThreadRenderSnapshot {
  notePath: string;
  segments: ThreadSegmentSnapshot[];
}

export interface SyncState {
  cursor?: number;
  lastSuccessfulSyncDate?: string;
  renderSnapshots: Record<string, ThreadRenderSnapshot>;
}

export interface PersistedData {
  schemaVersion: 1;
  settings: PluginSettings;
  state: SyncState;
  finalizationJournal?: import("../sync/finalization").SuccessfulSyncFinalization;
}
