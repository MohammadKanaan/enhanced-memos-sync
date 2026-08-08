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
  runSmart(): void | Promise<void>;
  today(): string;
}

/** Owns the two host timers used by sync and deliberately never queues work. */
export class SyncScheduler {
  private timeout?: number;
  private interval?: number;
  private layoutReady = false;
  private periodicIntervalMinutes = 0;
  private generation = 0;

  constructor(private readonly port: SchedulerPort) {}

  schedule(settings: SchedulerSettings, lastSuccessfulSyncDate: string | undefined): void {
    this.generation += 1;
    const generation = this.generation;
    this.cancelTimers();
    this.layoutReady = false;
    this.periodicIntervalMinutes = settings.periodicSyncIntervalMinutes;

    this.port.onLayoutReady(() => {
      if (generation !== this.generation) return;
      this.layoutReady = true;

      const shouldSkipStartup = settings.skipStartupSyncIfSyncedToday
        && lastSuccessfulSyncDate === this.port.today();
      if (settings.syncOnStartup && !shouldSkipStartup) {
        if (settings.startupDelaySeconds === 0) {
          this.runSmart();
        } else {
          this.timeout = this.port.setTimeout(() => {
            this.timeout = undefined;
            this.runSmart();
          }, settings.startupDelaySeconds * 1_000);
        }
      }

      this.schedulePeriodic();
    });
  }

  /** Startup configuration is intentionally not re-read until the next load. */
  reschedulePeriodic(minutes: number): void {
    this.periodicIntervalMinutes = minutes;
    if (!this.layoutReady) return;
    this.clearInterval();
    this.schedulePeriodic();
  }

  clear(): void {
    this.generation += 1;
    this.cancelTimers();
    this.layoutReady = false;
  }

  private schedulePeriodic(): void {
    if (this.periodicIntervalMinutes <= 0 || this.interval !== undefined) return;
    this.interval = this.port.setInterval(
      () => this.runSmart(),
      this.periodicIntervalMinutes * 60_000,
    );
  }

  private runSmart(): void {
    void Promise.resolve(this.port.runSmart()).catch(() => {
      // Commands and the plugin entry point report errors; a timer must not create an unhandled rejection.
    });
  }

  private cancelTimers(): void {
    if (this.timeout !== undefined) this.port.clearTimeout(this.timeout);
    this.timeout = undefined;
    this.clearInterval();
  }

  private clearInterval(): void {
    if (this.interval !== undefined) this.port.clearInterval(this.interval);
    this.interval = undefined;
  }
}
