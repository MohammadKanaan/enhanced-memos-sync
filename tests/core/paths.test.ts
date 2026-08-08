import { describe, expect, it } from "vitest";

import {
  buildMemoBasename,
  buildMemoPath,
  normalizeFolderPath,
  sanitizeAttachmentFilenamePart,
} from "../../src/core/paths";

describe("core paths", () => {
  it("builds the stable memo basename and path", () => {
    expect(buildMemoBasename("2026-01-15", 1736942400)).toBe("2026-01-15-1736942400");
    expect(buildMemoPath(" /Memos/Archive/ ", "2026-01-15", 1736942400)).toBe(
      "Memos/Archive/2026-01-15-1736942400.md",
    );
  });

  it("normalizes Unicode nested folders and rejects traversal", () => {
    expect(normalizeFolderPath(" /Memos\\年//Archive/ ", "Memos")).toBe(
      "Memos/年/Archive",
    );
    expect(normalizeFolderPath("///", "attachments")).toBe("attachments");
    expect(() => normalizeFolderPath("Memos/../private", "Memos")).toThrow("traversal");
    expect(() => normalizeFolderPath("./Memos", "Memos")).toThrow("traversal");
  });

  it("replaces each disallowed attachment filename character", () => {
    expect(sanitizeAttachmentFilenamePart('a/b\\c?d%e*f:g|h"i<j>k')).toBe(
      "a-b-c-d-e-f-g-h-i-j-k",
    );
  });
});
