import { describe, expect, it } from "vitest";

import { orderComments } from "../../src/threads/order";
import type { NormalizedMemo } from "../../src/core/types";

const comments = [
  { id: "late", content: "-- 2/3 --", timestamp: 30 },
  { id: "early", content: "-- 1/3 --", timestamp: 20 },
  { id: "unmatched", content: "ordinary", timestamp: 10 },
  { id: "tied", content: "-- 2/3 --", timestamp: 25 },
] as NormalizedMemo[];

describe("comment ordering", () => {
  it("orders matching numeric comments before chronological non-matches without mutation", () => {
    const original = structuredClone(comments);

    expect(orderComments(comments, "-- (\\d+)/(\\d+) --").map((comment) => comment.id)).toEqual([
      "early",
      "tied",
      "late",
      "unmatched",
    ]);
    expect(comments).toEqual(original);
  });

  it("falls back to chronological ordering for blank or invalid regexes", () => {
    expect(orderComments(comments, "").map((comment) => comment.id)).toEqual([
      "unmatched",
      "early",
      "tied",
      "late",
    ]);
    expect(orderComments(comments, "[").map((comment) => comment.id)).toEqual([
      "unmatched",
      "early",
      "tied",
      "late",
    ]);
    expect(orderComments(comments, " \t ").map((comment) => comment.id)).toEqual([
      "unmatched",
      "early",
      "tied",
      "late",
    ]);
  });
});
