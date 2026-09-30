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
  getAbstractFileByPath(path: string): unknown;
  process(file: DailyNoteFile, update: (content: string) => string): Promise<string>;
}

export interface DailyNotesApi {
  isAvailable(): boolean;
  date(value: string): DateValue;
  getAllDailyNotes(): Record<string, DailyNoteFile>;
  getDateFromFile(file: DailyNoteFile, granularity: "day"): DateValue | null;
  getDailyNote(date: DateValue, notes: Record<string, DailyNoteFile>): DailyNoteFile | undefined;
  /** The library reports creation failures with a notice and resolves undefined. */
  createDailyNote(date: DateValue): Promise<DailyNoteFile | undefined>;
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
    // Failures propagate so the caller reports them instead of mistaking them for a missing note.
    const requested = this.api.date(date);
    const existing = this.api.getDailyNote(requested, this.api.getAllDailyNotes());
    if (existing) return normalizeVaultPath(existing.path);
    if (!createIfMissing) return undefined;
    const created = await this.api.createDailyNote(requested);
    if (!created) throw new Error(`Daily Notes could not create the note for ${date}.`);
    return normalizeVaultPath(created.path);
  }

  async update(path: string, transform: (content: string) => string): Promise<boolean> {
    let changed = false;
    let transformed = false;
    await this.vault.process(this.requiredFile(path), (current) => {
      transformed = true;
      const next = transform(current);
      changed = next !== current;
      return changed ? next : current;
    });
    // Callers read results captured by the transform, so a host that skipped or deferred it must fail loudly.
    if (!transformed) throw new Error(`Daily note update did not run: ${normalizeVaultPath(path)}.`);
    return changed;
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
