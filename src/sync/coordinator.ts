import { computeCutoffTimestamp, computeSyncThreshold, toLocalDate } from "../core/date";
import { redactApiToken } from "../core/diagnostics";
import { normalizeFolderPath } from "../core/paths";
import type { EffectiveSyncMode, RequestedSyncMode, SyncDiagnostic, SyncResult } from "../core/types";
import { updateManagedSection } from "../daily/managed-section";
import type { DailyNotesPort } from "../daily/resolution";
import { normalizeRemoteMemos } from "../memos/normalize";
import { downloadMissingAttachments } from "../resources/download";
import { renderMemoNote } from "../render/memo-note";
import { createRenderSnapshot, recoverThreadTaskStates } from "../render/snapshots";
import type { PluginSettings, SyncState } from "../settings/types";
import { buildSyncPlan, type PlannedMemoOutput } from "./plan";
import { canTrashMemoNote } from "./deletion";
import type { RequestPort, VaultPort } from "./ports";
import { associateThreads, type MemoThread } from "../threads/associate";
import { orderComments } from "../threads/order";

export interface CoordinatorPorts {
  /** Returns a fresh settings snapshot. The coordinator freezes its run input immediately. */
  settings(): PluginSettings;
  state(): SyncState;
  token(): Promise<string | undefined>;
  /** Fetches every requested page atomically; rejected pagination must expose no partial records. */
  fetch(threshold: number, mode: EffectiveSyncMode): Promise<unknown[]>;
  vault: VaultPort;
  dailyNotes: DailyNotesPort;
  request: RequestPort;
  /** Must serialize with settings saves and make the supplied state durable before resolving. */
  commit(state: SyncState): Promise<void>;
  notice(message: string): void;
  now(): Date;
}

/**
 * Coordinates a complete run. Host-specific APIs live behind ports so every
 * irreversible action has a visible stage and a final state-commit boundary.
 */
export class SyncCoordinator {
  private active = false;

  constructor(private readonly ports: CoordinatorPorts) {}

  async run(requestedMode: RequestedSyncMode): Promise<SyncResult> {
    if (this.active) {
      this.ports.notice("A Memos sync is already running.");
      return result(requestedMode, false);
    }

    this.active = true;
    try {
      return await this.runActive(requestedMode);
    } finally {
      this.active = false;
    }
  }

