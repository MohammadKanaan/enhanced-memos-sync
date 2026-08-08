import { afterEach, describe, expect, it } from "vitest";

import { normalizeRemoteMemos } from "../../src/memos/normalize";

const originalTimezone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimezone;
});

describe("remote memo normalization", () => {
  it("uses identity, numeric timestamp, and resource precedence without mutating input", () => {
    process.env.TZ = "UTC";
    const remote = {
      name: "",
      uid: "memos/uid",
      id: 7,
      content: "",
      timestamp: 100,
      createdTs: 200,
      attachments: [{ id: "attachment" }],
      resourceList: [{ id: "resource-list" }],
      resources: [{ id: "resources" }],
      parent: "  parent-id  ",
    };
    const original = structuredClone(remote);

    const result = normalizeRemoteMemos([remote]);

    expect(result.valid).toMatchObject([
      {
        id: "memos/uid",
        content: "",
        timestamp: 100,
        localDate: "1970-01-01",
        createdAtIso: "1970-01-01T00:01:40.000Z",
        resources: [{ id: "attachment" }],
        parent: "parent-id",
      },
    ]);
    expect(remote).toEqual(original);
  });

  it("falls back through id, createdTs, createTime, and createdAt in order", () => {
    process.env.TZ = "UTC";
    const createTime = "2026-01-02T03:04:05.900Z";
    const createdAt = "2026-01-03T03:04:05.000Z";

    const result = normalizeRemoteMemos([
      { id: 9, content: "created ts", createdTs: 200 },
      { id: "10", content: "create time", createTime, createdAt },
      { id: "11", content: "created at", createTime: "nope", createdAt },
    ]);

    expect(result.valid.map((memo) => [memo.id, memo.timestamp])).toEqual([
      ["9", 200],
      ["10", Math.floor(Date.parse(createTime) / 1_000)],
      ["11", Math.floor(Date.parse(createdAt) / 1_000)],
    ]);
  });

  it("keeps valid records but reports invalid identity, content, and timestamps", () => {
    const result = normalizeRemoteMemos([
      { id: "valid", content: "ok", timestamp: 1 },
      { content: "missing identity", timestamp: 2 },
      { id: "missing-content", timestamp: 3 },
      { id: "zero", content: "x", timestamp: 0 },
      { id: "fraction", content: "x", timestamp: 1.5 },
      { id: "invalid-date", content: "x", createTime: "never" },
    ]);

    expect(result.valid.map((memo) => memo.id)).toEqual(["valid"]);
    expect(result.diagnostics).toHaveLength(5);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", stage: "normalize" }),
      ]),
    );
  });

  it("uses local dates independently from UTC creation metadata", () => {
    process.env.TZ = "Asia/Beirut";
    const timestamp = Date.UTC(2025, 11, 31, 22, 30, 0) / 1_000;

    const [memo] = normalizeRemoteMemos([{ id: "one", content: "x", timestamp }]).valid;

    expect(memo).toMatchObject({
      localDate: "2026-01-01",
      createdAtIso: "2025-12-31T22:30:00.000Z",
    });
  });

  it("rejects every record sharing an output basename", () => {
    process.env.TZ = "UTC";
    const result = normalizeRemoteMemos([
      { id: "one", content: "x", timestamp: 100 },
      { id: "two", content: "y", timestamp: 100 },
    ]);

    expect(result.valid).toEqual([]);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every((diagnostic) => diagnostic.message.includes("collision"))).toBe(
      true,
    );
  });
});
