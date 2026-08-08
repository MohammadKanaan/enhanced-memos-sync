import type { VaultPort } from "../sync/ports";

export interface VaultHost {
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  createFolder(path: string): Promise<void>;
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  listMarkdownFiles(folder: string): Promise<string[]>;
  trash(path: string): Promise<void>;
}

export class ObsidianVaultAdapter implements VaultPort {
  constructor(private readonly host: VaultHost) {}

  async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      const current = parts.slice(0, index).join("/");
      if (await this.host.exists(current)) {
        if (await this.host.isFile(current)) throw new Error(`Cannot create folder: ${current} is a file.`);
      } else await this.host.createFolder(current);
    }
  }

  exists(path: string): Promise<boolean> { return this.host.exists(path); }
  readText(path: string): Promise<string | undefined> { return this.host.readText(path); }
  async writeText(path: string, content: string): Promise<"created" | "updated" | "unchanged"> {
    const existing = await this.host.readText(path);
    if (existing === content) return "unchanged";
    await this.host.writeText(path, content);
    return existing === undefined ? "created" : "updated";
  }
  async writeBinaryIfAbsent(path: string, data: ArrayBuffer): Promise<"created" | "existing"> {
    if (await this.host.exists(path)) return "existing";
    await this.host.writeBinary(path, data);
    return "created";
  }
  listMarkdownFiles(folder: string): Promise<string[]> { return this.host.listMarkdownFiles(folder); }
  trash(path: string): Promise<void> { return this.host.trash(path); }
}
