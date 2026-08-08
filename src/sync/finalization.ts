import type { SyncState } from "../settings/types";

export interface FinalizationDeletion {
  path: string;
  content: string;
}

export interface SuccessfulSyncFinalization {
  priorState: SyncState;
  nextState: SyncState;
  deletions: readonly FinalizationDeletion[];
}

export class SyncFinalizationError extends Error {
  constructor(
    readonly stage: "deletion" | "state",
    message: string,
    readonly cause?: unknown,
    readonly path?: string,
  ) {
    super(message);
    this.name = "SyncFinalizationError";
  }
}
