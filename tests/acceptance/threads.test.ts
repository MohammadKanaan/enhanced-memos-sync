import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeRemoteMemos } from "../../src/memos/normalize";
import { renderMemoNote } from "../../src/render/memo-note";
import { associateThreads } from "../../src/threads/associate";
import { orderComments } from "../../src/threads/order";
import { createAcceptanceSync } from "../support/acceptance";

function normalized(records: unknown[]) {
  return normalizeRemoteMemos(records).valid;
}

describe("SPEC 10.6 threads", () => {
  it("emits every memo independently when disabled and associates exact or trailing parent IDs only once when enabled", () => {
    const memos = normalized([
      { name: "memos/parent", content: "Parent #Launch", timestamp: 1_768_867_200 },
      { name: "memos/comment-one", content: "Reply", timestamp: 1_768_867_201, parent: "memos/parent" },
      { name: "memos/comment-two", content: "Reply 2", timestamp: 1_768_867_202, parent: "folder/parent" },
      { name: "memos/orphan", content: "Orphan", timestamp: 1_768_867_203, parent: "memos/missing" },
    ]);
    expect(associateThreads(memos, false).map((thread) => thread.comments)).toEqual([[], [], [], []]);
    const threads = associateThreads(memos, true);
    expect(threads.map((thread) => [thread.parent.id, thread.comments.map((comment) => comment.id)])).toEqual([
      ["memos/parent", ["memos/comment-one", "memos/comment-two"]],
      ["memos/orphan", []],
    ]);
  });

  it("renders the threaded schema and body structure, including the parent and comment resources", () => {
    const [parent, comment] = normalized([
      { name: "memos/1768867200", content: "Hello #Launch", timestamp: 1_768_867_200 },
      { name: "memos/1768867201", content: "Reply", timestamp: 1_768_867_201, parent: "memos/1768867200" },
    ]);
    const rendered = renderMemoNote({ parent: parent!, comments: [comment!] }, { accountName: "Default", apiUrl: "https://memos.example" });
    const golden = readFileSync(fileURLToPath(new URL("../fixtures/threaded-memo.golden.md", import.meta.url)), "utf8");
    expect(rendered).toBe(golden);
    const withResources = renderMemoNote({ parent: parent!, comments: [comment!] }, {
      accountName: "Default",
      apiUrl: "https://memos.example",
      resourceMarkdown: new Map([[parent!.id, ["![[parent.pdf]]"]], [comment!.id, ["![[comment.pdf]]"]]]),
    });
    expect(withResources).toContain("Hello #Launch\n![[parent.pdf]]");
    expect(withResources).toContain("Reply\n![[comment.pdf]]");
  });

  it("orders regex matches by numeric capture with chronological ties and falls back for non-matches, blanks, and invalid runtime regexes", () => {
    const comments = normalized([
      { id: "late", content: "-- 2/3 --", timestamp: 30 },
      { id: "early-tie", content: "-- 2/3 --", timestamp: 10 },
      { id: "first", content: "-- 1/3 --", timestamp: 20 },
      { id: "none", content: "unmatched", timestamp: 5 },
    ]);
    expect(orderComments(comments, "-- (\\d+)/").map((memo) => memo.id)).toEqual(["first", "early-tie", "late", "none"]);
    expect(orderComments(comments, "").map((memo) => memo.id)).toEqual(["none", "early-tie", "first", "late"]);
    expect(orderComments(comments, "[").map((memo) => memo.id)).toEqual(["none", "early-tie", "first", "late"]);
  });

  it("transitions between standalone and threaded force-sync output without retaining stale thread metadata", async () => {
    const settings: { mergeCommentsIntoParent: boolean } = { mergeCommentsIntoParent: false };
    const sync = createAcceptanceSync({
      settings,
      records: [
        { name: "memos/1768867200", content: "Parent", timestamp: 1_768_867_200 },
        { name: "memos/1768867201", content: "Reply", timestamp: 1_768_867_201, parent: "memos/1768867200" },
      ],
    });
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { memoNotesWritten: 2 } });
    expect(sync.vault.text.get("Memos/2026-01-20-1768867201.md")).toContain("Reply");

    settings.mergeCommentsIntoParent = true;
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { memoNotesTrashed: 1 } });
    expect(sync.vault.text.get("Memos/2026-01-20-1768867200.md")).toContain("## 💬 Comments");
    expect(sync.vault.trashed).toContain("Memos/2026-01-20-1768867201.md");

    settings.mergeCommentsIntoParent = false;
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    const parent = sync.vault.text.get("Memos/2026-01-20-1768867200.md") ?? "";
    expect(parent).not.toContain("comment_count");
    expect(parent).not.toContain("thread_ids");
    expect(parent).not.toContain("## 💬 Comments");
    expect(sync.vault.text.get("Memos/2026-01-20-1768867201.md")).toContain("Reply");
  });
});
