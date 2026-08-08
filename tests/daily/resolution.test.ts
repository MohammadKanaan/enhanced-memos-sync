import { describe, expect, it } from "vitest";

import { resolveDailyNotePaths, type DailyNotesPort } from "../../src/daily/resolution";

class FakeDailyNotes implements DailyNotesPort {
  readonly calls: Array<{ date: string; createIfMissing: boolean }> = [];

  isAvailable(): boolean { return true; }

  async listExisting(): Promise<Array<{ date: string; path: string }>> {
    return [];
  }

  async resolve(date: string, createIfMissing: boolean): Promise<string | undefined> {
    this.calls.push({ date, createIfMissing });
    return date === "2026-01-01" ? "daily/custom.md" : undefined;
  }

  async read(): Promise<string> {
    return "";
  }

  async write(): Promise<void> {}
}

describe("daily-note resolution", () => {
  it("uses the configured integration path and reports unavailable dates without a filename fallback", async () => {
    const port = new FakeDailyNotes();
    const result = await resolveDailyNotePaths(["2026-01-01", "2026-01-02"], port, false);

    expect(result.paths).toEqual(new Map([["2026-01-01", "daily/custom.md"]]));
    expect(port.calls).toEqual([
      { date: "2026-01-01", createIfMissing: false },
      { date: "2026-01-02", createIfMissing: false },
    ]);
    expect(result.diagnostics).toHaveLength(1);
  });
});
