import { describe, expect, it } from "vitest";

import { acceptanceMemo, createAcceptanceSync, managedMemoNote } from "../support/acceptance";

describe("SPEC 10.9 reconciliation safety", () => {
  it("force sync updates remote edits, removes stale embeds, and trashes only positively identified managed notes in the configured window", async () => {
    const sync = createAcceptanceSync({ records: [acceptanceMemo(1_768_867_200, { content: "fresh remote edit" })] });
    sync.dailyNotes.seed("2026-01-19", "daily/nonstandard-name.md", "# Day\n\n## 📓 Memos\n![[2026-01-19-10]]\n");
    sync.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));
    sync.vault.text.set("Memos/2026-01-19-11.md", "---\nmemo_id: impostor\nsource: \"Elsewhere (https://example.test)\"\n---\nnot ours\n");
    sync.vault.text.set("Memos/2025-01-01-12.md", managedMemoNote(12, "2025-01-01"));
    sync.vault.binary.set("attachments/keep.bin", new Uint8Array([9]).buffer);

    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { memoNotesTrashed: 1 } });
    expect(sync.vault.text.get("Memos/2026-01-20-1768867200.md")).toContain("fresh remote edit");
    expect(sync.dailyNotes.notes.get("daily/nonstandard-name.md")?.content).not.toContain("![[2026-01-19-10]]");
    expect(sync.vault.trashed).toEqual(["Memos/2026-01-19-10.md"]);
    expect(sync.vault.text.has("Memos/2026-01-19-11.md")).toBe(true);
    expect(sync.vault.text.has("Memos/2025-01-01-12.md")).toBe(true);
    expect([...new Uint8Array(sync.vault.binary.get("attachments/keep.bin")!)]).toEqual([9]);
  });

  it("never deletes or advances the cursor after pagination, normalization, attachment, memo-write, or daily-note failures", async () => {
    const cases = [
      createAcceptanceSync({ state: { cursor: 99, renderSnapshots: {} }, fetch: async () => { throw new Error("pagination failed"); } }),
      createAcceptanceSync({ state: { cursor: 99, renderSnapshots: {} }, records: [{ id: "bad", timestamp: 0 }] }),
      createAcceptanceSync({
        state: { cursor: 99, renderSnapshots: {} }, records: [acceptanceMemo(1_768_867_200, { attachments: [{ id: "bad", filename: "bad.pdf" }] })],
        response: () => ({ status: 500, text: "download failed" }),
      }),
    ];
    for (const sync of cases) {
      sync.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));
      await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: false });
      expect(sync.vault.trashed).toEqual([]);
      expect(sync.persistence.state().cursor).toBe(99);
    }

    const writeFailure = createAcceptanceSync({ state: { cursor: 99, renderSnapshots: {} }, records: [acceptanceMemo(1_768_867_200)] });
    writeFailure.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));
    writeFailure.vault.failWritesFor.add("Memos/2026-01-20-1768867200.md");
    await writeFailure.coordinator.run("force");
    expect(writeFailure.vault.trashed).toEqual([]);
    expect(writeFailure.persistence.state().cursor).toBe(99);

    const dailyFailure = createAcceptanceSync({ state: { cursor: 99, renderSnapshots: {} }, records: [acceptanceMemo(1_768_867_200)] });
    dailyFailure.vault.text.set("Memos/2026-01-19-10.md", managedMemoNote(10, "2026-01-19"));
    dailyFailure.dailyNotes.failDates.add("2026-01-20");
    await dailyFailure.coordinator.run("force");
    expect(dailyFailure.vault.trashed).toEqual([]);
    expect(dailyFailure.persistence.state().cursor).toBe(99);
  });

  it("clears the cursor after an empty successful force sync but never records a partial sync as successful today", async () => {
    const empty = createAcceptanceSync({ state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-19", renderSnapshots: {} } });
    await expect(empty.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    expect(empty.persistence.state()).toMatchObject({ cursor: undefined, lastSuccessfulSyncDate: "2026-01-20" });

    const partial = createAcceptanceSync({ state: { cursor: 99, lastSuccessfulSyncDate: "2026-01-19", renderSnapshots: {} }, records: [{ id: "bad", timestamp: 0 }] });
    await expect(partial.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(partial.persistence.state().lastSuccessfulSyncDate).toBe("2026-01-19");
  });
});
