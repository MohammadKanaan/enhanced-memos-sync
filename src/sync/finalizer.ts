import type { VaultPort } from "./ports";
import { SyncFinalizationError, type SuccessfulSyncFinalization } from "./finalization";
import { PersistedStore } from "../state/persisted-store";

/**
 * Makes the irreversible part of a complete sync recoverable across process
 * interruption by durably recording the exact inverse operation first.
 */
export class PersistedSyncFinalizer {
  constructor(
    private readonly store: PersistedStore,
    private readonly vault: Pick<VaultPort, "trash" | "readText" | "writeText">,
  ) {}

  async recoverPendingFinalization(): Promise<boolean> {
    return this.store.recoverPendingFinalization(this.vault);
  }

  async finalizeSuccessfulSync(input: SuccessfulSyncFinalization): Promise<void> {
    try {
      await this.store.prepareFinalization(input);
    } catch (cause) {
      throw new SyncFinalizationError("state", "Could not prepare sync finalization.", cause);
    }

    let activeDeletion: string | undefined;
    try {
      for (const deletion of input.deletions) {
        activeDeletion = deletion.path;
        await this.vault.trash(deletion.path);
      }
    } catch (cause) {
      await this.restorePreparedJournal(cause, "deletion", activeDeletion);
    }

    try {
      await this.store.completeFinalization();
    } catch (cause) {
      await this.restorePreparedJournal(cause, "state");
    }
  }

  private async restorePreparedJournal(
    cause: unknown,
    stage: "deletion" | "state",
    path?: string,
  ): Promise<never> {
    try {
      await this.store.recoverPendingFinalization(this.vault);
    } catch (recoveryCause) {
      throw new SyncFinalizationError(
        stage,
        "Sync finalization failed and its recovery could not complete.",
        { cause, recoveryCause },
        path,
      );
    }
    throw new SyncFinalizationError(
      stage,
      stage === "deletion" ? "Could not move a memo note to trash." : "Could not commit sync state.",
      cause,
      path,
    );
  }
}
