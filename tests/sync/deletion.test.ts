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

  it("accepts a finite numeric memo identity emitted by unquoted YAML", () => {
    expect(canTrashMemoNote({
      path: "Memos/1970-01-01-100.md",
      content: content.replace("memo_id: memos/1", "memo_id: 123"),
      memoFolder: "Memos",
      source: "Default (https://memos.example)",
      authoritativePaths: new Set(),
      cutoffDate: "1970-01-01",
      today: "1970-01-02",
    })).toEqual({ eligible: true });
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
    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-01-100.md", content: "unrelated" }).eligible).toBe(false);
    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-01-100.md", content: content.replace("timestamp: 100", "timestamp: 99") }).eligible).toBe(false);
    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-01-100.md", authoritativePaths: new Set(["Memos/1970-01-01-100.md"]) }).eligible).toBe(false);
  });

  it("requires matching source, date, numeric timestamp, and managed tags", () => {
    const base = {
      path: "Memos/1970-01-01-100.md",
      content,
      memoFolder: "Memos",
      source: "Default (https://memos.example)",
      authoritativePaths: new Set<string>(),
      cutoffDate: "1970-01-01",
      today: "1970-01-02",
    };

    for (const changed of [
      content.replace("Default (https://memos.example)", "Other (https://memos.example)"),
      content.replace("date: 1970-01-01", "date: 1970-01-02"),
      content.replace("timestamp: 100", 'timestamp: "100"'),
      content.replace("tags: [memo, daily-record]", "tags: [memo]"),
      content.replace("memo_id: memos/1", "memo_id: \"\""),
    ]) {
      expect(canTrashMemoNote({ ...base, content: changed }).eligible).toBe(false);
    }
  });

  it("leaves outside-window notes and non-markdown attachments alone", () => {
    const base = {
      content,
      memoFolder: "Memos",
      source: "Default (https://memos.example)",
      authoritativePaths: new Set<string>(),
      cutoffDate: "1970-01-02",
      today: "1970-01-03",
    };

    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-01-100.md" })).toMatchObject({ eligible: false, reason: "outside sync window" });
    expect(canTrashMemoNote({ ...base, path: "Memos/1970-01-02-100.png" }).eligible).toBe(false);
  });

  it("accepts an unembedded but positively identified deleted memo and normalizes its path", () => {
    expect(canTrashMemoNote({
      path: "/Memos//1970-01-01-100.md",
      content,
      memoFolder: "Memos/",
      source: "Default (https://memos.example)",
      authoritativePaths: new Set(),
      cutoffDate: "1970-01-01",
      today: "1970-01-02",
    })).toEqual({ eligible: true });
  });

  it("rejects impossible calendar dates and timestamps outside JavaScript's safe integer range", () => {
    const base = {
      memoFolder: "Memos",
      source: "Default (https://memos.example)",
      authoritativePaths: new Set<string>(),
      cutoffDate: "1970-01-01",
      today: "9999-12-31",
    };

    expect(canTrashMemoNote({
      ...base,
      path: "Memos/1970-02-30-100.md",
      content: content.replace("1970-01-01", "1970-02-30"),
    }).eligible).toBe(false);
    expect(canTrashMemoNote({
      ...base,
      path: "Memos/1970-01-01-9007199254740992.md",
      content: content.replace("timestamp: 100", "timestamp: 9007199254740992"),
    }).eligible).toBe(false);
  });
});
