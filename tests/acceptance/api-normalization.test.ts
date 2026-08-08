import { afterEach, describe, expect, it } from "vitest";

import { MemosApiError, MemosClient } from "../../src/api/memos-client";
import { computeSyncThreshold } from "../../src/core/date";
import { MAX_USER_ERROR_BODY_LENGTH } from "../../src/core/diagnostics";
import { normalizeRemoteMemos } from "../../src/memos/normalize";
import { FakeRequestPort } from "../support/fake-request-port";

const originalTimezone = process.env.TZ;
afterEach(() => { process.env.TZ = originalTimezone; });

describe("SPEC 10.3 API and normalization", () => {
  it("normalizes URL construction, sends auth headers and page size, and calculates full and incremental filters", async () => {
    const request = new FakeRequestPort(() => ({ status: 200, text: "", json: { memos: [] } }));
    await new MemosClient(request, "https://memos.example///", "token").list(computeSyncThreshold("incremental", 99, 50));
    expect(request.calls[0]).toMatchObject({
      url: "https://memos.example/api/v1/memos?pageSize=200&filter=created_ts+%3E+99",
      headers: { Authorization: "Bearer token", Accept: "application/json" },
    });
    expect(computeSyncThreshold("full", 99, 50)).toBe(50);
  });

  it("follows multiple opaque page tokens without truncation and rejects repeated tokens or the explicit page cap", async () => {
    const paged = new FakeRequestPort((_call, index) => ({
      status: 200, text: "", json: [
        { memos: [{ id: 1 }], nextPageToken: "opaque+/=" },
        { memos: [{ id: 2 }], nextPageToken: "second opaque?token" },
        { memos: [{ id: 3 }] },
      ][index]!,
    }));
    await expect(new MemosClient(paged, "https://memos.example", "token").list(0)).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(paged.calls[1]?.url).toContain("pageToken=opaque%2B%2F%3D");
    expect(paged.calls[2]?.url).toContain("pageToken=second+opaque%3Ftoken");

    const repeated = new FakeRequestPort(() => ({ status: 200, text: "", json: { memos: [], nextPageToken: "again" } }));
    await expect(new MemosClient(repeated, "https://memos.example", "token").list(0)).rejects.toThrow("repeated");
    const capped = new FakeRequestPort((_call, index) => ({ status: 200, text: "", json: { memos: [], nextPageToken: String(index) } }));
    await expect(new MemosClient(capped, "https://memos.example", "token").list(0)).rejects.toThrow("page limit");
    expect(capped.calls).toHaveLength(1_000);
  });

  it("normalizes every identity, timestamp, resource, and attachment fallback with local dates and UTC metadata", () => {
    process.env.TZ = "Asia/Beirut";
    const result = normalizeRemoteMemos([
      { uid: "memos/uid", content: "one", createdTs: 100, resourceList: [{ id: "resource" }] },
      { id: 2, content: "two", createTime: "2025-12-31T22:30:00.000Z", resources: [{ id: "fallback" }] },
      { name: "memos/name", content: "three", timestamp: 3, attachments: [{ id: "attachment" }] },
      { id: 4, content: "four", createdAt: "2026-01-03T03:04:05.000Z" },
    ]);
    expect(result.valid).toMatchObject([
      { id: "memos/uid", timestamp: 100, resources: [{ id: "resource" }] },
      { id: "2", localDate: "2026-01-01", createdAtIso: "2025-12-31T22:30:00.000Z", resources: [{ id: "fallback" }] },
      { id: "memos/name", timestamp: 3, resources: [{ id: "attachment" }] },
      { id: "4", timestamp: Math.floor(Date.parse("2026-01-03T03:04:05.000Z") / 1_000) },
    ]);
  });

  it("uses mandatory identity, timestamp, and resource precedence when competing fallback values are present", () => {
    const [memo] = normalizeRemoteMemos([{
      name: "  memos/name-wins  ",
      uid: "memos/uid-loses",
      id: "id-loses",
      content: "precedence",
      timestamp: 101,
      createdTs: 202,
      createTime: "2026-01-03T00:00:00.000Z",
      createdAt: "2026-01-04T00:00:00.000Z",
      attachments: [{ id: "attachment-wins" }],
      resourceList: [{ id: "resource-list-loses" }],
      resources: [{ id: "resources-loses" }],
    }]).valid;
    expect(memo).toMatchObject({
      id: "memos/name-wins",
      timestamp: 101,
      resources: [{ id: "attachment-wins" }],
    });
  });

  it("retains the HTTP status, bounds the response summary by the public limit, and redacts the active token", async () => {
    const body = "x".repeat(MAX_USER_ERROR_BODY_LENGTH + 50);
    const request = new FakeRequestPort(() => ({ status: 503, text: body }));
    const prefix = "Memos API returned HTTP 503.: ";
    try {
      await new MemosClient(request, "https://memos.example", "token").list(0);
      throw new Error("expected non-success response");
    } catch (error) {
      expect(error).toBeInstanceOf(MemosApiError);
      expect((error as Error).message).toBe(`${prefix}${body.slice(0, MAX_USER_ERROR_BODY_LENGTH)}`);
      expect((error as Error).message).toHaveLength(prefix.length + MAX_USER_ERROR_BODY_LENGTH);
    }

    const redacted = new FakeRequestPort(() => ({ status: 500, text: "active-token appears in this response" }));
    await expect(new MemosClient(redacted, "https://memos.example", "active-token").list(0)).rejects.toMatchObject({
      message: expect.not.stringContaining("active-token"),
    });
  });

  it("rejects malformed memos without any valid output and keeps bounded redacted transport causes", async () => {
    expect(normalizeRemoteMemos([{ id: "missing-content", timestamp: 1 }, { id: "zero", content: "x", timestamp: 0 }]).valid).toEqual([]);
    const cause = new Error(`transport token ${"body ".repeat(200)}`);
    const request = new FakeRequestPort(() => Promise.reject(cause));
    try {
      await new MemosClient(request, "https://memos.example", "token").list(0);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MemosApiError);
      expect((error as MemosApiError).cause).toBe(cause);
      expect((error as Error).message).not.toContain("token");
    }
  });
});
