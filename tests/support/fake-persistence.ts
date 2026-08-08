import type { SyncState } from "../../src/settings/types";

export class FakePersistence {
  readonly commits: SyncState[] = [];
  failCommitAt?: number;

  constructor(private value: SyncState) {}

  state = (): SyncState => structuredClone(this.value);

  commit = async (state: SyncState): Promise<void> => {
    if (this.failCommitAt === this.commits.length) throw new Error("state save failed");
    this.value = structuredClone(state);
    this.commits.push(structuredClone(state));
  };
}
