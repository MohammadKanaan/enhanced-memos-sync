import { describe, expect, it } from "vitest";

import { MemosApiError, MemosClient } from "../../src/api/memos-client";
import { FakeRequestPort } from "../support/fake-request-port";

const memo = {
  name: "memos/1",
  content: "First",
  timestamp: 42,
};

describe("MemosClient", () => {
  it("constructs the unfiltered first request from a normalized base URL", async () => {
    const request = new FakeRequestPort(() => ({
      status: 200,
      text: '{"memos":[]}',
      json: { memos: [] },
    }));
    const client = new MemosClient(request, "https://memos.example///", "secret");

    await expect(client.list(0)).resolves.toEqual([]);
    expect(request.calls).toEqual([
      {
        url: "https://memos.example/api/v1/memos?pageSize=200",
        headers: {
          Authorization: "Bearer secret",
          Accept: "application/json",
        },
        responseType: "json",
      },
    ]);
  });

  it("preserves a configured server subpath when constructing list requests", async () => {
    const request = new FakeRequestPort(() => ({
      status: 200,
      text: '{"memos":[]}',
      json: { memos: [] },
    }));

    await new MemosClient(request, "https://memos.example/self-hosted///", "secret").list(0);

    expect(request.calls[0]?.url).toBe(
      "https://memos.example/self-hosted/api/v1/memos?pageSize=200",
    );
  });

  it("adds the created timestamp filter only when a threshold is present", async () => {
    const request = new FakeRequestPort(() => ({
      status: 200,
      text: '{"memos":[]}',
      json: { memos: [] },
    }));

    await new MemosClient(request, "https://memos.example", "secret").list(42);

    expect(request.calls[0]?.url).toBe(
      "https://memos.example/api/v1/memos?pageSize=200&filter=created_ts+%3E+42",
    );
  });

  it("follows opaque page tokens and returns records only after all pages complete", async () => {
    const request = new FakeRequestPort((_call, index) => {
      if (index === 0) {
        return {
          status: 200,
          text: "",
          json: { memos: [memo], nextPageToken: "cursor+one" },
        };
      }
      return {
        status: 200,
        text: "",
        json: { memos: [{ ...memo, name: "memos/2" }] },
      };
    });

    await expect(new MemosClient(request, "https://memos.example", "secret").list(9)).resolves.toEqual([
      memo,
      { ...memo, name: "memos/2" },
    ]);
    expect(request.calls[1]?.url).toBe(
      "https://memos.example/api/v1/memos?pageSize=200&filter=created_ts+%3E+9&pageToken=cursor%2Bone",
    );
  });

  it("loads every comment page for fetched parents when threaded notes are enabled", async () => {
    const parent = { name: "memos/parent-id", content: "Parent", timestamp: 42 };
    const firstComment = { name: "memos/comment-one", content: "One", timestamp: 43 };
    const secondComment = { name: "memos/comment-two", content: "Two", timestamp: 44, parent: "memos/parent-id" };
    const request = new FakeRequestPort((_call, index) => {
      if (index === 0) return { status: 200, text: "", json: { memos: [parent] } };
      if (index === 1) return { status: 200, text: "", json: { memos: [firstComment], nextPageToken: "more-comments" } };
      return { status: 200, text: "", json: { memos: [secondComment] } };
    });

    await expect(new MemosClient(request, "https://memos.example/self-hosted", "secret").list(0, true)).resolves.toEqual([
      parent,
      { ...firstComment, parent: "memos/parent-id" },
      secondComment,
    ]);
    expect(request.calls.map(({ url }) => url)).toEqual([
      "https://memos.example/self-hosted/api/v1/memos?pageSize=200",
      "https://memos.example/self-hosted/api/v1/memos/parent-id/comments?pageSize=200",
      "https://memos.example/self-hosted/api/v1/memos/parent-id/comments?pageSize=200&pageToken=more-comments",
    ]);
  });

  it("does not request comments while threaded-note merging is disabled", async () => {
    const request = new FakeRequestPort(() => ({
      status: 200,
      text: "",
      json: { memos: [memo] },
    }));

    await new MemosClient(request, "https://memos.example", "secret").list(0, false);
    expect(request.calls).toHaveLength(1);
  });

  it("rejects repeated pagination tokens without accepting a truncated result", async () => {
    const request = new FakeRequestPort(() => ({
      status: 200,
      text: "",
      json: { memos: [memo], nextPageToken: "again" },
    }));

    await expect(new MemosClient(request, "https://memos.example", "secret").list(0)).rejects.toThrow(
      "repeated",
    );
    expect(request.calls).toHaveLength(2);
  });

  it("fails before requesting page 1,001", async () => {
    const request = new FakeRequestPort((_call, index) => ({
      status: 200,
      text: "",
      json: { memos: [], nextPageToken: `page-${index}` },
    }));

    await expect(new MemosClient(request, "https://memos.example", "secret").list(0)).rejects.toThrow(
      "page limit",
    );
    expect(request.calls).toHaveLength(1_000);
  });

  it("rejects malformed and non-success responses with a redacted bounded summary", async () => {
    const malformed = new FakeRequestPort(() => ({ status: 200, text: "{}", json: {} }));
    await expect(new MemosClient(malformed, "https://memos.example", "secret").list(0)).rejects.toBeInstanceOf(
      MemosApiError,
    );

    const rejected = new FakeRequestPort(() => ({
      status: 401,
      text: ` ${"secret ".repeat(100)} `,
      json: undefined,
    }));
    await expect(new MemosClient(rejected, "https://memos.example", "secret").list(0)).rejects.toMatchObject({
      message: expect.not.stringContaining("secret"),
    });
  });

  it("preserves transport causes without exposing the token", async () => {
    const cause = new Error("network failed for secret");
    const request = new FakeRequestPort(() => Promise.reject(cause));

    try {
      await new MemosClient(request, "https://memos.example", "secret").list(0);
      throw new Error("Expected the request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(MemosApiError);
      expect((error as MemosApiError).cause).toBe(cause);
      expect((error as Error).message).not.toContain("secret");
    }
  });
});
