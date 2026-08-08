import { toCreatedAtIso, toLocalDate } from "../core/date";
import type { NormalizedMemo, RemoteMemo, RemoteResource, SyncDiagnostic } from "../core/types";

export interface NormalizationResult {
  valid: NormalizedMemo[];
  diagnostics: SyncDiagnostic[];
}

export function normalizeRemoteMemos(records: unknown[]): NormalizationResult {
  const diagnostics: SyncDiagnostic[] = [];
  const candidates: NormalizedMemo[] = [];

  for (const record of records) {
    const normalized = normalizeOne(record, diagnostics);
    if (normalized) {
      candidates.push(normalized);
    }
  }

  const byBasename = new Map<string, NormalizedMemo[]>();
  for (const memo of candidates) {
    const basename = `${memo.localDate}-${memo.timestamp}`;
    const group = byBasename.get(basename) ?? [];
    group.push(memo);
    byBasename.set(basename, group);
  }

  const valid: NormalizedMemo[] = [];
  for (const [basename, group] of byBasename) {
    if (group.length === 1) {
      valid.push(group[0]!);
      continue;
    }
    for (const memo of group) {
      diagnostics.push({
        severity: "error",
        stage: "normalize",
        memoId: memo.id,
        message: `Memo output collision for ${basename}.`,
      });
    }
  }

  return { valid, diagnostics };
}

function normalizeOne(record: unknown, diagnostics: SyncDiagnostic[]): NormalizedMemo | undefined {
  if (!isRecord(record)) {
    diagnostics.push(diagnostic("Memo record must be an object."));
    return undefined;
  }

  const id = firstNonEmptyString(record.name, record.uid) ?? stringifyIdentity(record.id);
  if (!id) {
    diagnostics.push(diagnostic("Memo is missing an identity."));
    return undefined;
  }
  if (typeof record.content !== "string") {
    diagnostics.push(diagnostic("Memo is missing string content.", id));
    return undefined;
  }

  const timestamp = findTimestamp(record);
  if (!timestamp) {
    diagnostics.push(diagnostic("Memo has no valid positive creation timestamp.", id));
    return undefined;
  }

  const resources = firstArray(record.attachments, record.resourceList, record.resources);
  const parent = firstNonEmptyString(record.parent);
  const source = record as unknown as RemoteMemo;

  return {
    id,
    content: record.content,
    timestamp,
    localDate: toLocalDate(timestamp),
    createdAtIso: toCreatedAtIso(timestamp),
    resources: resources.slice() as RemoteResource[],
    ...(parent ? { parent } : {}),
    source,
  };
}

function findTimestamp(record: Record<string, unknown>): number | undefined {
  for (const value of [record.timestamp, record.createdTs]) {
    if (isValidTimestamp(value)) {
      return value;
    }
  }
  for (const value of [record.createTime, record.createdAt]) {
    if (typeof value !== "string") {
      continue;
    }
    const milliseconds = Date.parse(value);
    const timestamp = Math.floor(milliseconds / 1_000);
    if (Number.isFinite(milliseconds) && isValidTimestamp(timestamp)) {
      return timestamp;
    }
  }
  return undefined;
}

function firstArray(...values: unknown[]): unknown[] {
  return values.find(Array.isArray) ?? [];
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function stringifyIdentity(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const id = String(value).trim();
  return id || undefined;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value) && value > 0;
}

function diagnostic(message: string, memoId?: string): SyncDiagnostic {
  return {
    severity: "error",
    stage: "normalize",
    message,
    ...(memoId ? { memoId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
