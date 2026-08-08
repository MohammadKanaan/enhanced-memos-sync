import YAML from "yaml";

export interface DeletionCandidate {
  path: string;
  content: string;
  memoFolder: string;
  source: string;
  authoritativePaths: ReadonlySet<string>;
  /** Undefined means the configured sync window is unlimited. */
  cutoffDate?: string;
  today: string;
}

export function canTrashMemoNote(candidate: DeletionCandidate): { eligible: boolean; reason?: string } {
  const folder = normalizeVaultPath(candidate.memoFolder);
  const path = normalizeVaultPath(candidate.path);
  const match = path.match(new RegExp(`^${escapeRegex(folder)}/(\\d{4}-\\d{2}-\\d{2})-([1-9]\\d*)\\.md$`));
  if (!match) return { eligible: false, reason: "path is not a memo-folder direct child" };
  if ([...candidate.authoritativePaths].some((authoritativePath) => normalizeVaultPath(authoritativePath) === path)) {
    return { eligible: false, reason: "path is authoritative" };
  }
  const date = match[1]!;
  const timestamp = Number(match[2]);
  if (!isCalendarDate(date) || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return { eligible: false, reason: "path has invalid memo identity" };
  }
  if ((candidate.cutoffDate && date < candidate.cutoffDate) || date > candidate.today) return { eligible: false, reason: "outside sync window" };
  const frontmatter = parseFrontmatter(candidate.content);
  if (!frontmatter || !hasMemoIdentity(frontmatter.memo_id)) return { eligible: false, reason: "missing memo identity" };
  if (
    typeof frontmatter.timestamp !== "number" ||
    !Number.isSafeInteger(frontmatter.timestamp) ||
    frontmatter.timestamp <= 0 ||
    frontmatter.timestamp !== timestamp ||
    frontmatter.date !== date
  ) return { eligible: false, reason: "metadata does not match path" };
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
  try {
    const parsed = YAML.parse(content.slice(4, end));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeVaultPath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function hasMemoIdentity(value: unknown): boolean {
  return (typeof value === "string" && value.trim().length > 0) || (typeof value === "number" && Number.isFinite(value));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
