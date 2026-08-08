import YAML from "yaml";

export interface DeletionCandidate {
  path: string;
  content: string;
  memoFolder: string;
  source: string;
  authoritativePaths: Set<string>;
  cutoffDate: string;
  today: string;
}

export function canTrashMemoNote(candidate: DeletionCandidate): { eligible: boolean; reason?: string } {
  const folder = candidate.memoFolder.replace(/\/+$/, "");
  const match = candidate.path.match(new RegExp(`^${escapeRegex(folder)}/(\\d{4}-\\d{2}-\\d{2})-([1-9]\\d*)\\.md$`));
  if (!match) return { eligible: false, reason: "path is not a memo-folder direct child" };
  if (candidate.authoritativePaths.has(candidate.path)) return { eligible: false, reason: "path is authoritative" };
  const date = match[1]!;
  const timestamp = Number(match[2]);
  if (date < candidate.cutoffDate || date > candidate.today) return { eligible: false, reason: "outside sync window" };
  const frontmatter = parseFrontmatter(candidate.content);
  if (!frontmatter || typeof frontmatter.memo_id !== "string") return { eligible: false, reason: "missing memo identity" };
  if (frontmatter.timestamp !== timestamp || frontmatter.date !== date) return { eligible: false, reason: "metadata does not match path" };
  if (!Array.isArray(frontmatter.tags) || !frontmatter.tags.includes("memo") || !frontmatter.tags.includes("daily-record")) {
    return { eligible: false, reason: "not a managed memo note" };
  }
  if (frontmatter.source !== candidate.source) return { eligible: false, reason: "source mismatch" };
  return { eligible: true };
}

function parseFrontmatter(content: string): Record<string, unknown> | undefined {
  if (!content.startsWith("---\n")) return undefined;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return undefined;
  const parsed = YAML.parse(content.slice(4, end));
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
