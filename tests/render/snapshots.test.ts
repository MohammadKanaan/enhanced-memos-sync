import { describe, expect, it } from "vitest";

import { recoverThreadTaskStates } from "../../src/render/snapshots";

describe("thread render snapshots", () => {
  it("preserves task state per segment when remote prose changes", () => {
    const result = recoverThreadTaskStates({
      existingBody: [
        "Parent changed prose",
        "- [x] parent task",
        "",
        "---",
        "",
        "## 💬 Comments",
        "",
        "Comment changed prose",
        "- [X] comment task",
      ].join("\n"),
      snapshot: {
        notePath: "Memos/2026-01-01-1.md",
        segments: [
          { id: "parent", markdown: "Parent old prose\n- [ ] parent task" },
          { id: "comment", markdown: "Comment old prose\n- [ ] comment task" },
        ],
      },
      freshSegments: [
        { id: "parent", markdown: "Parent fresh prose\n- [ ] parent task" },
        { id: "comment", markdown: "Comment fresh prose\n- [ ] comment task" },
      ],
    });

    expect(result.segments).toEqual([
      { id: "parent", markdown: "Parent fresh prose\n- [x] parent task" },
      { id: "comment", markdown: "Comment fresh prose\n- [X] comment task" },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps ambiguous fallback comment states remote-controlled without a snapshot", () => {
    const result = recoverThreadTaskStates({
      existingBody: [
        "- [x] parent",
        "",
        "---",
        "",
        "## 💬 Comments",
        "",
        "- [X] duplicate",
        "",
        "- [x] duplicate",
      ].join("\n"),
      freshSegments: [
        { id: "parent", markdown: "- [ ] parent" },
        { id: "one", markdown: "- [ ] duplicate" },
        { id: "two", markdown: "- [ ] duplicate" },
      ],
    });

    expect(result.segments).toEqual([
      { id: "parent", markdown: "- [x] parent" },
      { id: "one", markdown: "- [ ] duplicate" },
      { id: "two", markdown: "- [ ] duplicate" },
    ]);
    expect(result.diagnostics).toHaveLength(1);
  });
});
