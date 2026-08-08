import { describe, expect, it } from "vitest";

import { SyncCoordinator } from "../../src/sync/coordinator";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

describe("sync coordinator", () => {
  it("resolves smart modes, commits state only on complete runs, and rejects overlap", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const notices: string[] = [];
    const coordinator = new SyncCoordinator({
      settings: () => ({ ...DEFAULT_SETTINGS, apiUrl: "https://memos.example" }),
      state: () => ({ cursor: undefined, renderSnapshots: {} }),
      token: async () => "token",
      fetch: async () => { await gate; return [{ timestamp: 10 }]; },
      commit: async () => {},
      notice: (message) => notices.push(message),
      now: () => new Date(2026, 0, 1),
    });

    const first = coordinator.run("smart");
    await expect(coordinator.run("force")).resolves.toMatchObject({ complete: false });
    release();
    await expect(first).resolves.toMatchObject({ complete: true, effectiveMode: "full" });
    expect(notices.some((message) => message.includes("already running"))).toBe(true);
  });
});
