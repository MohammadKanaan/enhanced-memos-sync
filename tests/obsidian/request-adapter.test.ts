import { describe, expect, it } from "vitest";

import { ObsidianRequestAdapter } from "../../src/obsidian/request-adapter";

describe("Obsidian request adapter", () => {
  it("uses explicit GET and exposes status, text, JSON, and binary data", async () => {
    const calls: unknown[] = [];
    const binary = new Uint8Array([1, 2, 3]).buffer;
    const adapter = new ObsidianRequestAdapter(async (options) => {
      calls.push(options);
      return { status: 201, text: "body", json: { ok: true }, arrayBuffer: binary };
    });

    const response = await adapter.get({
      url: "https://memos.example",
      headers: { Accept: "application/json" },
      responseType: "json",
    });
    expect(response).toMatchObject({ status: 201, text: "body", json: { ok: true } });
    expect(response.arrayBuffer).toBe(binary);
    expect([...new Uint8Array(response.arrayBuffer ?? new ArrayBuffer(0))]).toEqual([1, 2, 3]);
    expect(calls).toEqual([{ url: "https://memos.example", method: "GET", throw: false, headers: { Accept: "application/json" } }]);
  });
});
