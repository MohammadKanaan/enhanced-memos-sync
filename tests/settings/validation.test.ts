import { describe, expect, it } from "vitest";

import {
  normalizeFolder,
  normalizeHeader,
  validateApiUrl,
  validateCommentOrderRegex,
  validateNonNegativeInteger,
} from "../../src/settings/validation";

describe("settings validation", () => {
  it("normalizes absolute HTTP URLs without replacing the saved value on invalid input", () => {
    expect(validateApiUrl(" https://memos.example/// ", "")).toEqual({
      value: "https://memos.example",
    });
    expect(validateApiUrl("ftp://memos.example", "https://saved.example")).toMatchObject({
      value: "https://saved.example",
      error: expect.any(String),
    });
  });

  it("accepts only non-negative safe integer text", () => {
    expect(validateNonNegativeInteger("0", 30)).toEqual({ value: 0 });
    expect(validateNonNegativeInteger("0012", 30)).toEqual({ value: 12 });

    for (const invalid of ["", " ", "-1", "1.5", "1e3", "9007199254740992", "a1"]) {
      expect(validateNonNegativeInteger(invalid, 30)).toMatchObject({
        value: 30,
        error: expect.any(String),
      });
    }
  });

  it("normalizes folders and headers without changing nested segments", () => {
    expect(normalizeFolder(" /Memos/Archive/ ", "Memos")).toBe("Memos/Archive");
    expect(normalizeFolder(" /// ", "attachments")).toBe("attachments");
    expect(normalizeHeader("  ## 📓 Memos  ")).toBe("## 📓 Memos");
  });

  it("keeps the prior regex when a non-blank pattern is invalid", () => {
    expect(validateCommentOrderRegex("", "-- (\\d+) --")).toEqual({ value: "" });
    expect(validateCommentOrderRegex("-- (\\d+) --", "")).toEqual({
      value: "-- (\\d+) --",
    });
    expect(validateCommentOrderRegex("[", "-- (\\d+) --")).toMatchObject({
      value: "-- (\\d+) --",
      error: expect.any(String),
    });
  });
});
