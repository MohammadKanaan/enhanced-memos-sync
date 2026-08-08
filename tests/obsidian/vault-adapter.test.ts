import { describe, expect, it } from "vitest";

import { ObsidianVaultAdapter } from "../../src/obsidian/vault-adapter";

describe("Obsidian vault adapter", () => {
  it("creates nested folders, avoids unchanged text rewrites, and never overwrites binary files", async () => {
    const files = new Map<string, string>();
    const binaries = new Set<string>();
    const folders = new Set<string>();
    const adapter = new ObsidianVaultAdapter({
      exists: async (path) => files.has(path) || binaries.has(path) || folders.has(path),
      isFile: async (path) => files.has(path) || binaries.has(path),
      createFolder: async (path) => void folders.add(path),
      readText: async (path) => files.get(path),
      writeText: async (path, content) => void files.set(path, content),
      writeBinary: async (path) => void binaries.add(path),
      listMarkdownFiles: async () => [],
      trash: async (path) => void files.delete(path),
    });

    await adapter.ensureFolder("Memos/nested");
    expect(folders).toEqual(new Set(["Memos", "Memos/nested"]));
    await expect(adapter.writeText("Memos/nested/note.md", "first")).resolves.toBe("created");
    await expect(adapter.writeText("Memos/nested/note.md", "first")).resolves.toBe("unchanged");
    await expect(adapter.writeBinaryIfAbsent("attachments/a.bin", new ArrayBuffer(0))).resolves.toBe("created");
    await expect(adapter.writeBinaryIfAbsent("attachments/a.bin", new ArrayBuffer(0))).resolves.toBe("existing");
  });
});
