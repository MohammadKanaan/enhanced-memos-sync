import { describe, expect, it } from "vitest";

import { renderMemoNote } from "../../src/render/memo-note";
import type { NormalizedMemo } from "../../src/core/types";

const parent: NormalizedMemo = {
  id: "memos/1",
  content: "  Parent #tag\n- [ ] task  ",
  timestamp: 100,
  localDate: "1970-01-01",
  createdAtIso: "1970-01-01T00:01:40.000Z",
  resources: [],
  source: { name: "memos/1", content: "Parent", timestamp: 100 },
};

const comment: NormalizedMemo = {
  ...parent,
  id: "memos/2",
  content: "Comment",
  timestamp: 101,
  source: { name: "memos/2", content: "Comment", timestamp: 101 },
};

describe("memo note rendering", () => {
  it("renders a threaded note with ordered owned metadata and parent-only tags", () => {
    expect(
      renderMemoNote(
        { parent, comments: [comment] },
        { accountName: "Default", apiUrl: "https://memos.example", resourceMarkdown: new Map([["memos/1", ["![[one.png]]"]]]) },
      ),
    ).toBe(
      [
        "---",
        "memo_id: memos/1",
        'created_at: "1970-01-01T00:01:40.000Z"',
        "timestamp: 100",
        "date: 1970-01-01",
        "tags:",
        "  - memo",
        "  - daily-record",
        "  - tag",
        'source: "Default (https://memos.example)"',
        "comment_count: 1",
        "thread_ids:",
        "  - memos/2",
        "---",
        "",
        "Parent #tag",
        "- [ ] task",
        "![[one.png]]",
        "",
        "---",
        "",
        "## 💬 Comments",
        "",
        "Comment",
        "",
      ].join("\n"),
    );
  });

  it("preserves unknown existing frontmatter values and removes stale thread fields", () => {
    const existing = [
      "---",
      "memo_id: old",
      "comment_count: 4",
      "thread_ids: [old]",
      "custom:",
      "  nested: true",
      "---",
      "old body",
    ].join("\n");

    const rendered = renderMemoNote(
      { parent, comments: [] },
      { accountName: "Personal", apiUrl: "https://memos.example", existingContent: existing },
    );

    expect(rendered).toContain("custom:\n  nested: true");
    expect(rendered).not.toContain("comment_count");
    expect(rendered).not.toContain("thread_ids");
    expect(rendered.endsWith("\n")).toBe(true);
  });
});
