import { describe, expect, it } from "vitest";

import { extractHashtags } from "../../src/render/hashtags";

describe("hashtag extraction", () => {
  it("keeps valid Unicode tags in first-seen order and deduplicates exact values", () => {
    const markdown = [
      "Visible #alpha #مرحبا #Foo/bar_baz-9 #alpha",
      "word#hidden",
      "`#inline`",
      "````markdown",
      "#fenced",
      "````",
      "~~~",
      "#tilde-fenced",
      "~~~~",
      "Final #آخر",
    ].join("\n");

    expect(extractHashtags(markdown)).toEqual(["alpha", "مرحبا", "Foo/bar_baz-9", "آخر"]);
  });

  it("ignores variable-length inline-code runs while retaining safe-boundary tags", () => {
    expect(extractHashtags("`` code `#ignored` `` (#kept) #also-kept #x"))
      .toEqual(["kept", "also-kept", "x"]);
  });
});
