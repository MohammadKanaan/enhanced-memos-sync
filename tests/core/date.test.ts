import { afterEach, describe, expect, it } from "vitest";

import {
  computeCutoffTimestamp,
  computeSyncThreshold,
  toCreatedAtIso,
  toLocalDate,
} from "../../src/core/date";

const originalTimezone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimezone;
});

describe("core dates", () => {
  it("uses local calendar dates while retaining UTC metadata", () => {
    process.env.TZ = "Asia/Beirut";
    const timestamp = Date.UTC(2025, 11, 31, 22, 30, 0) / 1_000;

    expect(toLocalDate(timestamp)).toBe("2026-01-01");
    expect(toCreatedAtIso(timestamp)).toBe("2025-12-31T22:30:00.000Z");
  });

  it("subtracts calendar days from local midnight across DST", () => {
    process.env.TZ = "America/New_York";
    const now = new Date(2026, 2, 9, 12, 0, 0);
    const expected = new Date(2026, 2, 8, 0, 0, 0).getTime() / 1_000;

    expect(computeCutoffTimestamp(now, 1)).toBe(expected);
    expect(computeCutoffTimestamp(now, 0)).toBe(0);
  });

  it("uses cursor and cutoff rules for incremental and full requests", () => {
    expect(computeSyncThreshold("incremental", 100, 200)).toBe(200);
    expect(computeSyncThreshold("incremental", 300, 200)).toBe(300);
    expect(computeSyncThreshold("full", 300, 200)).toBe(200);
  });
});
