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
      minAppVersion: "1.6.6",
      author: "Mohammad Kanaan",
      isDesktopOnly: true,
    });
  });

  it("keeps manifest, package, and versions.json in sync", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "manifest.json"), "utf8"),
    ) as { version: string; minAppVersion: string };

    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };

    const versions = JSON.parse(
      readFileSync(resolve(process.cwd(), "versions.json"), "utf8"),
    ) as Record<string, string>;

    expect(pkg.version).toBe(manifest.version);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });
});