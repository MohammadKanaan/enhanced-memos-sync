import { requireApiVersion } from "obsidian";

import type { PluginSettings } from "../settings/types";

export const API_TOKEN_SECRET_ID = "enhanced-memos-sync-api-token";

type MaybePromise<T> = T | Promise<T>;

interface SecretStoragePort {
  getSecret(id: string): MaybePromise<string | null>;
  setSecret(id: string, value: string): MaybePromise<void>;
}

export interface CredentialStorePort {
  app: { secretStorage?: SecretStoragePort };
  requireApiVersion?: (version: string) => boolean;
  saveSettings(): Promise<void>;
}

/** Stores tokens in SecretStorage where the running Obsidian version supports it. */
export class CredentialStore {
  constructor(private readonly port: CredentialStorePort) {}

  async migrate(settings: Pick<PluginSettings, "apiToken">): Promise<string | undefined> {
    const secretStorage = this.secretStorage();
    if (!secretStorage) return settings.apiToken;

    const plaintext = settings.apiToken;
    const stored = (await secretStorage.getSecret(API_TOKEN_SECRET_ID)) || undefined;
    if (!plaintext) return stored;

    const token = stored ?? plaintext;
    if (!stored) await secretStorage.setSecret(API_TOKEN_SECRET_ID, plaintext);
    delete settings.apiToken;
    await this.port.saveSettings();
    return token;
  }

  async get(settings: Pick<PluginSettings, "apiToken">): Promise<string | undefined> {
    const secretStorage = this.secretStorage();
    if (!secretStorage) return settings.apiToken;
    return (await secretStorage.getSecret(API_TOKEN_SECRET_ID)) ?? undefined;
  }

  async set(settings: Pick<PluginSettings, "apiToken">, token: string): Promise<void> {
    const secretStorage = this.secretStorage();
    if (!secretStorage) {
      if (token) settings.apiToken = token;
      else delete settings.apiToken;
      await this.port.saveSettings();
      return;
    }

    await secretStorage.setSecret(API_TOKEN_SECRET_ID, token);
    if (settings.apiToken !== undefined) {
      delete settings.apiToken;
      await this.port.saveSettings();
    }
  }

  private secretStorage(): SecretStoragePort | undefined {
    const supportsSecrets = (this.port.requireApiVersion ?? requireApiVersion)("1.11.4");
    const secretStorage = this.port.app.secretStorage;
    return supportsSecrets && isSecretStorage(secretStorage) ? secretStorage : undefined;
  }
}

function isSecretStorage(value: unknown): value is SecretStoragePort {
  return (
    typeof value === "object" &&
    value !== null &&
    "getSecret" in value &&
    typeof value.getSecret === "function" &&
    "setSecret" in value &&
    typeof value.setSecret === "function"
  );
}