  private async runActive(requestedMode: RequestedSyncMode): Promise<SyncResult> {
    const diagnostics: SyncDiagnostic[] = [];
    const counts = emptyCounts();
    const settings = { ...this.ports.settings() };
    const state = cloneState(this.ports.state());
    let token: string | undefined;
    try {
      token = await this.ports.token();
    } catch {
      diagnostics.push({ severity: "error", stage: "settings", message: "Configuration is incomplete." });
      this.ports.notice("Memos sync configuration is incomplete.");
      return { requestedMode, complete: false, diagnostics, counts };
    }
    const apiUrl = normalizedHttpUrl(settings.apiUrl);

    if (!settings.enabled || !apiUrl || !token) {
      diagnostics.push({ severity: "error", stage: "settings", message: "Configuration is incomplete." });
      this.ports.notice("Memos sync configuration is incomplete.");
      return { requestedMode, complete: false, diagnostics, counts };
    }

    try {
      settings.memoNoteFolder = normalizeFolderPath(settings.memoNoteFolder, "Memos");
      settings.attachmentFolder = normalizeFolderPath(settings.attachmentFolder, "attachments");
    } catch {
      diagnostics.push({ severity: "error", stage: "settings", message: "Memo and attachment folders must not contain traversal segments." });
      this.ports.notice("Memos sync configuration is incomplete.");
      return { requestedMode, complete: false, diagnostics, counts };
    }

    const effectiveMode = resolveMode(requestedMode, state.cursor);
    const now = this.ports.now();
    let cutoff: number;
    try {
      cutoff = computeCutoffTimestamp(now, settings.syncDaysLimit);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        stage: "settings",
        message: error instanceof Error ? error.message : "Sync settings are invalid.",
      });
      this.ports.notice("Memos sync configuration is incomplete.");
      return { requestedMode, effectiveMode, complete: false, diagnostics, counts };
    }

    this.ports.notice("Memos sync started.");
    const threshold = computeSyncThreshold(effectiveMode, state.cursor, cutoff);
    let records: unknown[];
    try {
      records = await this.ports.fetch(threshold, effectiveMode);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        stage: "fetch",
        message: redact(token, error),
      });
      return this.finish(requestedMode, effectiveMode, false, diagnostics, counts);
    }

    counts.fetched = records.length;
    const normalized = normalizeRemoteMemos(records);
    counts.normalized = normalized.valid.length;
    diagnostics.push(...normalized.diagnostics);

    const { existingDailyDates, existingMemoPaths, preparationDiagnostics } = await this.readPlanningInputs(
      effectiveMode,
      settings.memoNoteFolder,
      token,
    );
    diagnostics.push(...preparationDiagnostics);

    const threads = associateThreads(normalized.valid, settings.mergeCommentsIntoParent).map((thread) => ({
      ...thread,
      comments: orderComments(thread.comments, settings.commentOrderRegex),
    }));
    const today = toLocalDate(Math.floor(now.getTime() / 1_000));
    const plan = buildSyncPlan({
      threads,
      memoFolder: settings.memoNoteFolder,
      mode: effectiveMode,
      existingDailyDates,
      existingMemoNotePaths: existingMemoPaths,
      ...(cutoff === 0 ? {} : { cutoffDate: toLocalDate(cutoff) }),
      today,
      resourceOptions: {
        apiUrl,
        attachmentFolder: settings.attachmentFolder,
        skipImages: settings.skipImages,
      },
    });
    diagnostics.push(...plan.resourceDiagnostics);

    try {
      const downloads = await downloadMissingAttachments(
        plan.resourceIntents.map(({ resource }) => resource),
        this.ports.vault,
        this.ports.request,
        token,
      );
      counts.attachmentsDownloaded += downloads.downloaded;
      diagnostics.push(...downloads.diagnostics);
    } catch (error) {
      diagnostics.push({ severity: "error", stage: "attachment", message: redact(token, error) });
    }

    let workingState = state;
    let memoFolderReady = true;
    try {
      await this.ports.vault.ensureFolder(settings.memoNoteFolder);
    } catch (error) {
      memoFolderReady = false;
      diagnostics.push({ severity: "error", stage: "memo-write", message: redact(token, error), path: settings.memoNoteFolder });
    }

    for (const output of plan.outputs) {
      if (!memoFolderReady) break;
      const written = await this.writeMemoOutput(output, workingState, settings, apiUrl, token, plan.resourceIntents);
      diagnostics.push(...written.diagnostics);
      counts.memoNotesWritten += written.memoNotesWritten;
      if (written.state) workingState = written.state;
    }

    const daily = await this.reconcileDailyNotes(plan, settings, effectiveMode, token);
    diagnostics.push(...daily.diagnostics);
    counts.dailyNotesModified += daily.modified;

    const deletionPaths = effectiveMode === "full" && !hasErrors(diagnostics)
      ? await this.preflightDeletions(plan, settings, apiUrl, cutoff, today, token, diagnostics)
      : [];

    if (hasErrors(diagnostics)) {
      return this.finish(requestedMode, effectiveMode, false, diagnostics, counts);
    }

    const maximumTimestamp = normalized.valid.reduce<number | undefined>(
      (maximum, memo) => maximum === undefined || memo.timestamp > maximum ? memo.timestamp : maximum,
      undefined,
    );
    const committedState: SyncState = {
      ...workingState,
      ...(maximumTimestamp === undefined
        ? effectiveMode === "full" ? { cursor: undefined } : state.cursor === undefined ? { cursor: undefined } : { cursor: state.cursor }
        : { cursor: maximumTimestamp }),
      lastSuccessfulSyncDate: today,
    };
    for (const path of deletionPaths) {
      try {
        await this.ports.vault.trash(path);
        counts.memoNotesTrashed += 1;
      } catch (error) {
        diagnostics.push({ severity: "error", stage: "deletion", path, message: redact(token, error) });
      }
    }

    if (hasErrors(diagnostics)) {
      return this.finish(requestedMode, effectiveMode, false, diagnostics, counts);
    }

    try {
      await this.ports.commit(committedState);
    } catch (error) {
      diagnostics.push({ severity: "error", stage: "state", message: redact(token, error) });
      return this.finish(requestedMode, effectiveMode, false, diagnostics, counts);
    }

    return this.finish(requestedMode, effectiveMode, true, diagnostics, counts);
  }

  private async readPlanningInputs(
    mode: EffectiveSyncMode,
    memoFolder: string,
    token: string,
  ): Promise<{ existingDailyDates: string[]; existingMemoPaths: string[]; preparationDiagnostics: SyncDiagnostic[] }> {
    if (mode !== "full") return { existingDailyDates: [], existingMemoPaths: [], preparationDiagnostics: [] };
    const preparationDiagnostics: SyncDiagnostic[] = [];
    let existingDailyDates: string[] = [];
    let existingMemoPaths: string[] = [];
    try {
      existingDailyDates = (await this.ports.dailyNotes.listExisting()).map(({ date }) => date);
    } catch (error) {
      preparationDiagnostics.push({ severity: "error", stage: "daily-note", message: redact(token, error) });
    }
    try {
      existingMemoPaths = await this.ports.vault.listMarkdownFiles(memoFolder);
    } catch (error) {
      preparationDiagnostics.push({ severity: "error", stage: "deletion", message: redact(token, error), path: memoFolder });
    }
    return { existingDailyDates, existingMemoPaths, preparationDiagnostics };
  }

  private async preflightDeletions(
    plan: ReturnType<typeof buildSyncPlan>,
    settings: PluginSettings,
    apiUrl: string,
    cutoff: number,
    today: string,
    token: string,
    diagnostics: SyncDiagnostic[],
  ): Promise<string[]> {
    const paths: string[] = [];
    for (const path of plan.staleCandidatePaths) {
      try {
        const content = await this.ports.vault.readText(path);
        const checked = canTrashMemoNote({
          path,
          content: content ?? "",
          memoFolder: settings.memoNoteFolder,
          source: `${settings.accountName} (${apiUrl})`,
          authoritativePaths: plan.authoritativePaths,
          ...(cutoff === 0 ? {} : { cutoffDate: toLocalDate(cutoff) }),
          today,
        });
        if (!checked.eligible) {
          diagnostics.push({ severity: "warning", stage: "deletion", path, message: `Memo note was not eligible for deletion: ${checked.reason ?? "not eligible"}.` });
          continue;
        }
        paths.push(path);
      } catch (error) {
        diagnostics.push({ severity: "error", stage: "deletion", path, message: redact(token, error) });
      }
    }
    return paths;
  }

  private async writeMemoOutput(
    output: PlannedMemoOutput,
    state: SyncState,
    settings: PluginSettings,
    apiUrl: string,
    token: string,
    resourceIntents: ReadonlyArray<{ memoId: string; resource: { markdown: string } }>,
  ): Promise<{ diagnostics: SyncDiagnostic[]; memoNotesWritten: number; state?: SyncState }> {
    const diagnostics: SyncDiagnostic[] = [];
    let existingContent: string | undefined;
    try {
      existingContent = await this.ports.vault.readText(output.path);
    } catch (error) {
      return { diagnostics: [{ severity: "error", stage: "memo-write", memoId: output.thread.parent.id, path: output.path, message: redact(token, error) }], memoNotesWritten: 0 };
    }

    let recovered: ReturnType<typeof recoverThreadTaskStates>;
    let content: string;
    try {
      const resourceMarkdown = new Map<string, string[]>();
      for (const intent of resourceIntents) {
        const values = resourceMarkdown.get(intent.memoId) ?? [];
        values.push(intent.resource.markdown);
        resourceMarkdown.set(intent.memoId, values);
      }
      const freshSegments = [output.thread.parent, ...output.thread.comments].map((memo) => ({
        id: memo.id,
        markdown: renderSegment(memo.content, resourceMarkdown.get(memo.id)),
      }));
      const snapshot = state.renderSnapshots[output.thread.parent.id];
      recovered = recoverThreadTaskStates({
        existingBody: withoutFrontmatter(existingContent ?? ""),
        ...(snapshot?.notePath === output.path ? { snapshot } : {}),
        freshSegments,
      });
      diagnostics.push(...recovered.diagnostics.map((diagnostic) => ({ ...diagnostic, path: output.path })));
      const renderedThread = withRecoveredSegments(output.thread, recovered.segments.map((segment) => segment.markdown));
      content = renderMemoNote(renderedThread, {
        accountName: settings.accountName,
        apiUrl,
        existingContent,
      });
    } catch (error) {
      diagnostics.push({ severity: "error", stage: "memo-write", memoId: output.thread.parent.id, path: output.path, message: redact(token, error) });
      return { diagnostics, memoNotesWritten: 0 };
    }

    let status: "created" | "updated" | "unchanged";
    try {
      status = await this.ports.vault.writeText(output.path, content);
    } catch (error) {
      diagnostics.push({ severity: "error", stage: "memo-write", memoId: output.thread.parent.id, path: output.path, message: redact(token, error) });
      return { diagnostics, memoNotesWritten: 0 };
    }

    const nextState: SyncState = {
      ...state,
      renderSnapshots: {
        ...state.renderSnapshots,
        [output.thread.parent.id]: createRenderSnapshot(output.path, recovered.segments),
      },
    };
    try {
      await this.ports.commit(nextState);
    } catch (error) {
      diagnostics.push({ severity: "error", stage: "state", memoId: output.thread.parent.id, path: output.path, message: redact(token, error) });
      return { diagnostics, memoNotesWritten: status === "unchanged" ? 0 : 1 };
    }
    return { diagnostics, memoNotesWritten: status === "unchanged" ? 0 : 1, state: nextState };
  }

  private async reconcileDailyNotes(
    plan: ReturnType<typeof buildSyncPlan>,
    settings: PluginSettings,
    mode: EffectiveSyncMode,
    token: string,
  ): Promise<{ diagnostics: SyncDiagnostic[]; modified: number }> {
    const diagnostics: SyncDiagnostic[] = [];
    let modified = 0;
    for (const date of [...plan.dailyDates].sort()) {
      let path: string | undefined;
      try {
        path = await this.ports.dailyNotes.resolve(date, settings.createMissingDailyNotes);
        if (!path) {
          diagnostics.push({ severity: "error", stage: "daily-note", date, message: "Daily Notes integration could not resolve this date." });
          continue;
        }
        const existing = await this.ports.dailyNotes.read(path);
        const updated = updateManagedSection(
          existing,
          settings.dailyNoteHeader,
          [...(plan.authoritativeByDate.get(date) ?? [])],
          mode,
        );
        diagnostics.push(...updated.diagnostics.map((diagnostic) => ({ ...diagnostic, date, path })));
        if (updated.content !== existing) {
          await this.ports.dailyNotes.write(path, updated.content);
          modified += 1;
        }
      } catch (error) {
        diagnostics.push({ severity: "error", stage: "daily-note", date, ...(path ? { path } : {}), message: redact(token, error) });
      }
    }
    return { diagnostics, modified };
  }

  private finish(
    requestedMode: RequestedSyncMode,
    effectiveMode: EffectiveSyncMode,
    complete: boolean,
    diagnostics: SyncDiagnostic[],
    counts: SyncResult["counts"],
  ): SyncResult {
    this.ports.notice(complete ? "Memos sync completed." : "Memos sync finished with errors.");
    return { requestedMode, effectiveMode, complete, diagnostics, counts };
  }
}

