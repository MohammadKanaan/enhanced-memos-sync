import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";

import { normalizeRemoteMemos } from "../../src/memos/normalize";
import { renderMemoNote } from "../../src/render/memo-note";
import { acceptanceMemo, createAcceptanceSync } from "../support/acceptance";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8");
}

describe("SPEC 10.4 memo files and frontmatter", () => {
  it("golden-renders standalone schema with a final newline and preserves internal Markdown after outer trimming", () => {
    const [memo] = normalizeRemoteMemos([{ name: "memos/1768867200", content: "  Hello #Launch  ", timestamp: 1_768_867_200 }]).valid;
    const rendered = renderMemoNote({ parent: memo!, comments: [] }, { accountName: "Default", apiUrl: "https://memos.example" });
    expect(rendered).toBe(fixture("standalone-memo.golden.md"));
    expect(rendered.endsWith("\n")).toBe(true);
  });

  it("normalizes nested folders and emits YAML that preserves punctuation, Unicode, arrays, URLs, and nested user fields", () => {
    const [memo] = normalizeRemoteMemos([{ name: "memos/1", content: "こんにちは", timestamp: 1 }]).valid;
    const rendered = renderMemoNote({ parent: memo!, comments: [] }, {
      accountName: "A: B", apiUrl: "https://memos.example/a?x=1",
      existingContent: "---\ncustom: [one, 'two:2']\nsite: https://example.test/x?y=1\nprofile:\n  name: José\n---\nold",
    });
    const frontmatter = rendered.slice(4, rendered.indexOf("\n---", 4));
    expect(YAML.parse(frontmatter)).toMatchObject({ custom: ["one", "two:2"], site: "https://example.test/x?y=1", profile: { name: "José" } });
  });

  it("preserves unknown frontmatter, refreshes owned account metadata, and removes stale thread fields", () => {
    const [memo] = normalizeRemoteMemos([{ name: "memos/1", content: "same", timestamp: 1 }]).valid;
    const rendered = renderMemoNote({ parent: memo!, comments: [] }, {
      accountName: "Changed", apiUrl: "https://new.example",
      existingContent: "---\nsource: old\ncomment_count: 3\nthread_ids: [memos/2]\ncustom: keep\n---\nsame",
    });
    expect(rendered).toContain('source: "Changed (https://new.example)"');
    expect(rendered).toContain("custom: keep");
    expect(rendered).not.toContain("comment_count");
    expect(rendered).not.toContain("thread_ids");
  });

  it("normalizes memo folders and creates nested folders recursively before writing", async () => {
    const sync = createAcceptanceSync({ records: [acceptanceMemo(1_768_867_200)], settings: { memoNoteFolder: " /nested/memos/ " } });
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    expect(sync.vault.folders).toContain("nested/memos");
    expect(sync.vault.text.has("nested/memos/2026-01-20-1768867200.md")).toBe(true);
  });
});
