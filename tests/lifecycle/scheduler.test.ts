import { describe, expect, it } from "vitest";

import { SyncScheduler } from "../../src/lifecycle/scheduler";

describe("sync scheduler", () => {
  it("runs smart sync after layout and replaces periodic timers", () => {
    let layout!: () => void;
    const calls: string[] = [];
    const scheduler = new SyncScheduler({
      onLayoutReady: (callback) => { layout = callback; },
      setTimeout: (callback) => { calls.push("timeout"); callback(); return 1; },
      clearTimeout: () => calls.push("clear-timeout"),
      setInterval: () => { calls.push("interval"); return 2; },
      clearInterval: () => calls.push("clear-interval"),
      runSmart: () => calls.push("sync"),
      today: () => "2026-01-01",
    });

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: true, periodicSyncIntervalMinutes: 5 }, undefined);
    layout();
    scheduler.schedule({ syncOnStartup: false, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: false, periodicSyncIntervalMinutes: 0 }, undefined);

    expect(calls).toEqual(["timeout", "sync", "interval", "clear-timeout", "clear-interval"]);
  });
});
