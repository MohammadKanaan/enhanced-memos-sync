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
      runSmart: () => { calls.push("sync"); },
      today: () => "2026-01-01",
    });

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: true, periodicSyncIntervalMinutes: 5 }, undefined);
    layout();
    scheduler.schedule({ syncOnStartup: false, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: false, periodicSyncIntervalMinutes: 0 }, undefined);

    expect(calls).toEqual(["sync", "interval", "clear-interval"]);
  });

  it("runs a zero-delay startup sync directly after layout and skips a successful local day", () => {
    let layout!: () => void;
    let delayed = 0;
    let syncs = 0;
    const scheduler = new SyncScheduler({
      onLayoutReady: (callback) => { layout = callback; },
      setTimeout: () => { delayed += 1; return 1; },
      clearTimeout: () => {},
      setInterval: () => 2,
      clearInterval: () => {},
      runSmart: () => { syncs += 1; },
      today: () => "2026-01-01",
    });

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: false, periodicSyncIntervalMinutes: 0 }, undefined);
    layout();
    expect({ delayed, syncs }).toEqual({ delayed: 0, syncs: 1 });

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 0, skipStartupSyncIfSyncedToday: true, periodicSyncIntervalMinutes: 0 }, "2026-01-01");
    layout();
    expect(syncs).toBe(1);
  });

  it("reschedules only the periodic timer after layout and clears every timer on unload", () => {
    let layout!: () => void;
    const calls: string[] = [];
    const scheduler = new SyncScheduler({
      onLayoutReady: (callback) => { layout = callback; },
      setTimeout: () => 1,
      clearTimeout: (id) => calls.push(`timeout:${id}`),
      setInterval: (_callback, milliseconds) => { calls.push(`interval:${milliseconds}`); return milliseconds; },
      clearInterval: (id) => calls.push(`interval-clear:${id}`),
      runSmart: () => {},
      today: () => "2026-01-01",
    });

    scheduler.schedule({ syncOnStartup: false, startupDelaySeconds: 5, skipStartupSyncIfSyncedToday: true, periodicSyncIntervalMinutes: 5 }, undefined);
    layout();
    scheduler.reschedulePeriodic(10);
    scheduler.reschedulePeriodic(0);
    scheduler.clear();

    expect(calls).toEqual(["interval:300000", "interval-clear:300000", "interval:600000", "interval-clear:600000"]);
  });

  it("fires positive startup delays only when due and clears a pending startup timeout on unload", () => {
    let layout!: () => void;
    let timer!: () => void;
    const calls: string[] = [];
    const scheduler = new SyncScheduler({
      onLayoutReady: (callback) => { layout = callback; },
      setTimeout: (callback, milliseconds) => { timer = callback; calls.push(`timeout:${milliseconds}`); return 42; },
      clearTimeout: (id) => calls.push(`timeout-clear:${id}`),
      setInterval: () => 1,
      clearInterval: () => {},
      runSmart: () => { calls.push("sync"); },
      today: () => "2026-01-01",
    });

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 3, skipStartupSyncIfSyncedToday: false, periodicSyncIntervalMinutes: 0 }, undefined);
    layout();
    expect(calls).toEqual(["timeout:3000"]);
    timer();
    expect(calls).toEqual(["timeout:3000", "sync"]);

    scheduler.schedule({ syncOnStartup: true, startupDelaySeconds: 3, skipStartupSyncIfSyncedToday: false, periodicSyncIntervalMinutes: 0 }, undefined);
    layout();
    scheduler.clear();
    expect(calls).toEqual(["timeout:3000", "sync", "timeout:3000", "timeout-clear:42"]);
  });
});
