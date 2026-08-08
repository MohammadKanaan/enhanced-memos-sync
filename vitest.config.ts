import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/support/obsidian-mocks.ts", import.meta.url)),
      "obsidian-daily-notes-interface": fileURLToPath(
        new URL("./tests/support/daily-notes-mocks.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
  },
});
