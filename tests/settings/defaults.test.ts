import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, DEFAULT_STATE } from "../../src/settings/defaults";

describe("settings defaults", () => {
  it("uses every specified single-account default", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      accountName: "Default",
      enabled: true,
      apiUrl: "",
      dailyNoteHeader: "## 📓 Memos",
      syncDaysLimit: 30,
      memoNoteFolder: "Memos",
      attachmentFolder: "attachments",
      createMissingDailyNotes: true,
      skipImages: false,
      mergeCommentsIntoParent: false,
      commentOrderRegex: "-- (\\d+)/(\\d+) --",
      syncOnStartup: false,
      startupDelaySeconds: 5,
      skipStartupSyncIfSyncedToday: true,
      periodicSyncIntervalMinutes: 0,
    });
    expect(DEFAULT_STATE).toEqual({ renderSnapshots: {} });
  });
});
