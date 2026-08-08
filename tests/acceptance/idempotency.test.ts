import { describe, expect, it } from "vitest";

import { acceptanceMemo, createAcceptanceSync } from "../support/acceptance";

describe("acceptance idempotency and source-defect regressions", () => {
  it("retries an attachment failure without duplicate embeds and only advances state after the complete retry", async () => {
    const sync = createAcceptanceSync({
      records: [acceptanceMemo(1_768_867_200, { attachments: [{ id: "retry", filename: "retry.pdf" }] })],
      response: (_call, index) => index === 0
        ? { status: 500, text: "temporary" }
        : { status: 200, text: "", arrayBuffer: new Uint8Array([4]).buffer },
    });
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: false });
    expect(sync.persistence.state().cursor).toBeUndefined();
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    const note = sync.vault.text.get("Memos/2026-01-20-1768867200.md") ?? "";
    expect(note.match(/!\[\[retry-retry\.pdf\]\]/g)).toHaveLength(1);
    expect(sync.persistence.state().cursor).toBe(1_768_867_200);
  });

  it("refreshes owned frontmatter and preserves unknown frontmatter across repeated syncs while retaining a local task", async () => {
    const records = [acceptanceMemo(1_768_867_200, { content: "new prose\n- [ ] keep" })];
    const sync = createAcceptanceSync({ records });
    sync.vault.text.set("Memos/2026-01-20-1768867200.md", [
      "---", "memo_id: old", "source: old", "custom: retained", "---", "old prose", "- [x] keep", "",
    ].join("\n"));
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    records[0]!.content = "newer remote prose\n- [ ] keep";
    await expect(sync.coordinator.run("force")).resolves.toMatchObject({ complete: true });
    const note = sync.vault.text.get("Memos/2026-01-20-1768867200.md") ?? "";
    expect(note).toContain('source: "Default (https://memos.example)"');
    expect(note).toContain("custom: retained");
    expect(note).toContain("newer remote prose\n- [x] keep");
  });
});
