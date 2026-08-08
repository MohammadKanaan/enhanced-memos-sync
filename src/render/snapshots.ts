import { applyTaskStates, extractTaskStates } from "./tasks";
import { diffArrays } from "diff";
import type { SyncDiagnostic } from "../core/types";
import type { ThreadRenderSnapshot } from "../settings/types";

export function createRenderSnapshot(
  notePath: string,
  segments: Array<{ id: string; markdown: string }>,
): ThreadRenderSnapshot {
  return { notePath, segments: segments.map((segment) => ({ ...segment })) };
}

export function preserveSegmentTaskStates(previous: string, fresh: string): string {
  return applyTaskStates(extractTaskStates(previous), fresh);
}

export interface FreshThreadSegment {
  id: string;
  markdown: string;
}

export function recoverThreadTaskStates(input: {
  existingBody: string;
  snapshot?: ThreadRenderSnapshot;
  freshSegments: FreshThreadSegment[];
}): { segments: FreshThreadSegment[]; diagnostics: SyncDiagnostic[] } {
  if (input.snapshot) {
    return recoverFromSnapshot(input.existingBody, input.snapshot, input.freshSegments);
  }
  return recoverWithoutSnapshot(input.existingBody, input.freshSegments);
}

function recoverFromSnapshot(
  existingBody: string,
  snapshot: ThreadRenderSnapshot,
  freshSegments: FreshThreadSegment[],
): { segments: FreshThreadSegment[]; diagnostics: SyncDiagnostic[] } {
  const expected = composeEntries(snapshot.segments);
  const actualLines = existingBody.split("\n");
  const statesById = new Map<string, ReturnType<typeof extractTaskStates>>();
  let expectedIndex = 0;
  let actualIndex = 0;

  for (const change of diffArrays(expected.map(normalizedLine), actualLines.map(normalizedLine))) {
    const count = change.value.length;
    if (change.removed) {
      expectedIndex += count;
      continue;
    }
    if (change.added) {
      actualIndex += count;
      continue;
    }
    for (let offset = 0; offset < count; offset += 1) {
      const entry = expected[expectedIndex + offset];
      const line = actualLines[actualIndex + offset];
      if (!entry?.id || line === undefined) continue;
      const states = statesById.get(entry.id) ?? {};
      Object.assign(states, extractTaskStates(line));
      statesById.set(entry.id, states);
    }
    expectedIndex += count;
    actualIndex += count;
  }

  return {
    segments: freshSegments.map((segment) => ({
      ...segment,
      markdown: applyTaskStates(statesById.get(segment.id) ?? {}, segment.markdown),
    })),
    diagnostics: [],
  };
}

function recoverWithoutSnapshot(
  existingBody: string,
  freshSegments: FreshThreadSegment[],
): { segments: FreshThreadSegment[]; diagnostics: SyncDiagnostic[] } {
  const [localParent, localComments = ""] = existingBody.split("\n\n---\n\n## 💬 Comments\n\n", 2);
  const parentStates = extractTaskStates(localParent ?? "");
  const commentTextCounts = new Map<string, number>();
  freshSegments.slice(1).forEach((segment) => {
    Object.keys(extractTaskStates(segment.markdown)).forEach((text) => {
      commentTextCounts.set(text, (commentTextCounts.get(text) ?? 0) + 1);
    });
  });
  const localCommentSegments = localComments.split("\n\n");
  const diagnostics: SyncDiagnostic[] = [];
  const segments = freshSegments.map((segment, index) => {
    if (index === 0) {
      return { ...segment, markdown: applyTaskStates(parentStates, segment.markdown) };
    }
    const states = extractTaskStates(localCommentSegments[index - 1] ?? "");
    const unique = Object.fromEntries(
      Object.entries(states).filter(([text]) => commentTextCounts.get(text) === 1),
    );
    if (
      diagnostics.length === 0 &&
      Object.keys(states).some((text) => commentTextCounts.get(text)! > 1)
    ) {
      diagnostics.push({
        severity: "warning",
        stage: "memo-write",
        memoId: segment.id,
        message: "Ambiguous comment task state was left remote-controlled.",
      });
    }
    return { ...segment, markdown: applyTaskStates(unique, segment.markdown) };
  });

  return { segments, diagnostics };
}

function composeEntries(segments: Array<{ id: string; markdown: string }>): Array<{ id?: string; line: string }> {
  if (segments.length === 0) return [];
  const lines: Array<{ id?: string; line: string }> = segmentEntries(segments[0]!);
  if (segments.length > 1) {
    lines.push({ line: "" }, { line: "---" }, { line: "" }, { line: "## 💬 Comments" }, { line: "" });
    segments.slice(1).forEach((segment, index) => {
      if (index > 0) lines.push({ line: "" });
      lines.push(...segmentEntries(segment));
    });
  }
  return lines;
}

function segmentEntries(segment: { id: string; markdown: string }): Array<{ id?: string; line: string }> {
  return segment.markdown.split("\n").map((line) => ({ id: segment.id, line }));
}

function normalizedLine(entry: { line: string } | string): string {
  const line = typeof entry === "string" ? entry : entry.line;
  return line.replace(/^(\s*- \[)[ xX](\].*)$/, "$1 $2");
}
