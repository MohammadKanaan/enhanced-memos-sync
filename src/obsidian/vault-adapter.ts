import { normalizePath } from "obsidian";

import type { VaultPort } from "../sync/ports";

interface VaultFile {
  path: string;
  extension: string;
}

interface VaultHost {
  getAbstractFileByPath(path: string): unknown | null;
  createFolder(path: string): Promise<unknown>;
  create(path: string, content: string): Promise<unknown>;
  createBinary(path: string, data: ArrayBuffer): Promise<unknown>;
  read(file: VaultFile): Promise<string>;
  process(file: VaultFile, update: (content: string) => string): Promise<string>;
  getMarkdownFiles(): VaultFile[];
}

interface FileManagerHost {
  trashFile(file: VaultFile): Promise<void>;
}

export interface ObsidianVaultHost {
  vault: VaultHost;
  fileManager: FileManagerHost;
}

/** Bridges the narrow sync vault port to Obsidian's safe file APIs. */
export class ObsidianVaultAdapter implements VaultPort {
  constructor(private readonly host: ObsidianVaultHost) {}

  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizeVaultPath(path);
    if (!normalized) return;

    const segments = normalized.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const folderPath = segments.slice(0, index).join("/");
      const existing = this.host.vault.getAbstractFileByPath(folderPath);
      if (!existing) {
        await this.host.vault.createFolder(folderPath);
      } else if (isVaultFile(existing)) {
        throw new Error(`Cannot create folder: ${folderPath} is a file.`);
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.host.vault.getAbstractFileByPath(normalizeVaultPath(path)) !== null;
  }

  async readText(path: string): Promise<string | undefined> {
    const file = this.fileAt(path);
    return file ? this.host.vault.read(file) : undefined;
  }

  async writeText(path: string, content: string): Promise<"created" | "updated" | "unchanged"> {
    const normalized = normalizeVaultPath(path);
    const existing = this.fileAt(normalized);
    if (!existing) {
      await this.host.vault.create(normalized, content);
      return "created";
    }

    let changed = false;
    await this.host.vault.process(existing, (current) => {
      changed = current !== content;
      return changed ? content : current;
    });
    return changed ? "updated" : "unchanged";
  }

  async writeBinaryIfAbsent(path: string, data: ArrayBuffer): Promise<"created" | "existing"> {
    const normalized = normalizeVaultPath(path);
    const existing = this.host.vault.getAbstractFileByPath(normalized);
    if (existing) {
      if (!isVaultFile(existing)) {
        throw new Error(`Expected a file at ${normalized}, but found a folder.`);
      }
      return "existing";
    }
    await this.host.vault.createBinary(normalized, data);
    return "created";
  }

  async listMarkdownFiles(folder: string): Promise<string[]> {
    const normalizedFolder = normalizeVaultPath(folder);
    const prefix = normalizedFolder ? `${normalizedFolder}/` : "";
    return this.host.vault
      .getMarkdownFiles()
      .map((file) => normalizeVaultPath(file.path))
      .filter((path) => path.startsWith(prefix));
  }

  async trash(path: string): Promise<void> {
    const file = this.fileAt(path);
    if (!file) throw new Error(`Cannot trash missing file: ${normalizeVaultPath(path)}.`);
    await this.host.fileManager.trashFile(file);
  }

  private fileAt(path: string): VaultFile | undefined {
    const existing = this.host.vault.getAbstractFileByPath(normalizeVaultPath(path));
    if (!existing) return undefined;
    if (!isVaultFile(existing)) {
      throw new Error(`Expected a file at ${normalizeVaultPath(path)}, but found a folder.`);
    }
    return existing;
  }
}

function isVaultFile(value: unknown): value is VaultFile {
  return typeof value === "object" && value !== null && "path" in value && "extension" in value;
}

function normalizeVaultPath(path: string): string {
  return normalizePath(path).replace(/^\/+|\/+$/g, "");
}
