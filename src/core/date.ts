import type { EffectiveSyncMode } from "./types";

export function toLocalDate(timestamp: number): string {
  assertTimestamp(timestamp);
  const date = new Date(timestamp * 1_000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toCreatedAtIso(timestamp: number): string {
  assertTimestamp(timestamp);
  return new Date(timestamp * 1_000).toISOString();
}

export function computeCutoffTimestamp(now: Date, syncDaysLimit: number): number {
  if (!Number.isSafeInteger(syncDaysLimit) || syncDaysLimit < 0) {
    throw new Error("Sync days limit must be a non-negative safe integer.");
  }
  if (syncDaysLimit === 0) {
    return 0;
  }

  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - syncDaysLimit);
  return Math.floor(cutoff.getTime() / 1_000);
}

export function computeSyncThreshold(
  mode: EffectiveSyncMode,
  cursor: number | undefined,
  cutoff: number,
): number {
  return mode === "incremental" ? Math.max(cursor ?? 0, cutoff) : cutoff;
}

function assertTimestamp(timestamp: number): void {
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Timestamp must be a positive integer Unix second value.");
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
