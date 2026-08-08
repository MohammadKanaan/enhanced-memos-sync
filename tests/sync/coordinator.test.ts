import { describe, expect, it } from "vitest";

import { SyncCoordinator } from "../../src/sync/coordinator";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { PluginSettings, SyncState } from "../../src/settings/types";
import type { SuccessfulSyncFinalization } from "../../src/sync/finalization";
import { SyncFinalizationError } from "../../src/sync/finalization";
import { FakeDailyNotes } from "../support/fake-daily-notes";
import { FakePersistence } from "../support/fake-persistence";
import { FakeRequestPort } from "../support/fake-request-port";
import { memo } from "../support/fixtures";
import { InMemoryVault } from "../support/in-memory-vault";

const now = () => new Date(2026, 0, 20, 12);

function setup(options: {
  records?: unknown[];
  state?: SyncState;
  settings?: Partial<PluginSettings>;
  fetch?: (threshold: number, mode: "incremental" | "full") => Promise<unknown[]>;
  token?: string;
  attachmentStatus?: number;
  attachmentStatuses?: number[];
  finalize?: (input: SuccessfulSyncFinalization, vault: InMemoryVault, persistence: FakePersistence) => Promise<void>;
  recover?: () => Promise<void>;
} = {}) {
  const notices: string[] = [];
  const vault = new InMemoryVault();
  const dailyNotes = new FakeDailyNotes();
  const persistence = new FakePersistence(options.state ?? { renderSnapshots: {} });
  const fetchCalls: Array<{ threshold: number; mode: "incremental" | "full" }> = [];
  const finalize = options.finalize ?? defaultFinalizer;
  const coordinator = new SyncCoordinator({
    settings: () => ({ ...DEFAULT_SETTINGS, apiUrl: "https://memos.example", ...options.settings }),
    state: persistence.state,
    token: async () => "token" in options ? options.token : "secret",
    fetch: async (threshold, mode) => {
      fetchCalls.push({ threshold, mode });
      return options.fetch ? options.fetch(threshold, mode) : options.records ?? [];
    },
    vault,
    dailyNotes,
    request: new FakeRequestPort((_call, index) => ({
      status: options.attachmentStatuses?.[index] ?? options.attachmentStatus ?? 200,
      text: "attachment response",
      arrayBuffer: (options.attachmentStatuses?.[index] ?? options.attachmentStatus ?? 200) >= 300 ? undefined : new Uint8Array([1]).buffer,
    })),
    commit: persistence.commit,
    recoverPendingFinalization: options.recover ?? (async () => {}),
    finalizeSuccessfulSync: (input) => finalize(input, vault, persistence),
    notice: (message) => notices.push(message),
    now,
  });
  return { coordinator, vault, dailyNotes, persistence, fetchCalls, notices };
}

