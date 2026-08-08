import { describe, expect, it } from "vitest";

import { updateManagedSection } from "../../src/daily/managed-section";

describe("daily-note managed sections", () => {
  it("replaces only valid managed embeds at their first former location and preserves manual content", () => {
    const content = [
      "Before",
      "## 📓 Memos",
      "Manual first",
      "![[2026-01-01-20]]",
      "![[not-a-memo]]",
      "![[2026-01-01-10]]",
      "Manual after",
      "## Next",
      "After",
    ].join("\n");

    const result = updateManagedSection(content, "## 📓 Memos", ["2026-01-01-30", "2026-01-01-20"], "full");

    expect(result.content).toBe(
      [
        "Before",
        "## 📓 Memos",
        "Manual first",
        "![[2026-01-01-20]]",
        "![[2026-01-01-30]]",
        "![[not-a-memo]]",
        "Manual after",
        "## Next",
        "After",
        "",
      ].join("\n"),
    );
  });

  it("unions incremental embeds and appends a missing literal heading cleanly", () => {
    const incremental = updateManagedSection(
      "## 📓 Memos\n![[2026-01-01-10]]\n",
      "## 📓 Memos",
      ["2026-01-01-20"],
      "incremental",
    );
    expect(incremental.content).toContain("![[2026-01-01-10]]\n![[2026-01-01-20]]");

    expect(updateManagedSection("Existing", "Memos", ["2026-01-01-10"], "full").content).toBe(
      "Existing\n\n# Memos\n![[2026-01-01-10]]\n",
    );
  });

  it("ignores fenced heading-like text and warns about additional exact headings", () => {
    const result = updateManagedSection(
      ["```md", "## Memos", "```", "## Memos", "## Memos"].join("\n"),
      "## Memos",
      [],
      "full",
    );

    expect(result.content).toContain("```md\n## Memos\n```");
    expect(result.diagnostics).toHaveLength(1);
  });

  it("does not let a fenced heading end the managed section", () => {
    const result = updateManagedSection(
      [
        "## Memos",
        "```md",
        "# This is documentation, not a section boundary",
        "```",
        "![[2026-01-01-10]]",
        "# Actual next section",
      ].join("\n"),
      "## Memos",
      ["2026-01-01-20"],
      "full",
    );

    expect(result.content).toContain(
      "```md\n# This is documentation, not a section boundary\n```\n![[2026-01-01-20]]\n# Actual next section",
    );
  });
});
