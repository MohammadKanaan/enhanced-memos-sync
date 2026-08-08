export interface SchedulerSettings {
  syncOnStartup: boolean;
  startupDelaySeconds: number;
  skipStartupSyncIfSyncedToday: boolean;
  periodicSyncIntervalMinutes: number;
}
export interface SchedulerPort {
  onLayoutReady(callback: () => void): void;
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, milliseconds: number): number;
  clearInterval(id: number): void;
  runSmart(): void;
  today(): string;
}
export class SyncScheduler {
  private timeout?: number;
  private interval?: number;
  constructor(private readonly port: SchedulerPort) {}
  schedule(settings: SchedulerSettings, lastSuccessfulSyncDate: string | undefined): void {
    this.clear();
    this.port.onLayoutReady(() => {
      if (settings.syncOnStartup && !(settings.skipStartupSyncIfSyncedToday && lastSuccessfulSyncDate === this.port.today())) {
        this.timeout = this.port.setTimeout(() => this.port.runSmart(), settings.startupDelaySeconds * 1_000);
      }
      if (settings.periodicSyncIntervalMinutes > 0) this.interval = this.port.setInterval(() => this.port.runSmart(), settings.periodicSyncIntervalMinutes * 60_000);
    });
  }
  clear(): void {
    if (this.timeout !== undefined) this.port.clearTimeout(this.timeout);
    if (this.interval !== undefined) this.port.clearInterval(this.interval);
    this.timeout = undefined; this.interval = undefined;
  }
}
