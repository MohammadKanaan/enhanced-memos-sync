import { describe, expect, it } from "vitest";

import { buildSyncPlan } from "../../src/sync/plan";
import type { MemoThread } from "../../src/threads/associate";

const threads = [
  {
    parent: { id: "parent", localDate: "2026-01-02", timestamp: 20, resources: [], content: "", createdAtIso: "", source: { content: "" } },
    comments: [{ id: "reply", localDate: "2026-01-01", timestamp: 10, resources: [], content: "", createdAtIso: "", source: { content: "" } }],
  },
] as MemoThread[];

const resourceOptions = { apiUrl: "https://memos.example", attachmentFolder: "attachments", skipImages: false };

describe("sync plan", () => {
  it("emits parent outputs only and expands full daily dates from existing notes", () => {
    const plan = buildSyncPlan({
      threads,
      memoFolder: "Memos",
      mode: "full",
      existingDailyDates: ["2025-12-31", "2026-01-01", "2026-01-03"],
      cutoffDate: "2026-01-01",
      today: "2026-01-02",
      resourceOptions,
    });

    expect(plan.outputs.map((output) => output.path)).toEqual(["Memos/2026-01-02-20.md"]);
    expect(plan.authoritativeByDate).toEqual(new Map([["2026-01-02", ["2026-01-02-20"]]]));
    expect(plan.dailyDates).toEqual(new Set(["2026-01-01", "2026-01-02"]));
    expect(plan.staleCandidatePaths).toContain("Memos/2026-01-01-10.md");
    expect(plan.snapshotCandidates).toEqual([
      { memoId: "parent", notePath: "Memos/2026-01-02-20.md", segmentIds: ["parent", "reply"] },
    ]);
  });

  it("keeps incremental daily reconciliation limited to newly produced dates", () => {
    const plan = buildSyncPlan({
      threads,
      memoFolder: "Memos",
      mode: "incremental",
      existingDailyDates: ["2026-01-01"],
      cutoffDate: "2026-01-01",
      today: "2026-01-02",
      resourceOptions,
    });

    expect(plan.dailyDates).toEqual(new Set(["2026-01-02"]));
    expect(plan.staleCandidatePaths).toEqual([]);
  });

  it("includes every configured daily note for an unlimited full window and unions remote output dates", () => {
    const plan = buildSyncPlan({
      threads,
      memoFolder: " /Memos/ ",
      mode: "full",
      existingDailyDates: ["2025-12-31", "2026-01-03"],
      today: "2026-01-02",
      resourceOptions,
    });

    expect(plan.dailyDates).toEqual(new Set(["2025-12-31", "2026-01-02", "2026-01-03"]));
    expect(plan.outputs[0]?.path).toBe("Memos/2026-01-02-20.md");
  });

  it("plans every thread resource and all existing force candidates, while protecting current outputs", () => {
    const plan = buildSyncPlan({
      threads: [{
        ...threads[0]!,
        parent: {
          ...threads[0]!.parent,
          resources: [{ id: "parent-file", filename: "parent.pdf" }],
        },
        comments: [{
          ...threads[0]!.comments[0]!,
          resources: [{ id: "reply-file", filename: "reply.pdf" }],
        }],
      }],
      memoFolder: "Memos",
      mode: "full",
      existingDailyDates: [],
      existingMemoNotePaths: [
        "Memos/2026-01-02-20.md",
        "Memos/2026-01-01-11.md",
        "Memos/nested/2026-01-01-10.md",
        "Memos/2026-01-01-12.png",
        "Memos/../Memos/2026-01-01-13.md",
        "Memos/2025-12-30-5.md",
      ],
      cutoffDate: "2026-01-01",
      today: "2026-01-02",
      resourceOptions,
    });

    expect(plan.resourceIntents.map(({ memoId, resource }) => [memoId, resource.path])).toEqual([
      ["parent", "attachments/parent-file-parent.pdf"],
      ["reply", "attachments/reply-file-reply.pdf"],
    ]);
    expect(plan.staleCandidatePaths).toEqual([
      "Memos/2026-01-01-10.md",
      "Memos/2026-01-01-11.md",
    ]);
  });

  it("does not mark standalone replies stale after thread merging is disabled", () => {
    const plan = buildSyncPlan({
      threads: [
        { parent: threads[0]!.parent, comments: [] },
        { parent: threads[0]!.comments[0]!, comments: [] },
      ],
      memoFolder: "Memos",
      mode: "full",
      existingDailyDates: [],
      existingMemoNotePaths: ["Memos/2026-01-01-10.md"],
      today: "2026-01-02",
      resourceOptions,
    });

    expect(plan.authoritativePaths).toContain("Memos/2026-01-01-10.md");
    expect(plan.staleCandidatePaths).toEqual([]);
  });

  it("deep-copies and freezes planned threads before caller-owned data can change", () => {
    const source = [{
      parent: {
        ...threads[0]!.parent,
        content: "before",
        resources: [{ id: "file", filename: "before.pdf" }],
        source: { content: "before", attachments: [{ id: "file", filename: "before.pdf" }] },
      },
      comments: [],
    }] as MemoThread[];
    const plan = buildSyncPlan({
      threads: source,
      memoFolder: "Memos",
      mode: "full",
      existingDailyDates: [],
      today: "2026-01-02",
      resourceOptions,
    });

    source[0]!.parent.content = "after";
    source[0]!.parent.resources[0]!.filename = "after.pdf";
    source[0]!.parent.source.attachments![0]!.filename = "after.pdf";

    expect(plan.outputs[0]!.thread.parent.content).toBe("before");
    expect(plan.outputs[0]!.thread.parent.resources[0]!.filename).toBe("before.pdf");
    expect(plan.outputs[0]!.thread.parent.source.attachments![0]!.filename).toBe("before.pdf");
    expect(Object.isFrozen(plan.outputs[0]!.thread.parent.resources)).toBe(true);
    expect(Object.isFrozen(plan.outputs[0]!.thread.parent.source.attachments)).toBe(true);
  });
});
