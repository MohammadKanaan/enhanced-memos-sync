import type { RemoteMemo } from "../core/types";

export interface ListMemosResponse {
  memos: RemoteMemo[];
  nextPageToken?: string;
}
