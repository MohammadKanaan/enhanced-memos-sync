import { describe, expect, it } from "vitest";

import { associateThreads } from "../../src/threads/associate";
import type { NormalizedMemo } from "../../src/core/types";

function memo(id: string, timestamp: number, parent?: string): NormalizedMemo {
  return {
    id,
    content: id,
    timestamp,
    localDate: "2026-01-01",
    createdAtIso: "2026-01-01T00:00:00.000Z",
    resources: [],
    ...(parent ? { parent } : {}),
    source: { name: id, content: id, timestamp },
  };
}

describe("thread association", () => {
  it("emits every memo independently when merging is disabled", () => {
    expect(associateThreads([memo("memos/parent", 1), memo("memos/reply", 2, "memos/parent")], false))
      .toEqual([
        { parent: memo("memos/parent", 1), comments: [] },
        { parent: memo("memos/reply", 2, "memos/parent"), comments: [] },
      ]);
  });

  it("associates a reply once using exact or trailing parent identity and leaves orphans standalone", () => {
    const parent = memo("memos/parent", 1);
    const reply = memo("memos/reply", 2, "folders/parent");
    const orphan = memo("memos/orphan", 3, "missing");

    expect(associateThreads([parent, reply, orphan], true)).toEqual([
      { parent, comments: [reply] },
      { parent: orphan, comments: [] },
    ]);
  });
});
