import { describe, expect, it } from "vitest";

import { updateManagedSection } from "../../src/daily/managed-section";
import { resolveDailyNotePaths } from "../../src/daily/resolution";
import { FakeDailyNotes } from "../support/fake-daily-notes";

describe("SPEC 10.8 daily notes", () => {
  it("uses nonstandard integration paths and respects existing-note reuse plus create-missing enabled or disabled", async () => {
    const notes = new FakeDailyNotes();
    notes.seed("2026-01-20", "periodic/January 20th.md", "existing");
    const existing = await resolveDailyNotePaths(["2026-01-20"], notes, false);
    const missing = await resolveDailyNotePaths(["2026-01-21"], notes, false);
    const created = await resolveDailyNotePaths(["2026-01-21"], notes, true);
    expect(existing.paths.get("2026-01-20")).toBe("periodic/January 20th.md");
    expect(missing.diagnostics).toHaveLength(1);
    expect(created.paths.get("2026-01-21")).toBe("daily/2026-01-21.md");
  });

  it("matches configured punctuation literally and preserves content before, after, and inside its managed section", () => {
    const source = "before\n## Memos (A+B)?\nmanual before\n![[2026-01-20-3]]\nmanual after\n## Next\nafter\n";
    const updated = updateManagedSection(source, "## Memos (A+B)?", ["2026-01-20-2", "2026-01-20-1"], "full");
    expect(updated.content).toBe("before\n## Memos (A+B)?\nmanual before\n![[2026-01-20-1]]\n![[2026-01-20-2]]\nmanual after\n## Next\nafter\n");
  });

  it("appends missing headings cleanly, accepts only full-line embeds, and sorts plus deduplicates valid managed embeds", () => {
    const appended = updateManagedSection("note", "Memos", ["2026-01-20-2"], "full");
    expect(appended.content).toBe("note\n\n# Memos\n![[2026-01-20-2]]\n");
    const updated = updateManagedSection("# Memos\ntext ![[2026-01-20-9]]\n![[2026-01-20-3]]\n![[2026-01-20-3]]\n", "# Memos", ["2026-01-20-2"], "incremental");
    expect(updated.content).toContain("text ![[2026-01-20-9]]\n![[2026-01-20-2]]\n![[2026-01-20-3]]");
  });

  it("uses incremental unions and full replacements across days absent from the remote result", () => {
    const source = "## 📓 Memos\n![[2026-01-19-1]]\n";
    expect(updateManagedSection(source, "## 📓 Memos", ["2026-01-19-2"], "incremental").content).toContain("![[2026-01-19-1]]\n![[2026-01-19-2]]");
    expect(updateManagedSection(source, "## 📓 Memos", [], "full").content).not.toContain("![[2026-01-19-1]]");
  });
});
