import { describe, expect, it } from "vitest";

import { API_TOKEN_SECRET_ID, CredentialStore } from "../../src/obsidian/credential-store";

describe("credential store", () => {
  it("migrates a legacy token to modern secret storage and persists sanitized settings", async () => {
    const secrets = new Map<string, string>();
    let saved = 0;
    const store = new CredentialStore({
      requireApiVersion: (version) => version === "1.11.4",
      app: { secretStorage: { getSecret: (id) => secrets.get(id) ?? null, setSecret: (id, value) => void secrets.set(id, value) } },
      saveSettings: async () => { saved += 1; },
    });
    const settings = { apiToken: "legacy-token" };

    await expect(store.migrate(settings)).resolves.toBe("legacy-token");
    expect(secrets.get(API_TOKEN_SECRET_ID)).toBe("legacy-token");
    expect(settings.apiToken).toBeUndefined();
    expect(saved).toBe(1);
  });

  it("clears stale plaintext after an existing modern secret and only saves the migration once", async () => {
    let saved = 0;
    const store = new CredentialStore({
      requireApiVersion: () => true,
      app: { secretStorage: { getSecret: () => "stored-token", setSecret: () => {} } },
      saveSettings: async () => { saved += 1; },
    });
    const settings = { apiToken: "legacy-token" };

    await expect(store.migrate(settings)).resolves.toBe("stored-token");
    expect(settings.apiToken).toBeUndefined();
    expect(saved).toBe(1);
    await store.migrate(settings);
    expect(saved).toBe(1);
  });

  it("treats an empty modern secret as absent and returns the migrated plaintext token", async () => {
    const writes: string[] = [];
    const store = new CredentialStore({
      requireApiVersion: () => true,
      app: { secretStorage: { getSecret: () => "", setSecret: (_id, value) => void writes.push(value) } },
      saveSettings: async () => {},
    });
    const settings = { apiToken: "legacy-token" };

    await expect(store.migrate(settings)).resolves.toBe("legacy-token");
    expect(writes).toEqual(["legacy-token"]);
    expect(settings.apiToken).toBeUndefined();
  });

  it("uses plaintext settings only on older hosts and clears the applicable storage on empty input", async () => {
    const legacy = new CredentialStore({ requireApiVersion: () => false, app: {}, saveSettings: async () => {} });
    const legacySettings = { apiToken: "old-token" };
    await expect(legacy.get(legacySettings)).resolves.toBe("old-token");
    await legacy.set(legacySettings, "");
    expect(legacySettings.apiToken).toBeUndefined();

    const writes: string[] = [];
    const modern = new CredentialStore({
      requireApiVersion: () => true,
      app: { secretStorage: { getSecret: () => null, setSecret: (_id, value) => void writes.push(value) } },
      saveSettings: async () => {},
    });
    await modern.set({}, "");
    expect(writes).toEqual([""]);
  });
});
