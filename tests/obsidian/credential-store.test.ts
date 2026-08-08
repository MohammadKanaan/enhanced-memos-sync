import { describe, expect, it } from "vitest";

import { API_TOKEN_SECRET_ID, CredentialStore } from "../../src/obsidian/credential-store";

describe("credential store", () => {
  it("migrates legacy plaintext tokens on supported hosts and clears persisted data", async () => {
    const secrets = new Map<string, string>();
    let saved = 0;
    const store = new CredentialStore({
      supportsSecretStorage: () => true,
      secretStorage: { getSecret: async (id) => secrets.get(id) ?? null, setSecret: async (id, value) => void secrets.set(id, value) },
      saveSettings: async () => { saved += 1; },
    });
    const settings = { apiToken: "legacy" };

    await expect(store.migrate(settings)).resolves.toBe("legacy");
    expect(secrets.get(API_TOKEN_SECRET_ID)).toBe("legacy");
    expect(settings.apiToken).toBeUndefined();
    expect(saved).toBe(1);
  });

  it("uses plaintext settings only on older hosts and clears an empty submitted token", async () => {
    const store = new CredentialStore({ supportsSecretStorage: () => false, saveSettings: async () => {} });
    const settings = { apiToken: "old" };
    await expect(store.get(settings)).resolves.toBe("old");
    await store.set(settings, "");
    expect(settings.apiToken).toBeUndefined();
  });
});
