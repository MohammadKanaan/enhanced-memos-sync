import type { SyncDiagnostic } from "../core/types";

export type DailyReconciliationMode = "incremental" | "full";

export interface ManagedSectionResult {
  content: string;
  diagnostics: SyncDiagnostic[];
}

export function updateManagedSection(
  content: string,
  configuredHeader: string,
  authoritativeTargets: string[],
  mode: DailyReconciliationMode,
): ManagedSectionResult {
  const heading = normalizeDailyNoteHeader(configuredHeader);
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const headings = findExactHeadings(lines, heading);
  const diagnostics: SyncDiagnostic[] = headings.slice(1).map(() => ({
    severity: "warning",
    stage: "daily-note",
    message: `Additional managed heading ignored: ${heading}`,
  }));

  if (headings.length === 0) {
    const targets = normalizeTargets(authoritativeTargets);
    const prefix = content.trimEnd();
    return {
      content: `${prefix ? `${prefix}\n\n` : ""}${heading}${targets.length ? `\n${embedLines(targets).join("\n")}` : ""}\n`,
      diagnostics,
    };
  }

  const start = headings[0]!;
  const end = sectionEnd(lines, start, headingLevel(heading));
  const section = lines.slice(start + 1, end);
  const managedPositions: number[] = [];
  const existingTargets: string[] = [];
  section.forEach((line, index) => {
    const target = managedTarget(line);
    if (target) {
      managedPositions.push(index);
      existingTargets.push(target);
    }
  });

  const targets = normalizeTargets(
    mode === "incremental" ? [...existingTargets, ...authoritativeTargets] : authoritativeTargets,
  );
  const firstPosition = managedPositions[0];
  const cleaned = section.filter((line) => !managedTarget(line));
  const insertion = firstPosition === undefined
    ? cleaned.length
    : section.slice(0, firstPosition).filter((line) => !managedTarget(line)).length;
  const updatedSection = [
    ...cleaned.slice(0, insertion),
    ...embedLines(targets),
    ...cleaned.slice(insertion),
  ];
  const updated = [...lines.slice(0, start + 1), ...updatedSection, ...lines.slice(end)]
    .join("\n")
    .replace(/\n+$/, "");

  return { content: `${updated}\n`, diagnostics };
}

export function normalizeDailyNoteHeader(header: string): string {
  const trimmed = header.trim();
  return trimmed.startsWith("#") ? trimmed : `# ${trimmed}`;
}

function findExactHeadings(lines: string[], heading: string): number[] {
  const matches: number[] = [];
  let fence: { character: "`" | "~"; length: number } | undefined;
  lines.forEach((line, index) => {
    if (fence) {
      if (closingFence(line, fence)) fence = undefined;
      return;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      return;
    }
    if (line === heading) matches.push(index);
  });
  return matches;
}

function sectionEnd(lines: string[], start: number, level: number): number {
  let fence: { character: "`" | "~"; length: number } | undefined;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (fence) {
      if (closingFence(lines[index]!, fence)) fence = undefined;
      continue;
    }
    const opening = openingFence(lines[index]!);
    if (opening) {
      fence = opening;
      continue;
    }
    const match = lines[index]!.match(/^(#{1,6})\s/);
    if (match && match[1]!.length <= level) return index;
  }
  return lines.length;
}

function headingLevel(heading: string): number {
  return heading.match(/^#+/)![0].length;
}

function managedTarget(line: string): string | undefined {
  const match = line.match(/^\s*!\[\[(\d{4}-\d{2}-\d{2}-[1-9]\d*)\]\]\s*$/);
  return match?.[1];
}

function normalizeTargets(targets: string[]): string[] {
  return [...new Set(targets.filter((target) => /^\d{4}-\d{2}-\d{2}-[1-9]\d*$/.test(target)))].sort(
    (left, right) => Number(left.slice(11)) - Number(right.slice(11)),
  );
}

function embedLines(targets: string[]): string[] {
  return targets.map((target) => `![[${target}]]`);
}

function openingFence(line: string): { character: "`" | "~"; length: number } | undefined {
  const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  return match?.[1]
    ? { character: match[1][0]! as "`" | "~", length: match[1].length }
    : undefined;
}

function closingFence(line: string, fence: { character: "`" | "~"; length: number }): boolean {
  const trimmed = line.trimStart();
  const matched = trimmed.match(fence.character === "`" ? /^`+/ : /^~+/)?.[0];
  return Boolean(matched && matched.length >= fence.length && trimmed.slice(matched.length).trim() === "");
}
