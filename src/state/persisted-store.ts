import { DEFAULT_SETTINGS, DEFAULT_STATE } from "../settings/defaults";
import { SETTING_MAXIMUMS } from "../settings/validation";
import type {
  PersistedData,
  PluginSettings,
  SyncState,
  ThreadRenderSnapshot,
} from "../settings/types";
import type { SuccessfulSyncFinalization } from "../sync/finalization";

export interface PersistedDataPort {
  loadData(): Promise<unknown>;
  saveData(data: PersistedData): Promise<void>;
}

export interface FinalizationRecoveryVault {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<"created" | "updated" | "unchanged">;
}

export class PersistedStore {
  private data?: PersistedData;
  /** True when the loaded file was not in the canonical envelope shape and must be rewritten. */
  private needsRewrite = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly port: PersistedDataPort) {}

  async load(): Promise<PersistedData> {
    if (!this.data) {
      this.accept(await this.port.loadData());
    }

    return cloneData(this.data!);
  }

  /** Discards the cache and re-reads persisted data after pending writes settle, e.g. after an external sync. */
  async reload(): Promise<PersistedData> {
    await this.enqueue(async () => {
      this.accept(await this.port.loadData());
    });
    return cloneData(this.data!);
  }

  /**
   * Rewrites the file in the canonical envelope when loading had to recover
   * settings written outside it (for example by Obsidian's declarative
   * settings framework writing `plugin.settings` directly).
   */
  async persistIfMigrated(): Promise<boolean> {
    await this.load();
    let rewritten = false;
    await this.enqueue(async () => {
      if (!this.needsRewrite || !this.data) return;
      await this.port.saveData(cloneData(this.data));
      this.needsRewrite = false;
      rewritten = true;
    });
    return rewritten;
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined).data;
      const next: PersistedData = {
        schemaVersion: 1,
        settings: sanitizeSettings(settings),
        state: current.state,
        ...(current.finalizationJournal ? { finalizationJournal: cloneFinalization(current.finalizationJournal) } : {}),
      };
      await this.port.saveData(cloneData(next));
      this.data = next;
      this.needsRewrite = false;
    });
  }

  async updateState(update: (state: SyncState) => SyncState): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined).data;
      const next: PersistedData = {
        schemaVersion: 1,
        settings: current.settings,
        state: sanitizeState(update(cloneState(current.state))),
        ...(current.finalizationJournal ? { finalizationJournal: cloneFinalization(current.finalizationJournal) } : {}),
      };
      await this.port.saveData(cloneData(next));
      this.data = next;
      this.needsRewrite = false;
    });
  }

  async prepareFinalization(finalization: SuccessfulSyncFinalization): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined).data;
      if (current.finalizationJournal) {
        throw new Error("A prepared sync finalization must be recovered before another can begin.");
      }
      const next: PersistedData = {
        schemaVersion: 1,
        settings: { ...current.settings },
        state: cloneState(finalization.priorState),
        finalizationJournal: cloneFinalization(finalization),
      };
      await this.port.saveData(cloneData(next));
      this.data = next;
      this.needsRewrite = false;
    });
  }

  async completeFinalization(): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined).data;
      const journal = current.finalizationJournal;
      if (!journal) throw new Error("No prepared sync finalization exists.");
      const next: PersistedData = {
        schemaVersion: 1,
        settings: { ...current.settings },
        state: cloneState(journal.nextState),
      };
      await this.port.saveData(cloneData(next));
      this.data = next;
      this.needsRewrite = false;
    });
  }

  async recoverPendingFinalization(vault: FinalizationRecoveryVault): Promise<boolean> {
    await this.load();
    let recovered = false;
    await this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined).data;
      const journal = current.finalizationJournal;
      if (!journal) return;
      for (const deletion of [...journal.deletions].reverse()) {
        if (await vault.readText(deletion.path) === undefined) {
          await vault.writeText(deletion.path, deletion.content);
        }
      }
      const next: PersistedData = {
        schemaVersion: 1,
        settings: { ...current.settings },
        state: cloneState(journal.priorState),
      };
      await this.port.saveData(cloneData(next));
      this.data = next;
      this.needsRewrite = false;
      recovered = true;
    });
    return recovered;
  }

  private accept(raw: unknown): void {
    const { data, migrated } = sanitizePersistedData(raw);
    this.data = data;
    this.needsRewrite = migrated;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.writeChain.then(operation, operation);
    this.writeChain = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}

const SETTING_KEYS = [...Object.keys(DEFAULT_SETTINGS), "apiToken"] as const;

