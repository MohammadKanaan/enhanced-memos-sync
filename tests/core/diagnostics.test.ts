import { describe, expect, it } from "vitest";

import {
  createRedactedExternalError,
  normalizeServerBody,
  redactApiToken,
} from "../../src/core/diagnostics";

describe("diagnostic safety", () => {
  it("normalizes and bounds server-body summaries", () => {
    expect(normalizeServerBody("  server\n\t rejected   request ")).toBe("server rejected request");
    expect(normalizeServerBody("x".repeat(501))).toHaveLength(500);
  });

  it("redacts every token occurrence", () => {
    expect(redactApiToken("secret / secret?token=secret", "secret")).toBe(
      "[REDACTED] / [REDACTED]?token=[REDACTED]",
    );
  });

  it("retains the transport cause while redacting messages and response bodies", () => {
    const cause = new Error("request failed for secret");
    const error = createRedactedExternalError({
      message: "GET https://memos.example/?token=secret failed",
      responseBody: " secret\\n denied secret ",
      token: "secret",
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("secret");
    expect(error.consoleMessage).not.toContain("secret");
    expect(error.message).toContain("[REDACTED]");
  });
});
