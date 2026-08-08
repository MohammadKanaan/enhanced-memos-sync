import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { downloadMissingAttachments } from "../../src/resources/download";
import { planResources } from "../../src/resources/resources";
import { FakeRequestPort } from "../support/fake-request-port";
import { acceptanceMemo, createAcceptanceSync } from "../support/acceptance";
import { InMemoryVault } from "../support/in-memory-vault";

describe("SPEC 10.7 resources and attachments", () => {
  it("uses identity and filename precedence, sanitizes every forbidden filename character, and never produces undefined output", () => {
    const result = planResources([
      { id: "id/with?chars", uid: "ignored", filename: "file\\/?%*:|\"<>.pdf" },
      { filename: "missing-id.pdf" },
      { id: "missing-name", name: "" },
    ], { apiUrl: "https://memos.example", attachmentFolder: "nested/attachments", skipImages: false });
    expect(result.items[0]).toMatchObject({
      markdown: "![[id-with-chars-file----------.pdf]]",
      path: "nested/attachments/id-with-chars-file----------.pdf",
      url: "https://memos.example/o/r/ignored",
    });
    expect(JSON.stringify(result)).not.toContain("undefined");
    expect(result.diagnostics).toHaveLength(2);
  });

  it("renders local and external links, skips image links and downloads, and supports all compatible encoded endpoint shapes", () => {
    const all = planResources([
      { name: "image", type: "image/png", externalLink: "https://cdn.example/image.png" },
      { filename: "external", externalLink: "https://example.test" },
      { uid: "folder id", name: "attachments/old name.pdf", filename: "new name.pdf" },
      { uid: "resource id", name: "resources/a/name.pdf", filename: "name.pdf" },
      { id: "fallback id", filename: "fallback.pdf" },
    ], { apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false });
    expect(all.items.map((item) => item.markdown)).toEqual(expect.arrayContaining([
      "![image](https://cdn.example/image.png)", "[external](https://example.test)",
    ]));
    expect(all.items.map((item) => item.url)).toEqual(expect.arrayContaining([
      "https://memos.example/file/attachments/folder%20id/new%20name.pdf",
      "https://memos.example/file/resources/name.pdf/name.pdf",
      "https://memos.example/o/r/fallback%20id",
    ]));
    expect(planResources([
      { name: "image", type: "image/png", externalLink: "https://cdn.example/image.png" },
      { id: "local-image", filename: "local.png", type: "image/png" },
    ], {
      apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: true,
    }).items).toEqual([]);
    expect(planResources([{ externalLink: "https://example.test/no-name" }], {
      apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false,
    }).items).toEqual([expect.objectContaining({ markdown: "[resource](https://example.test/no-name)" })]);
  });

  it("reads the binary fixture, writes exact binary data once, creates nested folders, authenticates downloads, and isolates resource failures", async () => {
    const vault = new InMemoryVault();
    const fixture = readFileSync(fileURLToPath(new URL("../fixtures/attachment.bin", import.meta.url)));
    const bytes = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);
    const request = new FakeRequestPort((_call, index) => index === 0
      ? { status: 200, text: "", arrayBuffer: bytes }
      : { status: 500, text: "bad token" });
    const resources = planResources([
      { id: "one", filename: "one.bin" },
      { id: "two", filename: "two.bin" },
    ], { apiUrl: "https://memos.example", attachmentFolder: "deep/attachments", skipImages: false }).items;
    const result = await downloadMissingAttachments(resources, vault, request, "token");
    expect(Buffer.from(vault.binary.get("deep/attachments/one-one.bin")!)).toEqual(fixture);
    expect(vault.folders).toContain("deep/attachments");
    expect(request.calls[0]?.headers).toEqual({ Authorization: "Bearer token" });
    expect(result).toMatchObject({ downloaded: 1, diagnostics: [expect.objectContaining({ resourceId: "two" })] });
    await downloadMissingAttachments(resources, vault, request, "token");
    expect(request.calls).toHaveLength(3);
  });

  it("downloads and embeds parent and comment resources through the real coordinator", async () => {
    const parentTimestamp = 1_768_867_200;
    const commentTimestamp = 1_768_867_201;
    const sync = createAcceptanceSync({
      settings: { mergeCommentsIntoParent: true, attachmentFolder: "thread-assets" },
      records: [
        acceptanceMemo(parentTimestamp, { content: "Parent", attachments: [{ id: "parent-file", filename: "parent.pdf" }] }),
        acceptanceMemo(commentTimestamp, { content: "Comment", parent: `memos/${parentTimestamp}`, attachments: [{ id: "comment-file", filename: "comment.pdf" }] }),
      ],
      response: (_call, index) => ({ status: 200, text: "", arrayBuffer: new Uint8Array([index + 1]).buffer }),
    });
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true, counts: { attachmentsDownloaded: 2, memoNotesWritten: 1 } });
    const note = sync.vault.text.get("Memos/2026-01-20-1768867200.md") ?? "";
    expect(note).toContain("Parent\n![[parent-file-parent.pdf]]");
    expect(note).toContain("Comment\n![[comment-file-comment.pdf]]");
    expect([...sync.vault.binary.keys()]).toEqual(["thread-assets/parent-file-parent.pdf", "thread-assets/comment-file-comment.pdf"]);
    expect(sync.request.calls.map((call) => call.headers)).toEqual([{ Authorization: "Bearer secret" }, { Authorization: "Bearer secret" }]);
  });
});
