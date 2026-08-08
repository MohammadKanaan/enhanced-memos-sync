import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("plugin scaffold", () => {
  it("publishes the fixed Obsidian plugin manifest", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "manifest.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      id: "enhanced-memos-sync",
      name: "Enhanced Memos Sync",
      version: "0.1.0",
      minAppVersion: "1.6.6",
      author: "Mohammad Kanaan",
      isDesktopOnly: true,
    });
  });
});
