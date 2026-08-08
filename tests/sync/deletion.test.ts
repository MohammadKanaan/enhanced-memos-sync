import { describe, expect, it } from "vitest";

import { canTrashMemoNote } from "../../src/sync/deletion";

const content = [
  "---",
  "memo_id: memos/1",
  "timestamp: 100",
  "date: 1970-01-01",
  "tags: [memo, daily-record]",
  'source: "Default (https://memos.example)"',
  "---",
].join("\n");

describe("force deletion safety", () => {
  it("accepts only a positively identified stale memo-note direct child", () => {
    expect(
      canTrashMemoNote({
        path: "Memos/1970-01-01-100.md",
        content,
        memoFolder: "Memos",
        source: "Default (https://memos.example)",
        authoritativePaths: new Set(),
        cutoffDate: "1970-01-01",
        today: "1970-01-02",
      }),
    ).toEqual({ eligible: true });
  });

  it("protects unrelated, authoritative, nested, and metadata-mismatched files", () => {
    const base = {
      content,
      memoFolder: "Memos",
      source: "Default (https://memos.example)",
      authoritativePaths: new Set<string>(),
      cutoffDate: "1970-01-01",
      today: "1970-01-02",
    };
    expect(canTrashMemoNote({ ...base, path: "Memos/nested/1970-01-01-100.md" }).eligible).toBe(false);
    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-01-100.md", content: content.replace("timestamp: 100", "timestamp: 99") }).eligible).toBe(false);
    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-01-100.md", authoritativePaths: new Set(["Memos/1970-01-01-100.md"]) }).eligible).toBe(false);
  });
});
