import type { PluginSettings } from "../settings/types";

export const API_TOKEN_SECRET_ID = "enhanced-memos-sync-api-token";

export interface CredentialStorePort {
  supportsSecretStorage(): boolean;
  secretStorage?: {
    getSecret(id: string): Promise<string | null>;
    setSecret(id: string, value: string): Promise<void>;
  };
  saveSettings(): Promise<void>;
}

export class CredentialStore {
  constructor(private readonly port: CredentialStorePort) {}

  async migrate(settings: Pick<PluginSettings, "apiToken">): Promise<string | undefined> {
    if (!this.port.supportsSecretStorage() || !this.port.secretStorage) {
      return settings.apiToken;
    }
    const existing = await this.port.secretStorage.getSecret(API_TOKEN_SECRET_ID);
    if (existing) return existing;
    if (!settings.apiToken) return undefined;
    const migrated = settings.apiToken;
    await this.port.secretStorage.setSecret(API_TOKEN_SECRET_ID, migrated);
    delete settings.apiToken;
    await this.port.saveSettings();
    return migrated;
  }

  async get(settings: Pick<PluginSettings, "apiToken">): Promise<string | undefined> {
    if (!this.port.supportsSecretStorage() || !this.port.secretStorage) return settings.apiToken;
    return (await this.port.secretStorage.getSecret(API_TOKEN_SECRET_ID)) ?? undefined;
  }

  async set(settings: Pick<PluginSettings, "apiToken">, token: string): Promise<void> {
    if (!this.port.supportsSecretStorage() || !this.port.secretStorage) {
      if (token) settings.apiToken = token;
      else delete settings.apiToken;
      await this.port.saveSettings();
      return;
    }
    await this.port.secretStorage.setSecret(API_TOKEN_SECRET_ID, token);
  }
}
