import { describe, expect, it } from "vitest";

import { ObsidianVaultAdapter } from "../../src/obsidian/vault-adapter";

describe("Obsidian vault adapter", () => {
  it("normalizes paths, creates nested folders, and rejects a file in the folder path", async () => {
    const createdFolders: string[] = [];
    const adapter = new ObsidianVaultAdapter({
      vault: {
        getAbstractFileByPath: (path) => path === "Memos/blocked" ? { path, extension: "md" } : null,
        createFolder: async (path) => void createdFolders.push(path),
        create: async () => ({ path: "unused" }),
        createBinary: async () => ({ path: "unused" }),
        process: async (_file, mutate) => mutate(""),
        read: async () => "",
        getMarkdownFiles: () => [],
      },
      fileManager: { trashFile: async () => {} },
    });

    await adapter.ensureFolder(" /Memos//nested/ ");
    expect(createdFolders).toEqual(["Memos", "Memos/nested"]);
    await expect(adapter.ensureFolder("Memos/blocked/child")).rejects.toThrow("Memos/blocked is a file");
  });

  it("uses Vault.create for missing text and Vault.process for existing text without rewriting identical bytes", async () => {
    const calls: string[] = [];
    const existing = { path: "Memos/note.md", extension: "md" };
    const adapter = new ObsidianVaultAdapter({
      vault: {
        getAbstractFileByPath: (path) => path === existing.path ? existing : null,
        createFolder: async () => ({ path: "unused" }),
        create: async (path, content) => {
          calls.push(`create:${path}:${content}`);
          return { path, extension: "md" };
        },
        createBinary: async () => ({ path: "unused" }),
        process: async (file, mutate) => {
          calls.push(`process:${file.path}`);
          return mutate("same");
        },
        read: async () => "same",
        getMarkdownFiles: () => [],
      },
      fileManager: { trashFile: async () => {} },
    });

    await expect(adapter.writeText("/Memos/new.md/", "new")).resolves.toBe("created");
    await expect(adapter.writeText(existing.path, "same")).resolves.toBe("unchanged");
    await expect(adapter.writeText(existing.path, "changed")).resolves.toBe("updated");
    expect(calls).toEqual([
      "create:Memos/new.md:new",
      "process:Memos/note.md",
      "process:Memos/note.md",
    ]);
  });

  it("never overwrites binary files, lists normalized markdown folder paths, and trashes through FileManager", async () => {
    const existing = { path: "attachments/existing.bin", extension: "bin" };
    const trashed: string[] = [];
    const binaries: string[] = [];
    const adapter = new ObsidianVaultAdapter({
      vault: {
        getAbstractFileByPath: (path) => {
          if (path === existing.path) return existing;
          return path === "Memos/a.md" ? { path, extension: "md" } : null;
        },
        createFolder: async () => ({ path: "unused" }),
        create: async () => ({ path: "unused" }),
        createBinary: async (path) => {
          binaries.push(path);
          return { path };
        },
        process: async (_file, mutate) => mutate(""),
        read: async () => "",
        getMarkdownFiles: () => [
          { path: "Memos/a.md", extension: "md" },
          { path: "Memos/nested/b.md", extension: "md" },
          { path: "Elsewhere/c.md", extension: "md" },
        ],
      },
      fileManager: { trashFile: async (file) => void trashed.push(file.path) },
    });

    await expect(adapter.writeBinaryIfAbsent("attachments/existing.bin", new ArrayBuffer(0))).resolves.toBe("existing");
    await expect(adapter.writeBinaryIfAbsent("/attachments/new.bin/", new ArrayBuffer(0))).resolves.toBe("created");
    await expect(adapter.listMarkdownFiles(" /Memos/ ")).resolves.toEqual(["Memos/a.md", "Memos/nested/b.md"]);
    await adapter.trash("/Memos/a.md/");
    expect(binaries).toEqual(["attachments/new.bin"]);
    expect(trashed).toEqual(["Memos/a.md"]);
  });

  it("rejects a binary path that collides with a folder", async () => {
    const adapter = new ObsidianVaultAdapter({
      vault: {
        getAbstractFileByPath: (path) => path === "attachments/collision" ? { path } : null,
        createFolder: async () => ({ path: "unused" }),
        create: async () => ({ path: "unused" }),
        createBinary: async () => ({ path: "unused" }),
        process: async (_file, mutate) => mutate(""),
        read: async () => "",
        getMarkdownFiles: () => [],
      },
      fileManager: { trashFile: async () => {} },
    });

    await expect(adapter.writeBinaryIfAbsent("attachments/collision", new ArrayBuffer(0)))
      .rejects.toThrow("Expected a file at attachments/collision, but found a folder");
  });
});
