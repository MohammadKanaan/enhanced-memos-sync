import { describe, expect, it } from "vitest";

import { downloadMissingAttachments } from "../../src/resources/download";
import { planResources } from "../../src/resources/resources";
import { FakeRequestPort } from "../support/fake-request-port";

class FakeAttachmentVault {
  readonly folders: string[] = [];
  readonly existing = new Set<string>();
  readonly writes: Array<{ path: string; data: ArrayBuffer }> = [];

  async ensureFolder(path: string): Promise<void> {
    this.folders.push(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.existing.has(path);
  }

  async writeBinaryIfAbsent(path: string, data: ArrayBuffer): Promise<"created" | "existing"> {
    this.writes.push({ path, data });
    return "created";
  }
}

describe("attachment downloads", () => {
  it("skips existing files without requesting or overwriting them", async () => {
    const plan = planResources(
      [{ id: "one", filename: "one.pdf" }],
      { apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false },
    );
    const vault = new FakeAttachmentVault();
    vault.existing.add("attachments/one-one.pdf");
    const request = new FakeRequestPort(() => {
      throw new Error("should not request");
    });

    await expect(downloadMissingAttachments(plan.items, vault, request, "secret")).resolves.toEqual({
      downloaded: 0,
      diagnostics: [],
    });
    expect(request.calls).toEqual([]);
    expect(vault.writes).toEqual([]);
  });

  it("writes exact binary responses and continues after independent failures", async () => {
    const plan = planResources(
      [
        { id: "one", filename: "one.pdf" },
        { id: "two", filename: "two.pdf" },
      ],
      { apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false },
    );
    const bytes = new Uint8Array([0, 255, 42]).buffer;
    const request = new FakeRequestPort((_call, index) =>
      index === 0
        ? { status: 200, text: "", arrayBuffer: bytes }
        : { status: 500, text: "failed", arrayBuffer: undefined },
    );
    const vault = new FakeAttachmentVault();

    const result = await downloadMissingAttachments(plan.items, vault, request, "secret");

    expect(result.downloaded).toBe(1);
    expect(new Uint8Array(vault.writes[0]!.data)).toEqual(new Uint8Array([0, 255, 42]));
    expect(result.diagnostics).toHaveLength(1);
    expect(request.calls[0]).toMatchObject({
      headers: { Authorization: "Bearer secret" },
      responseType: "arrayBuffer",
    });
  });
});
