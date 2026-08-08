export type RequestedSyncMode = "smart" | "incremental" | "force";
export type EffectiveSyncMode = "incremental" | "full";

export interface RemoteResource {
  id?: string;
  uid?: string;
  name?: string;
  filename?: string;
  type?: string;
  size?: number;
  externalLink?: string;
}

export interface RemoteMemo {
  id?: number | string;
  name?: string;
  uid?: string;
  content: string;
  timestamp?: number;
  createdTs?: number;
  createTime?: string;
  createdAt?: string;
  parent?: string;
  attachments?: RemoteResource[];
  resourceList?: RemoteResource[];
  resources?: RemoteResource[];
}

export type NormalizedResource = RemoteResource;

export interface NormalizedMemo {
  id: string;
  content: string;
  timestamp: number;
  localDate: string;
  createdAtIso: string;
  resources: NormalizedResource[];
  parent?: string;
  source: RemoteMemo;
}

export interface SyncDiagnostic {
  severity: "warning" | "error";
  stage:
    | "settings"
    | "fetch"
    | "normalize"
    | "attachment"
    | "memo-write"
    | "daily-note"
    | "deletion"
    | "state";
  message: string;
  memoId?: string;
  resourceId?: string;
  date?: string;
  path?: string;
}

export interface SyncResult {
  requestedMode: RequestedSyncMode;
  effectiveMode?: EffectiveSyncMode;
  complete: boolean;
  diagnostics: SyncDiagnostic[];
  counts: {
    fetched: number;
    normalized: number;
    memoNotesWritten: number;
    attachmentsDownloaded: number;
    dailyNotesModified: number;
    memoNotesTrashed: number;
  };
}