describe("sync coordinator", () => {
  it("reports disabled or incomplete configuration without fetching", async () => {
    const disabled = setup({ settings: { enabled: false } });
    const missingToken = setup({ token: undefined });

    await expect(disabled.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    await expect(missingToken.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(disabled.fetchCalls).toEqual([]);
    expect(missingToken.fetchCalls).toEqual([]);
    expect(missingToken.notices.at(-1)).toContain("configuration is incomplete");
  });

  it("stops before fetch until pending finalization recovery succeeds", async () => {
    let recovered = false;
    const sync = setup({ recover: async () => {
      if (!recovered) throw new Error("recovery unavailable");
    } });

    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(sync.fetchCalls).toEqual([]);
    expect(sync.notices.at(-1)).toBe("Memos sync recovery is incomplete.");

    recovered = true;
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    expect(sync.fetchCalls).toHaveLength(1);
  });

  it("rejects unsafe persisted folders at the settings stage before network work", async () => {
    for (const settings of [
      { memoNoteFolder: "Memos/../private" },
      { attachmentFolder: "attachments/../../private" },
    ]) {
      const configured = setup({ settings });
      const result = await configured.coordinator.run("force");
      expect(result).toMatchObject({ complete: false });
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", stage: "settings" }));
      expect(configured.fetchCalls).toEqual([]);
    }
  });

  it.each([
    ["smart", undefined, "full"],
    ["smart", 100, "incremental"],
    ["incremental", undefined, "incremental"],
    ["force", 100, "full"],
  ] as const)("resolves %s with cursor %s as %s", async (requestedMode, cursor, effectiveMode) => {
    const { coordinator, fetchCalls } = setup({ state: { ...(cursor ? { cursor } : {}), renderSnapshots: {} } });
    await expect(coordinator.run(requestedMode)).resolves.toMatchObject({ complete: true, effectiveMode });
    expect(fetchCalls[0]?.mode).toBe(effectiveMode);
  });

  it("passes the run's API URL, token, and threaded-comment snapshot to the fetch boundary", async () => {
    const inputs: Array<{ apiUrl: string | undefined; token: string | undefined; includeComments: boolean | undefined }> = [];
    const notices: string[] = [];
    const vault = new InMemoryVault();
    const coordinator = new SyncCoordinator({
      settings: () => ({ ...DEFAULT_SETTINGS, apiUrl: "https://snapshot.example", mergeCommentsIntoParent: true }),
      state: () => ({ renderSnapshots: {} }),
      token: async () => "snapshot-token",
      fetch: ((...args: unknown[]) => {
        inputs.push({
          apiUrl: args[2] as string | undefined,
          token: args[3] as string | undefined,
          includeComments: args[4] as boolean | undefined,
        });
        return Promise.resolve([]);
      }) as never,
      vault,
      dailyNotes: new FakeDailyNotes(),
      request: new FakeRequestPort(() => ({ status: 200, text: "", arrayBuffer: new Uint8Array().buffer })),
      commit: async () => {},
      recoverPendingFinalization: async () => {},
      finalizeSuccessfulSync: async () => {},
      notice: (message) => notices.push(message),
      now,
    });

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true });
    expect(inputs).toEqual([{
      apiUrl: "https://snapshot.example",
      token: "snapshot-token",
      includeComments: true,
    }]);
  });

  it("renders notes and daily embeds, writes snapshots, and commits the max normalized cursor", async () => {
    const { coordinator, vault, dailyNotes, persistence } = setup({ records: [memo(1_768_867_200)] });

    await expect(coordinator.run("force")).resolves.toMatchObject({
      complete: true,
      counts: { fetched: 1, normalized: 1, memoNotesWritten: 1, dailyNotesModified: 1 },
    });
    expect([...vault.text.keys()]).toEqual(["Memos/2026-01-20-1768867200.md"]);
    expect([...dailyNotes.notes.values()][0]?.content).toContain("![[2026-01-20-1768867200]]");
    expect(persistence.state().cursor).toBe(1_768_867_200);
    expect(persistence.state().renderSnapshots["memos/1768867200"]?.notePath).toBe("Memos/2026-01-20-1768867200.md");
  });

  it("contains malformed resource records as redacted partial attachment errors", async () => {
    const { coordinator, vault } = setup({
      records: [memo(1_768_867_200, { attachments: [null] as never })],
    });

    const result = await coordinator.run("force");
    expect(result).toMatchObject({ complete: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", stage: "attachment" }));
    expect(result.diagnostics.map(({ message }) => message).join("\n")).not.toContain("secret");
    expect(vault.text.has("Memos/2026-01-20-1768867200.md")).toBe(true);
  });

  it("never mutates the vault when fetching fails", async () => {
    const { coordinator, vault, persistence } = setup({ fetch: async () => { throw new Error("network secret"); } });

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(vault.text).toEqual(new Map());
    expect(persistence.commits).toEqual([]);
  });

  it("updates an existing note from a remote edit and does not duplicate attachment embeds", async () => {
    const { coordinator, vault } = setup({ records: [memo(1_768_867_200, {
      content: "revised remote prose",
      attachments: [{ id: "file", filename: "report.pdf" }],
    })] });
    vault.text.set("Memos/2026-01-20-1768867200.md", "---\ncustom: retained\n---\nold prose\n");

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { memoNotesWritten: 1 } });
    const rewritten = vault.text.get("Memos/2026-01-20-1768867200.md") ?? "";
    expect(rewritten).toContain("revised remote prose");
    expect(rewritten).toContain("custom: retained");
    expect(rewritten.match(/!\[\[file-report\.pdf\]\]/g)).toHaveLength(1);
  });

  it("preserves a reply task while a standalone reply becomes a threaded segment", async () => {
    const settings: Partial<PluginSettings> = { mergeCommentsIntoParent: false };
    const records = [
      memo(1_768_867_200),
      memo(1_768_867_201, { content: "Reply\n- [ ] reply task", parent: "memos/1768867200" }),
    ];
    const { coordinator, vault } = setup({ settings, records });

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true });
    vault.text.set(
      "Memos/2026-01-20-1768867201.md",
      (vault.text.get("Memos/2026-01-20-1768867201.md") ?? "").replace("- [ ] reply task", "- [x] reply task"),
    );
    settings.mergeCommentsIntoParent = true;

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true });
    expect(vault.text.get("Memos/2026-01-20-1768867200.md")).toContain("- [x] reply task");
  });

  it("preserves a reply task while a threaded segment becomes standalone", async () => {
    const settings: Partial<PluginSettings> = { mergeCommentsIntoParent: true };
    const records = [
      memo(1_768_867_200),
      memo(1_768_867_201, { content: "Reply\n- [ ] reply task", parent: "memos/1768867200" }),
    ];
    const { coordinator, vault } = setup({ settings, records });

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true });
    vault.text.set(
      "Memos/2026-01-20-1768867200.md",
      (vault.text.get("Memos/2026-01-20-1768867200.md") ?? "").replace("- [ ] reply task", "- [x] reply task"),
    );
    settings.mergeCommentsIntoParent = false;

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true });
    expect(vault.text.get("Memos/2026-01-20-1768867201.md")).toContain("- [x] reply task");
  });

  it("keeps successful writes but withholds deletion and cursor commit after an attachment failure", async () => {
    const { coordinator, vault, persistence } = setup({
      state: { cursor: 10, renderSnapshots: {} },
      records: [memo(1_768_867_200, { attachments: [{ id: "broken", filename: "broken.pdf" }] })],
      attachmentStatus: 500,
    });
    vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));
    const result = await coordinator.run("force");

    expect(result.complete).toBe(false);
    expect(vault.text.has("Memos/2026-01-20-1768867200.md")).toBe(true);
    expect(vault.trashed).toEqual([]);
    expect(persistence.state().cursor).toBe(10);
  });

  it("keeps independent memo writes and makes a failed memo write partial", async () => {
    const { coordinator, vault, persistence } = setup({
      state: { cursor: 10, renderSnapshots: {} },
      records: [memo(1_768_867_200), memo(1_768_867_201)],
    });
    vault.failWritesFor.add("Memos/2026-01-20-1768867201.md");

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: false, counts: { memoNotesWritten: 1 } });
    expect(vault.text.has("Memos/2026-01-20-1768867200.md")).toBe(true);
    expect(vault.text.has("Memos/2026-01-20-1768867201.md")).toBe(false);
    expect(persistence.state().cursor).toBe(10);
  });

  it("does not delete during incremental sync but deletes revalidated stale force candidates", async () => {
    const incremental = setup({ state: { cursor: 100, renderSnapshots: {} } });
    incremental.vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));
    await incremental.coordinator.run("incremental");
    expect(incremental.vault.trashed).toEqual([]);

    const forced = setup();
    forced.vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));
    await expect(forced.coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { memoNotesTrashed: 1 } });
    expect(forced.vault.trashed).toEqual(["Memos/2026-01-19-10.md"]);
  });

  it("delegates terminal deletion and cursor commit to the finalizer boundary", async () => {
    const calls: SuccessfulSyncFinalization[] = [];
    const { coordinator, vault, persistence } = setup({
      state: { cursor: 99, renderSnapshots: {} },
      finalize: async (input) => { calls.push(input); },
    });
    vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { memoNotesTrashed: 1 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.deletions).toEqual([{ path: "Memos/2026-01-19-10.md", content: managedNote(10, "2026-01-19") }]);
    expect(vault.trashed).toEqual([]);
    expect(persistence.state().cursor).toBe(99);
  });

  it("does not delete or advance the cursor when the final state commit fails", async () => {
    const { coordinator, vault, persistence } = setup({ state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-18", renderSnapshots: {} } });
    vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));
    vault.text.set("Memos/2026-01-19-11.md", managedNote(11, "2026-01-19"));
    persistence.failCommitAt = 0;

    const result = await coordinator.run("force");
    expect(result).toMatchObject({ complete: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", stage: "state" }));
    expect(vault.text.get("Memos/2026-01-19-10.md")).toBe(managedNote(10, "2026-01-19"));
    expect(vault.text.get("Memos/2026-01-19-11.md")).toBe(managedNote(11, "2026-01-19"));
    expect(persistence.state()).toMatchObject({ cursor: 99, lastSuccessfulSyncDate: "2026-01-18" });
  });

  it("keeps ineligible candidates as warnings without blocking other force deletion", async () => {
    const { coordinator, vault, persistence } = setup({ state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-18", renderSnapshots: {} } });
    vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));
    vault.text.set("Memos/2026-01-19-11.md", "unmanaged note");

    const result = await coordinator.run("force");
    expect(result).toMatchObject({ complete: true });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "warning", stage: "deletion" }));
    expect(vault.trashed).toEqual(["Memos/2026-01-19-10.md"]);
    expect(persistence.state().cursor).toBeUndefined();
  });

  it("restores earlier trashed notes and retains the cursor when a later trash fails", async () => {
    const { coordinator, vault, persistence } = setup({ state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-18", renderSnapshots: {} } });
    vault.text.set("Memos/2026-01-19-10.md", managedNote(10, "2026-01-19"));
    vault.text.set("Memos/2026-01-19-11.md", managedNote(11, "2026-01-19"));
    vault.failTrashesFor.add("Memos/2026-01-19-11.md");

    const result = await coordinator.run("force");
    expect(result).toMatchObject({ complete: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", stage: "deletion", path: "Memos/2026-01-19-11.md" }));
    expect(vault.trashed).toEqual(["Memos/2026-01-19-10.md"]);
    expect(vault.text.get("Memos/2026-01-19-10.md")).toBe(managedNote(10, "2026-01-19"));
    expect(vault.text.get("Memos/2026-01-19-11.md")).toBe(managedNote(11, "2026-01-19"));
    expect(persistence.state()).toMatchObject({ cursor: 99, lastSuccessfulSyncDate: "2026-01-18" });
  });

  it("treats invalid memos, daily failures, and state save failures as partial without advancing the cursor", async () => {
    const invalid = setup({ state: { cursor: 10, renderSnapshots: {} }, records: [{ content: "bad" }] });
    await expect(invalid.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(invalid.persistence.state().cursor).toBe(10);

    const daily = setup({ state: { cursor: 10, renderSnapshots: {} }, records: [memo(1_768_867_200)] });
    daily.dailyNotes.failDates.add("2026-01-20");
    await expect(daily.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(daily.persistence.state().cursor).toBe(10);

    const state = setup({ records: [memo(1_768_867_200)] });
    state.persistence.failCommitAt = 0;
    await expect(state.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(state.persistence.state().cursor).toBeUndefined();
  });

  it("continues daily-note reconciliation across dates and clears stale embeds for an empty full window", async () => {
    const empty = setup();
    empty.dailyNotes.seed("2026-01-19", "daily/old.md", "# Day\n\n## 📓 Memos\n![[2026-01-19-10]]\n");
    await expect(empty.coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { dailyNotesModified: 1 } });
    expect(empty.dailyNotes.notes.get("daily/old.md")?.content).not.toContain("![[2026-01-19-10]]");

    const multiDate = setup({ records: [memo(1_768_780_800), memo(1_768_867_200)] });
    multiDate.dailyNotes.failDates.add("2026-01-19");
    await expect(multiDate.coordinator.run("force")).resolves.toMatchObject({ complete: false, counts: { dailyNotesModified: 1 } });
    expect(multiDate.dailyNotes.notes.get("daily/2026-01-20.md")?.content).toContain("![[2026-01-20-1768867200]]");
  });

  it("reports an unavailable Daily Notes integration as a partial empty full sync", async () => {
    const { coordinator, dailyNotes, notices, persistence } = setup({ state: { cursor: 99, renderSnapshots: {} } });
    dailyNotes.available = false;

    const result = await coordinator.run("force");

    expect(result).toMatchObject({ complete: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "error",
      stage: "daily-note",
      message: "Daily Notes integration is unavailable.",
    }));
    expect(persistence.state().cursor).toBe(99);
    expect(notices.at(-1)).toBe("Memos sync finished with errors.");
  });

  it("persists earlier render snapshots and isolates malformed frontmatter when a later memo is partial", async () => {
    const { coordinator, vault, persistence } = setup({ records: [memo(1_768_867_200), memo(1_768_867_201)] });
    vault.text.set("Memos/2026-01-20-1768867201.md", "---\nnot: [valid\n---\nold\n");

    const result = await coordinator.run("force");
    expect(result).toMatchObject({ complete: false, counts: { memoNotesWritten: 1 } });
    expect(persistence.state().renderSnapshots["memos/1768867200"]?.notePath).toBe("Memos/2026-01-20-1768867200.md");
    expect(vault.text.get("Memos/2026-01-20-1768867200.md")).toContain("memo 1768867200");
  });

  it("redacts the token from diagnostics emitted by every failing boundary", async () => {
    const { coordinator, dailyNotes } = setup({ fetch: async () => { throw new Error("fetch secret"); } });
    const fetch = await coordinator.run("force");
    expect(fetch.diagnostics.map(({ message }) => message).join("\n")).not.toContain("secret");

    const planning = setup();
    planning.dailyNotes.listError = new Error("daily secret");
    const result = await planning.coordinator.run("force");
    expect(result.diagnostics.map(({ message }) => message).join("\n")).not.toContain("secret");
    expect(dailyNotes.notes).toEqual(new Map());
  });

  it("clears a full empty cursor, retains an incremental empty cursor, and rejects overlap", async () => {
    const full = setup({ state: { cursor: 100, renderSnapshots: {} } });
    await full.coordinator.run("force");
    expect(full.persistence.state().cursor).toBeUndefined();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const incremental = setup({ state: { cursor: 100, renderSnapshots: {} }, fetch: async () => { await gate; return []; } });
    const first = incremental.coordinator.run("incremental");
    await expect(incremental.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    release();
    await first;
    expect(incremental.persistence.state().cursor).toBe(100);
    expect(incremental.notices.some((notice) => notice.includes("already running"))).toBe(true);
  });

  it("retries a partial attachment run idempotently", async () => {
    const { coordinator, vault, dailyNotes, persistence } = setup({
      records: [memo(1_768_867_200, { attachments: [{ id: "retry", filename: "retry.pdf" }] })],
      attachmentStatuses: [500, 200],
    });

    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: false });
    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { attachmentsDownloaded: 1 } });
    expect(vault.binary.size).toBe(1);
    expect([...vault.text.keys()]).toEqual(["Memos/2026-01-20-1768867200.md"]);
    expect([...dailyNotes.notes.values()][0]?.content.match(/!\[\[2026-01-20-1768867200\]\]/g)).toHaveLength(1);
    expect(persistence.state().cursor).toBe(1_768_867_200);
  });
});

function managedNote(timestamp: number, date: string): string {
  return `---\nmemo_id: ${timestamp}\ntimestamp: ${timestamp}\ndate: ${date}\ntags: [memo, daily-record]\nsource: "Default (https://memos.example)"\n---\n`;
}

async function defaultFinalizer(
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
    throw new SyncFinalizationError("deletion", "trash failed", error, trashed.length < input.deletions.length ? input.deletions[trashed.length]?.path : undefined);
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
