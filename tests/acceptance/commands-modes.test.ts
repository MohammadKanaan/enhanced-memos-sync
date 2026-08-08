import { describe, expect, it } from "vitest";

import { MEMOS_COMMANDS } from "../../src/main";
import { acceptanceMemo, createAcceptanceSync, managedMemoNote } from "../support/acceptance";

describe("SPEC 10.2 commands and modes", () => {
  it("registers the exact public command IDs and labels", () => {
    expect(MEMOS_COMMANDS).toEqual([
      { id: "sync-memos", name: "Smart Sync Memos", mode: "smart" },
      { id: "incremental-sync-memos", name: "Incremental Sync (New Only)", mode: "incremental" },
      { id: "force-sync-memos", name: "Force Sync All Memos", mode: "force" },
    ]);
  });

  it("makes smart sync full without a cursor and incremental with one", async () => {
    const full = createAcceptanceSync();
    const incremental = createAcceptanceSync({ state: { cursor: 123, renderSnapshots: {} } });
    await full.coordinator.run("smart");
    await incremental.coordinator.run("smart");
    expect(full.fetchCalls[0]?.mode).toBe("full");
    expect(incremental.fetchCalls[0]?.mode).toBe("incremental");
  });

  it("keeps stale content for explicit incremental sync, including when no cursor exists", async () => {
    const withCursor = createAcceptanceSync({ state: { cursor: 100, renderSnapshots: {} } });
    const withoutCursor = createAcceptanceSync();
    for (const sync of [withCursor, withoutCursor]) {
      sync.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));
      await expect(sync.coordinator.run("incremental")).resolves.toMatchObject({ complete: true, effectiveMode: "incremental" });
      expect(sync.vault.trashed).toEqual([]);
    }
  });

  it("imports a fresh memo and its daily embed for cursorless explicit incremental sync without deleting stale content", async () => {
    const sync = createAcceptanceSync({ records: [acceptanceMemo(1_768_867_200, { content: "fresh incremental memo" })] });
    sync.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));

    await expect(sync.coordinator.run("incremental")).resolves.toMatchObject({
      complete: true,
      effectiveMode: "incremental",
      counts: { memoNotesWritten: 1, dailyNotesModified: 1 },
    });
    expect(sync.vault.text.get("Memos/2026-01-20-1768867200.md")).toContain("fresh incremental memo");
    expect(sync.dailyNotes.notes.get("daily/2026-01-20.md")?.content).toContain("![[2026-01-20-1768867200]]");
    expect(sync.vault.text.has("Memos/2026-01-19-10.md")).toBe(true);
    expect(sync.vault.trashed).toEqual([]);
  });

  it("force sync fetches the full window, refreshes remote edits, and reconciles deletions", async () => {
    const sync = createAcceptanceSync({ records: [acceptanceMemo(1_768_867_200, { content: "revised remote prose" })] });
    sync.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));
    sync.vault.text.set("Memos/2026-01-20-1768867200.md", `${managedMemoNote(1_768_867_200, "2026-01-20")}old prose\n`);
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true, effectiveMode: "full" });
    expect(sync.fetchCalls[0]?.mode).toBe("full");
    expect(sync.vault.text.get("Memos/2026-01-20-1768867200.md")).toContain("revised remote prose");
    expect(sync.vault.trashed).toEqual(["Memos/2026-01-19-10.md"]);
  });
});