function resolveMode(mode: RequestedSyncMode, cursor: number | undefined): EffectiveSyncMode {
  return mode === "force" || (mode === "smart" && cursor === undefined) ? "full" : "incremental";
}

function normalizedHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/+$/, "") : undefined;
  } catch {
    return undefined;
  }
}

function emptyCounts(): SyncResult["counts"] {
  return { fetched: 0, normalized: 0, memoNotesWritten: 0, attachmentsDownloaded: 0, dailyNotesModified: 0, memoNotesTrashed: 0 };
}

function hasErrors(diagnostics: readonly SyncDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redact(token: string, error: unknown): string {
  return redactApiToken(errorMessage(error), token);
}

function cloneState(state: SyncState): SyncState {
  return {
    ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
    ...(state.lastSuccessfulSyncDate === undefined ? {} : { lastSuccessfulSyncDate: state.lastSuccessfulSyncDate }),
    renderSnapshots: Object.fromEntries(
      Object.entries(state.renderSnapshots).map(([id, snapshot]) => [
        id,
        { notePath: snapshot.notePath, segments: snapshot.segments.map((segment) => ({ ...segment })) },
      ]),
    ),
  };
}

function renderSegment(content: string, resources: string[] | undefined): string {
  return [content.trim(), ...(resources ?? [])].filter((value) => value.length > 0).join("\n");
}

function withRecoveredSegments(thread: MemoThread, segments: string[]): MemoThread {
  const [parent, ...comments] = segments;
  return {
    parent: { ...thread.parent, content: parent ?? "" },
    comments: thread.comments.map((comment, index) => ({ ...comment, content: comments[index] ?? "" })),
  };
}

function withoutFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content;
  return content.slice(end + 4).replace(/^\n/, "");
}

function result(requestedMode: RequestedSyncMode, complete: boolean): SyncResult {
  return { requestedMode, complete, diagnostics: [], counts: emptyCounts() };
}
