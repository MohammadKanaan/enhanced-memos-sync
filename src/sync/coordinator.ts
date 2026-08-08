import { computeCutoffTimestamp, computeSyncThreshold } from "../core/date";
import type { RequestedSyncMode, SyncResult } from "../core/types";
import type { PluginSettings, SyncState } from "../settings/types";

export interface CoordinatorPorts {
  settings(): PluginSettings;
  state(): SyncState;
  token(): Promise<string | undefined>;
  fetch(threshold: number, mode: "incremental" | "full"): Promise<Array<{ timestamp: number }>>;
  commit(state: SyncState): Promise<void>;
  notice(message: string): void;
  now(): Date;
}

export class SyncCoordinator {
  private active = false;
  constructor(private readonly ports: CoordinatorPorts) {}

  async run(requestedMode: RequestedSyncMode): Promise<SyncResult> {
    if (this.active) {
      this.ports.notice("A Memos sync is already running.");
      return result(requestedMode, false);
    }
    this.active = true;
    try {
      const settings = this.ports.settings();
      const token = await this.ports.token();
      if (!settings.enabled || !settings.apiUrl || !token) {
        this.ports.notice("Memos sync configuration is incomplete.");
        return result(requestedMode, false, [{ severity: "error", stage: "settings", message: "Configuration is incomplete." }]);
      }
      const state = this.ports.state();
      const effectiveMode = requestedMode === "force" || (requestedMode === "smart" && !state.cursor)
        ? "full"
        : "incremental";
      const cutoff = computeCutoffTimestamp(this.ports.now(), settings.syncDaysLimit);
      const memos = await this.ports.fetch(computeSyncThreshold(effectiveMode, state.cursor, cutoff), effectiveMode);
      const cursor = memos.length ? Math.max(...memos.map((memo) => memo.timestamp)) : effectiveMode === "full" ? undefined : state.cursor;
      await this.ports.commit({ ...state, ...(cursor ? { cursor } : {}), ...(cursor ? {} : { cursor: undefined }), lastSuccessfulSyncDate: localDate(this.ports.now()) });
      this.ports.notice("Memos sync completed.");
      return { ...result(requestedMode, true), effectiveMode, counts: { ...result(requestedMode, true).counts, fetched: memos.length, normalized: memos.length } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ports.notice("Memos sync failed.");
      return result(requestedMode, false, [{ severity: "error", stage: "fetch", message }]);
    } finally { this.active = false; }
  }
}

function result(requestedMode: RequestedSyncMode, complete: boolean, diagnostics: SyncResult["diagnostics"] = []): SyncResult {
  return { requestedMode, complete, diagnostics, counts: { fetched: 0, normalized: 0, memoNotesWritten: 0, attachmentsDownloaded: 0, dailyNotesModified: 0, memoNotesTrashed: 0 } };
}
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
