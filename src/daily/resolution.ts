import type { SyncDiagnostic } from "../core/types";

export interface DailyNotesPort {
  listExisting(): Promise<Array<{ date: string; path: string }>>;
  resolve(date: string, createIfMissing: boolean): Promise<string | undefined>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

export async function resolveDailyNotePaths(
  dates: string[],
  port: DailyNotesPort,
  createIfMissing: boolean,
): Promise<{ paths: Map<string, string>; diagnostics: SyncDiagnostic[] }> {
  const paths = new Map<string, string>();
  const diagnostics: SyncDiagnostic[] = [];

  for (const date of dates) {
    const path = await port.resolve(date, createIfMissing);
    if (path) {
      paths.set(date, path);
    } else {
      diagnostics.push({
        severity: "error",
        stage: "daily-note",
        date,
        message: "Daily Notes integration could not resolve this date.",
      });
    }
  }

  return { paths, diagnostics };
}
