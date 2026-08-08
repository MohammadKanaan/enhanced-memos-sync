import type { VaultPort } from "../../src/sync/ports";

export class InMemoryVault implements VaultPort {
  readonly text = new Map<string, string>();
  readonly binary = new Map<string, ArrayBuffer>();
  readonly folders = new Set<string>();
  readonly trashed: string[] = [];
  failWritesFor = new Set<string>();
  failTrashesFor = new Set<string>();

  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.text.has(path) || this.binary.has(path);
  }

  async readText(path: string): Promise<string | undefined> {
    return this.text.get(path);
  }

  async writeText(path: string, content: string): Promise<"created" | "updated" | "unchanged"> {
    if (this.failWritesFor.has(path)) throw new Error(`write failed: ${path}`);
    const before = this.text.get(path);
    this.text.set(path, content);
    return before === undefined ? "created" : before === content ? "unchanged" : "updated";
  }

  async writeBinaryIfAbsent(path: string, data: ArrayBuffer): Promise<"created" | "existing"> {
    if (await this.exists(path)) return "existing";
    this.binary.set(path, data);
    return "created";
  }

  async listMarkdownFiles(folder: string): Promise<string[]> {
    const prefix = `${folder.replace(/\/+$/, "")}/`;
    return [...this.text.keys()].filter((path) => path.startsWith(prefix) && path.endsWith(".md"));
  }

  async trash(path: string): Promise<void> {
    if (this.failTrashesFor.has(path)) throw new Error(`trash failed: ${path}`);
    if (!this.text.has(path)) throw new Error(`missing: ${path}`);
    this.text.delete(path);
    this.trashed.push(path);
  }
}
