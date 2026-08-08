import { buildMemoPath, normalizeFolderPath } from "../core/paths";
import { planResources, type PlannedResource, type ResourcePlanOptions } from "../resources/resources";
import type { MemoThread } from "../threads/associate";

export interface PlannedMemoOutput {
  thread: MemoThread;
  basename: string;
  path: string;
}

export interface PlannedResourceIntent {
  memoId: string;
  resource: PlannedResource;
}

/**
 * The render operation supplies the final Markdown for these segments before
 * persisting a ThreadRenderSnapshot.  Keeping the plan to identities and
 * paths avoids snapshotting stale task states before the memo write succeeds.
 */
export interface SnapshotCandidate {
  memoId: string;
  notePath: string;
  segmentIds: string[];
}

export interface SyncPlan {
  outputs: readonly PlannedMemoOutput[];
  resourceIntents: readonly PlannedResourceIntent[];
  resourceDiagnostics: readonly ReturnType<typeof planResources>["diagnostics"][number][];
  authoritativePaths: ReadonlySet<string>;
  authoritativeByDate: ReadonlyMap<string, readonly string[]>;
  dailyDates: ReadonlySet<string>;
  snapshotCandidates: readonly SnapshotCandidate[];
  staleCandidatePaths: readonly string[];
}

export interface BuildSyncPlanInput {
  threads: MemoThread[];
  memoFolder: string;
  mode: "incremental" | "full";
  existingDailyDates: string[];
  /** All markdown paths currently found below the configured memo folder. */
  existingMemoNotePaths?: string[];
  /** Undefined means the sync-days limit is unlimited. */
  cutoffDate?: string;
  today: string;
  resourceOptions: ResourcePlanOptions;
}

/**
 * Builds the complete non-destructive work list for one sync.  Nothing in the
 * returned plan performs vault I/O; stale candidates are deliberately only
 * candidates and must be revalidated immediately before trashing.
 */
export function buildSyncPlan(input: BuildSyncPlanInput): SyncPlan {
  const memoFolder = normalizeFolderPath(input.memoFolder, "Memos");
  const outputs = input.threads.map((inputThread) => {
    const thread = cloneThread(inputThread);
    const path = buildMemoPath(memoFolder, thread.parent.localDate, thread.parent.timestamp);
    return freeze({ thread, basename: path.slice(memoFolder.length + 1, -3), path });
  });
  const authoritativePaths = new Set(outputs.map((output) => output.path));
  const authoritativeByDate = new Map<string, string[]>();
  for (const output of outputs) {
    const date = output.thread.parent.localDate;
    const group = authoritativeByDate.get(date) ?? [];
    group.push(output.basename);
    authoritativeByDate.set(date, freeze(group));
  }

  const dailyDates = new Set(authoritativeByDate.keys());
  if (input.mode === "full") {
    for (const date of input.existingDailyDates) {
      if (isDateInFullWindow(date, input.cutoffDate, input.today)) dailyDates.add(date);
    }
  }

  const resourceIntents: PlannedResourceIntent[] = [];
  const resourceDiagnostics: ReturnType<typeof planResources>["diagnostics"] = [];
  for (const output of outputs) {
    for (const memo of [output.thread.parent, ...output.thread.comments]) {
      const result = planResources(memo.resources, input.resourceOptions);
      resourceIntents.push(...result.items.map((resource) => freeze({ memoId: memo.id, resource: freeze({ ...resource }) })));
      resourceDiagnostics.push(...result.diagnostics.map((diagnostic) => freeze({ ...diagnostic, memoId: diagnostic.memoId ?? memo.id })));
    }
  }

  const snapshotCandidates = outputs.map((output) => freeze({
    memoId: output.thread.parent.id,
    notePath: output.path,
    segmentIds: freeze([output.thread.parent.id, ...output.thread.comments.map((comment) => comment.id)]),
  }));

  const staleCandidatePaths = input.mode === "full"
    ? uniquePaths([
        ...outputs.flatMap(({ thread }) => thread.comments.map((comment) => buildMemoPath(memoFolder, comment.localDate, comment.timestamp))),
        ...(input.existingMemoNotePaths ?? []).map(normalizeVaultPath),
      ]).filter((path) => isSafeStaleCandidate(path, memoFolder, input.cutoffDate, input.today) && !authoritativePaths.has(path))
    : [];

  return freeze({
    outputs: freeze(outputs),
    resourceIntents: freeze(resourceIntents),
    resourceDiagnostics: freeze(resourceDiagnostics),
    authoritativePaths: immutableSet(authoritativePaths),
    authoritativeByDate: immutableMap(authoritativeByDate),
    dailyDates: immutableSet(dailyDates),
    snapshotCandidates: freeze(snapshotCandidates),
    staleCandidatePaths: freeze(staleCandidatePaths),
  });
}

function isDateInFullWindow(date: string, cutoffDate: string | undefined, today: string): boolean {
  if (!isCalendarDate(date)) return false;
  if (!cutoffDate) return true;
  return date >= cutoffDate && date <= today;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeVaultPath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function isSafeStaleCandidate(path: string, memoFolder: string, cutoffDate: string | undefined, today: string): boolean {
  const match = path.match(new RegExp(`^${escapeRegex(memoFolder)}/(\\d{4}-\\d{2}-\\d{2})-([1-9]\\d*)\\.md$`));
  if (!match) return false;
  const [, date, timestampText] = match;
  const timestamp = Number(timestampText);
  if (!isCalendarDate(date!) || !Number.isSafeInteger(timestamp) || timestamp <= 0) return false;
  return (!cutoffDate || date! >= cutoffDate) && date! <= today;
}

function cloneThread(thread: MemoThread): MemoThread {
  return freeze({
    parent: cloneMemo(thread.parent),
    comments: freeze(thread.comments.map(cloneMemo)),
  });
}

function cloneMemo<T extends MemoThread["parent"]>(memo: T): T {
  const clone = {
    ...memo,
    resources: freeze(memo.resources.map((resource) => freeze({ ...resource }))),
    source: cloneSource(memo.source),
  };
  return freeze(clone) as T;
}

function cloneSource(source: MemoThread["parent"]["source"]): MemoThread["parent"]["source"] {
  return freeze({
    ...source,
    attachments: cloneResources(source.attachments),
    resourceList: cloneResources(source.resourceList),
    resources: cloneResources(source.resources),
  });
}

function cloneResources(resources: MemoThread["parent"]["source"]["resources"]): MemoThread["parent"]["source"]["resources"] {
  return resources ? freeze(resources.map((resource) => freeze({ ...resource }))) : undefined;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function immutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values);
  for (const method of ["add", "delete", "clear"] as const) {
    Object.defineProperty(set, method, {
      value: () => { throw new Error("Sync plans are immutable."); },
    });
  }
  return Object.freeze(set);
}

function immutableMap<K, V>(values: Iterable<[K, V]>): ReadonlyMap<K, V> {
  const map = new Map(values);
  for (const method of ["set", "delete", "clear"] as const) {
    Object.defineProperty(map, method, {
      value: () => { throw new Error("Sync plans are immutable."); },
    });
  }
  return Object.freeze(map);
}
