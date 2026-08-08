import { describe, expect, it } from "vitest";

import { ObsidianDailyNotesAdapter } from "../../src/obsidian/daily-notes-adapter";

describe("Obsidian Daily Notes adapter", () => {
  it("does not infer a filename or create a note when the Daily Notes integration is disabled", async () => {
    let getAllCalls = 0;
    let createCalls = 0;
    const adapter = new ObsidianDailyNotesAdapter(
      {
        getAbstractFileByPath: () => null,
        read: async () => "",
        modify: async () => {},
      },
      {
        isAvailable: () => false,
        date: (value) => ({ format: () => value }),
        getAllDailyNotes: () => {
          getAllCalls += 1;
          return {};
        },
        getDateFromFile: () => null,
        getDailyNote: () => undefined,
        createDailyNote: async () => {
          createCalls += 1;
          return { path: "2026-08-08.md", extension: "md" };
        },
      },
    );

    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.listExisting()).resolves.toEqual([]);
    await expect(adapter.resolve("2026-08-08", true)).resolves.toBeUndefined();
    expect(getAllCalls).toBe(0);
    expect(createCalls).toBe(0);
  });

  it("uses configured daily-note records and date parsing instead of inferring YYYY-MM-DD filenames", async () => {
    const existing = { path: "Journal/August 8th.md", extension: "md" };
    const adapter = new ObsidianDailyNotesAdapter(
      {
        getAbstractFileByPath: (path) => path === existing.path ? existing : null,
        read: async () => "existing daily note",
        modify: async () => {},
      },
      {
        isAvailable: () => true,
        date: (value) => ({ value, format: () => value }),
        getAllDailyNotes: () => ({ configured: existing }),
        getDateFromFile: (file) => file.path === existing.path ? { format: () => "2026-08-08" } : null,
        getDailyNote: (_date, records) => records.configured,
        createDailyNote: async () => { throw new Error("should not create"); },
      },
    );

    await expect(adapter.listExisting()).resolves.toEqual([{ date: "2026-08-08", path: "Journal/August 8th.md" }]);
    await expect(adapter.resolve("2026-08-08", false)).resolves.toBe("Journal/August 8th.md");
    await expect(adapter.read(existing.path)).resolves.toBe("existing daily note");
  });

  it("creates through Daily Notes only when permitted and returns undefined when the integration cannot resolve a date", async () => {
    let createCalls = 0;
    let written = "";
    const adapter = new ObsidianDailyNotesAdapter(
      {
        getAbstractFileByPath: (path) => path === "Journal/new.md" ? { path, extension: "md" } : null,
        read: async () => "",
        modify: async (_file, content) => { written = content; },
      },
      {
        isAvailable: () => true,
        date: (value) => ({ value, format: () => value }),
        getAllDailyNotes: () => ({}),
        getDateFromFile: () => null,
        getDailyNote: () => undefined,
        createDailyNote: async () => {
          createCalls += 1;
          return { path: "Journal/new.md", extension: "md" };
        },
      },
    );

    await expect(adapter.resolve("2026-08-08", false)).resolves.toBeUndefined();
    await expect(adapter.resolve("2026-08-08", true)).resolves.toBe("Journal/new.md");
    await adapter.write("/Journal/new.md/", "updated");
    expect(createCalls).toBe(1);
    expect(written).toBe("updated");
  });
});
