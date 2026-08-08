import { DEFAULT_SETTINGS, DEFAULT_STATE } from "../settings/defaults";
import type {
  PersistedData,
  PluginSettings,
  SyncState,
  ThreadRenderSnapshot,
} from "../settings/types";

export interface PersistedDataPort {
  loadData(): Promise<unknown>;
  saveData(data: PersistedData): Promise<void>;
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
      this.data = {
        schemaVersion: 1,
        settings: sanitizeSettings(settings),
        state: this.data?.state ?? cloneState(DEFAULT_STATE),
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
      };
      await this.port.saveData(cloneData(this.data));
    });
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
  return {
    schemaVersion: 1,
    settings: sanitizeSettings(data.settings),
    state: sanitizeState(data.state),
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
