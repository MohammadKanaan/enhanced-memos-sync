import { DEFAULT_SETTINGS, DEFAULT_STATE } from "../settings/defaults";
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
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly port: PersistedDataPort) {}

  async load(): Promise<PersistedData> {
    if (!this.data) {
      this.data = sanitizePersistedData(await this.port.loadData());
    }

    return cloneData(this.data);
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined);
      this.data = {
        schemaVersion: 1,
        settings: sanitizeSettings(settings),
        state: current.state,
        ...(current.finalizationJournal ? { finalizationJournal: cloneFinalization(current.finalizationJournal) } : {}),
      };
      await this.port.saveData(cloneData(this.data));
    });
  }

  async updateState(update: (state: SyncState) => SyncState): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined);
      this.data = {
        schemaVersion: 1,
        settings: current.settings,
        state: sanitizeState(update(cloneState(current.state))),
        ...(current.finalizationJournal ? { finalizationJournal: cloneFinalization(current.finalizationJournal) } : {}),
      };
      await this.port.saveData(cloneData(this.data));
    });
  }

  async prepareFinalization(finalization: SuccessfulSyncFinalization): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined);
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
    });
  }

  async completeFinalization(): Promise<void> {
    await this.load();
    return this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined);
      const journal = current.finalizationJournal;
      if (!journal) throw new Error("No prepared sync finalization exists.");
      const next: PersistedData = {
        schemaVersion: 1,
        settings: { ...current.settings },
        state: cloneState(journal.nextState),
      };
      await this.port.saveData(cloneData(next));
      this.data = next;
    });
  }

  async recoverPendingFinalization(vault: FinalizationRecoveryVault): Promise<boolean> {
    await this.load();
    let recovered = false;
    await this.enqueue(async () => {
      const current = this.data ?? sanitizePersistedData(undefined);
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
      recovered = true;
    });
    return recovered;
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

function sanitizePersistedData(raw: unknown): PersistedData {
  const data = isRecord(raw) ? raw : {};
  const journal = sanitizeFinalization(data.finalizationJournal);
  return {
    schemaVersion: 1,
    settings: sanitizeSettings(data.settings),
    state: sanitizeState(data.state),
    ...(journal ? { finalizationJournal: journal } : {}),
  };
}

function sanitizeSettings(raw: unknown): PluginSettings {
  const source = isRecord(raw) ? raw : {};
  const result: PluginSettings = { ...DEFAULT_SETTINGS };

  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof PluginSettings>) {
    const value = source[key];
    if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      result[key] = value as never;
    }
  }

  if (typeof source.apiToken === "string") {
    result.apiToken = source.apiToken;
  }

  return result;
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
