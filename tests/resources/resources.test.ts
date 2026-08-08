import { describe, expect, it } from "vitest";

import { planResources } from "../../src/resources/resources";

describe("resource planning", () => {
  it("renders external links without downloading them and respects image skipping", () => {
    const resources = [
      { name: "photo", type: "IMAGE/png", externalLink: "https://cdn.example/photo.png" },
      { filename: "document", externalLink: "https://example.com/document" },
    ];

    expect(
      planResources(resources, {
        apiUrl: "https://memos.example",
        attachmentFolder: "attachments",
        skipImages: false,
      }).items.map((item) => item.markdown),
    ).toEqual(["![photo](https://cdn.example/photo.png)", "[document](https://example.com/document)"]);
    expect(
      planResources(resources, {
        apiUrl: "https://memos.example",
        attachmentFolder: "attachments",
        skipImages: true,
      }).items.map((item) => item.markdown),
    ).toEqual(["[document](https://example.com/document)"]);
  });

  it("uses local identity, filename, endpoint, encoding, and wiki-link precedence", () => {
    const result = planResources(
      [
        {
          id: "id wins",
          uid: "uid ignored",
          name: "attachments/path/ignored.txt",
          filename: "actual file?.pdf",
          type: "application/pdf",
        },
        {
          uid: "uid value",
          name: "resources/folder/name space.png",
          filename: "name space.png",
          type: "image/png",
        },
        { id: "fallback-id", name: "other/last name.txt", filename: "last name.txt" },
      ],
      { apiUrl: "https://memos.example/", attachmentFolder: "attachments", skipImages: false },
    );

    expect(result.items).toMatchObject([
      {
        markdown: "![[id wins-actual file-.pdf]]",
        path: "attachments/id wins-actual file-.pdf",
        url: "https://memos.example/file/attachments/uid%20ignored/actual%20file%3F.pdf",
      },
      {
        markdown: "![[uid value-name space.png]]",
        url: "https://memos.example/file/resources/name%20space.png/name%20space.png",
      },
      {
        markdown: "![[fallback-id-last name.txt]]",
        url: "https://memos.example/o/r/fallback-id",
      },
    ]);
  });

  it("preserves a configured server subpath for local resource endpoints", () => {
    const result = planResources(
      [{ id: "file", filename: "file.pdf" }],
      { apiUrl: "https://memos.example/self-hosted/", attachmentFolder: "attachments", skipImages: false },
    );

    expect(result.items).toContainEqual(expect.objectContaining({
      url: "https://memos.example/self-hosted/o/r/file",
    }));
  });

  it("keeps the remote request filename but gives extensionless images a renderable local extension", () => {
    const result = planResources(
      [{ name: "attachments/7hSX2q7jWzZwrttv6puFe", filename: "image", type: "image/png" }],
      { apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false },
    );

    expect(result.items).toEqual([expect.objectContaining({
      markdown: "![[7hSX2q7jWzZwrttv6puFe-image.png]]",
      path: "attachments/7hSX2q7jWzZwrttv6puFe-image.png",
      url: "https://memos.example/file/attachments/7hSX2q7jWzZwrttv6puFe/image",
    })]);
  });

  it("warns and creates no local work for missing identity or filename", () => {
    const result = planResources(
      [{ filename: "only-file" }, { id: "only-id", name: "" }],
      { apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false },
    );

    expect(result.items).toEqual([]);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);
  });

  it("treats malformed resource entries as attachment errors and normalizes the attachment folder", () => {
    const result = planResources(
      [null, { id: "file", filename: "file.pdf" }] as never,
      { apiUrl: "https://memos.example", attachmentFolder: " /attachments/ ", skipImages: false },
    );

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", stage: "attachment" }));
    expect(result.items).toContainEqual(expect.objectContaining({ path: "attachments/file-file.pdf" }));
  });
});
