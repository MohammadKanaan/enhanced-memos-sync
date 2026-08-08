import { moment, normalizePath } from "obsidian";
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDateFromFile,
  getDailyNote,
} from "obsidian-daily-notes-interface";

import type { DailyNotesPort } from "../daily/resolution";

interface DailyNoteFile {
  path: string;
  extension: string;
}

interface DateValue {
  format(pattern: string): string;
}

interface DailyNotesVault {
  getAbstractFileByPath(path: string): unknown | null;
  read(file: DailyNoteFile): Promise<string>;
  modify(file: DailyNoteFile, content: string): Promise<void>;
}

export interface DailyNotesApi {
  isAvailable(): boolean;
  date(value: string): DateValue;
  getAllDailyNotes(): Record<string, DailyNoteFile>;
  getDateFromFile(file: DailyNoteFile, granularity: "day"): DateValue | null;
  getDailyNote(date: DateValue, notes: Record<string, DailyNoteFile>): DailyNoteFile | undefined;
  createDailyNote(date: DateValue): Promise<DailyNoteFile>;
}

const defaultApi: DailyNotesApi = {
  isAvailable: appHasDailyNotesPluginLoaded,
  date: moment,
  getAllDailyNotes,
  getDateFromFile,
  getDailyNote,
  createDailyNote,
};

/** Resolves configured Daily Notes without assuming any path or filename format. */
export class ObsidianDailyNotesAdapter implements DailyNotesPort {
  constructor(
    private readonly vault: DailyNotesVault,
    private readonly api: DailyNotesApi = defaultApi,
  ) {}

  isAvailable(): boolean {
    return this.api.isAvailable();
  }

  async listExisting(): Promise<Array<{ date: string; path: string }>> {
    if (!this.isAvailable()) return [];
    return Object.values(this.api.getAllDailyNotes()).flatMap((file) => {
      const date = this.api.getDateFromFile(file, "day");
      return date ? [{ date: date.format("YYYY-MM-DD"), path: normalizeVaultPath(file.path) }] : [];
    });
  }

  async resolve(date: string, createIfMissing: boolean): Promise<string | undefined> {
    if (!this.isAvailable()) return undefined;
    try {
      const requested = this.api.date(date);
      const existing = this.api.getDailyNote(requested, this.api.getAllDailyNotes());
      if (existing) return normalizeVaultPath(existing.path);
      if (!createIfMissing) return undefined;
      return normalizeVaultPath((await this.api.createDailyNote(requested)).path);
    } catch {
      // The caller turns an unresolved date into a visible partial-sync diagnostic.
      return undefined;
    }
  }

  async read(path: string): Promise<string> {
    return this.vault.read(this.requiredFile(path));
  }

  async write(path: string, content: string): Promise<void> {
    await this.vault.modify(this.requiredFile(path), content);
  }

  private requiredFile(path: string): DailyNoteFile {
    const normalized = normalizeVaultPath(path);
    const file = this.vault.getAbstractFileByPath(normalized);
    if (!isDailyNoteFile(file)) throw new Error(`Daily note file was not found: ${normalized}.`);
    return file;
  }
}

function isDailyNoteFile(value: unknown): value is DailyNoteFile {
  return typeof value === "object" && value !== null && "path" in value && "extension" in value;
}

function normalizeVaultPath(path: string): string {
  return normalizePath(path).replace(/^\/+|\/+$/g, "");
}
