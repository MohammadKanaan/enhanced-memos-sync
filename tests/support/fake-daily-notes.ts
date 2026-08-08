import type { DailyNotesPort } from "../../src/daily/resolution";

export class FakeDailyNotes implements DailyNotesPort {
  readonly notes = new Map<string, { date: string; content: string }>();
  readonly resolves: Array<{ date: string; createIfMissing: boolean }> = [];
  failDates = new Set<string>();
  listError?: Error;

  seed(date: string, path: string, content = ""): void {
    this.notes.set(path, { date, content });
  }

  async listExisting(): Promise<Array<{ date: string; path: string }>> {
    if (this.listError) throw this.listError;
    return [...this.notes].map(([path, note]) => ({ date: note.date, path }));
  }

  async resolve(date: string, createIfMissing: boolean): Promise<string | undefined> {
    this.resolves.push({ date, createIfMissing });
    if (this.failDates.has(date)) throw new Error(`daily failure: ${date}`);
    const existing = [...this.notes].find(([, note]) => note.date === date);
    if (existing) return existing[0];
    if (!createIfMissing) return undefined;
    const path = `daily/${date}.md`;
    this.seed(date, path);
    return path;
  }

  async read(path: string): Promise<string> {
    const note = this.notes.get(path);
    if (!note) throw new Error(`missing daily note: ${path}`);
    return note.content;
  }

  async write(path: string, content: string): Promise<void> {
    const note = this.notes.get(path);
    if (!note) throw new Error(`missing daily note: ${path}`);
    if (this.failDates.has(note.date)) throw new Error(`daily failure: ${note.date}`);
    note.content = content;
  }
}
