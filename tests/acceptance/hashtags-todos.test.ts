import { describe, expect, it } from "vitest";

import { extractHashtags } from "../../src/render/hashtags";
import { recoverThreadTaskStates } from "../../src/render/snapshots";
import { applyTaskStates, extractTaskStates } from "../../src/render/tasks";

describe("SPEC 10.5 hashtags and todos", () => {
  it("extracts ordered, case-sensitive, unique Unicode hashtags while ignoring inline and fenced code", () => {
    expect(extractHashtags("#First #Été #First #first\n`#inline`\n```md\n#fenced\n```\n#最後")).toEqual(["First", "Été", "first", "最後"]);
  });

  it("preserves matching local task state after remote prose, ordering, duplicate text, indentation, Unicode, and uppercase-X changes", () => {
    const local = extractTaskStates("  - [X] keep\n- [x] duplicate\n- [ ] duplicate\n- [x] 日本語");
    expect(applyTaskStates(local, "new prose\n- [ ] duplicate\n  - [ ] keep\n- [ ] 日本語\n- [ ] changed\n- [y] malformed")).toBe(
      "new prose\n- [ ] duplicate\n  - [X] keep\n- [x] 日本語\n- [ ] changed\n- [y] malformed",
    );
  });

  it("changes only checkbox state when local and remote task prose is otherwise identical", () => {
    const local = extractTaskStates("before\n- [X] exact task\nafter");
    expect(applyTaskStates(local, "before\n- [ ] exact task\nafter")).toBe("before\n- [X] exact task\nafter");
  });

  it("preserves parent and comment task states independently when threaded remote prose changes", () => {
    const recovered = recoverThreadTaskStates({
      existingBody: "Parent prose\n- [x] parent task\n\n---\n\n## 💬 Comments\n\nComment prose\n- [X] comment task",
      snapshot: {
        notePath: "Memos/one.md",
        segments: [
          { id: "parent", markdown: "Parent prose\n- [ ] parent task" },
          { id: "comment", markdown: "Comment prose\n- [ ] comment task" },
        ],
      },
      freshSegments: [
        { id: "parent", markdown: "Changed parent prose\n- [ ] parent task\n- [ ] new parent" },
        { id: "comment", markdown: "Changed comment prose\n- [ ] comment task" },
      ],
    });
    expect(recovered.segments).toEqual([
      { id: "parent", markdown: "Changed parent prose\n- [x] parent task\n- [ ] new parent" },
      { id: "comment", markdown: "Changed comment prose\n- [X] comment task" },
    ]);
  });
});
