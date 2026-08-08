import { SyncCoordinator } from "../../src/sync/coordinator";
import type { SuccessfulSyncFinalization } from "../../src/sync/finalization";
import { SyncFinalizationError } from "../../src/sync/finalization";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { PluginSettings, SyncState } from "../../src/settings/types";
import { FakeDailyNotes } from "./fake-daily-notes";
import { FakePersistence } from "./fake-persistence";
import { FakeRequestPort } from "./fake-request-port";
import { InMemoryVault } from "./in-memory-vault";

export const ACCEPTANCE_NOW = () => new Date(2026, 0, 20, 12, 0, 0);

export function acceptanceMemo(timestamp: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: `memos/${timestamp}`, content: `memo ${timestamp}`, createdTs: timestamp, ...overrides };
}

export function managedMemoNote(timestamp: number, date: string, source = "Default (https://memos.example)"): string {
  return [
    "---",
    `memo_id: memos/${timestamp}`,
    `timestamp: ${timestamp}`,
    `date: ${date}`,
    "tags:",
    "  - memo",
    "  - daily-record",
    `source: ${JSON.stringify(source)}`,
    "---",
    "",
    "managed",
    "",
  ].join("\n");
}

export function createAcceptanceSync(options: {
  records?: unknown[];
  state?: SyncState;
  settings?: Partial<PluginSettings>;
  token?: string;
  fetch?: (threshold: number, mode: "incremental" | "full", apiUrl: string, token: string) => Promise<unknown[]>;
  response?: ConstructorParameters<typeof FakeRequestPort>[0];
} = {}) {
  const vault = new InMemoryVault();
  const dailyNotes = new FakeDailyNotes();
  const persistence = new FakePersistence(options.state ?? { renderSnapshots: {} });
  const notices: string[] = [];
  const fetchCalls: Array<{ threshold: number; mode: "incremental" | "full"; apiUrl: string; token: string }> = [];
  const request = new FakeRequestPort(options.response ?? (() => ({
    status: 200,
    text: "",
    arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
  })));
  const coordinator = new SyncCoordinator({
    settings: () => ({ ...DEFAULT_SETTINGS, apiUrl: "https://memos.example", ...options.settings }),
    state: persistence.state,
    token: async () => options.token === undefined ? "secret" : options.token,
    fetch: async (threshold, mode, apiUrl, token) => {
      fetchCalls.push({ threshold, mode, apiUrl, token });
      return options.fetch ? options.fetch(threshold, mode, apiUrl, token) : options.records ?? [];
    },
    vault,
    dailyNotes,
    request,
    commit: persistence.commit,
    recoverPendingFinalization: async () => {},
    finalizeSuccessfulSync: (input) => finalize(input, vault, persistence),
    notice: (message) => notices.push(message),
    now: ACCEPTANCE_NOW,
  });
  return { coordinator, vault, dailyNotes, persistence, notices, fetchCalls, request };
}

async function finalize(
  input: SuccessfulSyncFinalization,
  vault: InMemoryVault,
  persistence: FakePersistence,
): Promise<void> {
  const trashed: SuccessfulSyncFinalization["deletions"][number][] = [];
  try {
    for (const deletion of input.deletions) {
      await vault.trash(deletion.path);
      trashed.push(deletion);
    }
  } catch (error) {
    for (const deletion of [...trashed].reverse()) {
      await vault.writeText(deletion.path, deletion.content);
    }
    throw new SyncFinalizationError("deletion", "trash failed", error);
  }
  try {
    await persistence.commit(input.nextState);
  } catch (error) {
    for (const deletion of [...trashed].reverse()) {
      await vault.writeText(deletion.path, deletion.content);
    }
    throw new SyncFinalizationError("state", "state save failed", error);
  }
}