function sanitizePersistedData(raw: unknown): { data: PersistedData; migrated: boolean } {
  const data = isRecord(raw) ? raw : {};
  const journal = sanitizeFinalization(data.finalizationJournal);
  // Settings found at the top level were written outside the envelope (Obsidian 1.13's
  // default setControlValue saves `plugin.settings` as the whole file). Every envelope
  // write drops them, so when present they are newer than `data.settings`.
  const stray = Object.fromEntries(SETTING_KEYS.filter((key) => key in data).map((key) => [key, data[key]]));
  const envelope = isRecord(data.settings) ? data.settings : {};
  return {
    data: {
      schemaVersion: 1,
      settings: sanitizeSettings({ ...envelope, ...stray }),
      state: sanitizeState(data.state),
      ...(journal ? { finalizationJournal: journal } : {}),
    },
    migrated: Object.keys(stray).length > 0,
  };
}

function sanitizeSettings(raw: unknown): PluginSettings {
  const source = isRecord(raw) ? raw : {};
  const result: PluginSettings = { ...DEFAULT_SETTINGS };

  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof PluginSettings>) {
    const value = source[key];
    if (key in SETTING_MAXIMUMS) {
      const number = toInteger(value);
      if (number !== undefined && number >= 0 && number <= SETTING_MAXIMUMS[key as keyof typeof SETTING_MAXIMUMS]) {
        result[key] = number as never;
      }
    } else if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      result[key] = value as never;
    }
  }

  if (!result.accountName.trim()) result.accountName = DEFAULT_SETTINGS.accountName;
  if (/^#*$/.test(result.dailyNoteHeader.trim())) result.dailyNoteHeader = DEFAULT_SETTINGS.dailyNoteHeader;

  if (typeof source.apiToken === "string") {
    result.apiToken = source.apiToken;
  }

  return result;
}

function toInteger(value: unknown): number | undefined {
  const number = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) ? number : undefined;
}

function sanitizeState(raw: unknown): SyncState {
  const source = isRecord(raw) ? raw : {};
  const state = cloneState(DEFAULT_STATE);

  if (typeof source.cursor === "number" && Number.isSafeInteger(source.cursor) && source.cursor > 0) {
    state.cursor = source.cursor;
  }
  if (typeof source.lastSuccessfulSyncDate === "string") {
    state.lastSuccessfulSyncDate = source.lastSuccessfulSyncDate;
  }
  if (isRecord(source.renderSnapshots)) {
    state.renderSnapshots = Object.fromEntries(
      Object.entries(source.renderSnapshots)
        .filter((entry): entry is [string, ThreadRenderSnapshot] => isSnapshot(entry[1]))
        .map(([id, snapshot]) => [id, cloneSnapshot(snapshot)]),
    );
  }

  return state;
}

function isSnapshot(value: unknown): value is ThreadRenderSnapshot {
  return (
    isRecord(value) &&
    typeof value.notePath === "string" &&
    Array.isArray(value.segments) &&
    value.segments.every(
      (segment) =>
        isRecord(segment) && typeof segment.id === "string" && typeof segment.markdown === "string",
    )
  );
}

function cloneData(data: PersistedData): PersistedData {
  return {
    schemaVersion: 1,
    settings: { ...data.settings },
    state: cloneState(data.state),
    ...(data.finalizationJournal ? { finalizationJournal: cloneFinalization(data.finalizationJournal) } : {}),
  };
}

function sanitizeFinalization(value: unknown): SuccessfulSyncFinalization | undefined {
  if (!isRecord(value) || !isRecord(value.priorState) || !isRecord(value.nextState) || !Array.isArray(value.deletions)) {
    return undefined;
  }
  const deletions = value.deletions.filter(
    (deletion): deletion is { path: string; content: string } =>
      isRecord(deletion) && typeof deletion.path === "string" && typeof deletion.content === "string",
  );
  if (deletions.length !== value.deletions.length) return undefined;
  return {
    priorState: sanitizeState(value.priorState),
    nextState: sanitizeState(value.nextState),
    deletions: deletions.map((deletion) => ({ ...deletion })),
  };
}

function cloneFinalization(finalization: SuccessfulSyncFinalization): SuccessfulSyncFinalization {
  return {
    priorState: cloneState(finalization.priorState),
    nextState: cloneState(finalization.nextState),
    deletions: finalization.deletions.map((deletion) => ({ ...deletion })),
  };
}

function cloneState(state: SyncState): SyncState {
  return {
    ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
    ...(state.lastSuccessfulSyncDate === undefined
      ? {}
      : { lastSuccessfulSyncDate: state.lastSuccessfulSyncDate }),
    renderSnapshots: Object.fromEntries(
      Object.entries(state.renderSnapshots).map(([id, snapshot]) => [id, cloneSnapshot(snapshot)]),
    ),
  };
}

function cloneSnapshot(snapshot: ThreadRenderSnapshot): ThreadRenderSnapshot {
  return {
    notePath: snapshot.notePath,
    segments: snapshot.segments.map((segment) => ({ ...segment })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
