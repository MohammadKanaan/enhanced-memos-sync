import { describe, expect, it } from "vitest";

import { ObsidianRequestAdapter } from "../../src/obsidian/request-adapter";

describe("Obsidian request adapter", () => {
  it("uses explicit GET and exposes status, text, JSON, and binary data", async () => {
    const calls: unknown[] = [];
    const adapter = new ObsidianRequestAdapter(async (options) => {
      calls.push(options);
      return { status: 201, text: "body", json: { ok: true }, arrayBuffer: new Uint8Array([1]).buffer };
    });

    await expect(adapter.get({ url: "https://memos.example", headers: { Accept: "application/json" }, responseType: "json" }))
      .resolves.toMatchObject({ status: 201, text: "body", json: { ok: true } });
    expect(calls).toEqual([{ url: "https://memos.example", method: "GET", throw: false, headers: { Accept: "application/json" } }]);
  });
});
