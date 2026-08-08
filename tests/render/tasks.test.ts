import { describe, expect, it } from "vitest";

import { applyTaskStates, extractTaskStates } from "../../src/render/tasks";

describe("Markdown task states", () => {
  it("recognizes only semantic checkbox lines and keeps the last duplicate state", () => {
    expect(
      extractTaskStates(["- [ ] one", "  - [x] second", "- [X] one", "- [y] invalid", "-[x] invalid"].join("\n")),
    ).toEqual({ one: "X", second: "x" });
  });

  it("applies local state to every matching fresh task while keeping remote formatting and text", () => {
    const local = extractTaskStates(["- [x] alpha", "- [ ] duplicate", "- [X] duplicate"].join("\n"));
    const fresh = [
      "remote prose",
      "  - [ ] duplicate",
      "- [X] beta",
      "- [ ] alpha",
      "- [ ] new task",
    ].join("\n");

    expect(applyTaskStates(local, fresh)).toBe(
      [
        "remote prose",
        "  - [X] duplicate",
        "- [X] beta",
        "- [x] alpha",
        "- [ ] new task",
      ].join("\n"),
    );
  });

  it("does not transfer state to removed or reworded tasks", () => {
    const local = extractTaskStates("- [x] old wording");

    expect(applyTaskStates(local, "- [ ] new wording")).toBe("- [ ] new wording");
  });
});
