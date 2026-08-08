import YAML from "yaml";

const OWNED_FIELDS = new Set([
  "memo_id",
  "created_at",
  "timestamp",
  "date",
  "tags",
  "source",
  "comment_count",
  "thread_ids",
]);

export function extractUnknownFrontmatter(content: string | undefined): Record<string, unknown> {
  if (!content?.startsWith("---\n")) {
    return {};
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return {};
  }
  const parsed: unknown = YAML.parse(content.slice(4, end));
  if (!isRecord(parsed)) {
    return {};
  }
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => !OWNED_FIELDS.has(key)));
}

export function serializeUnknownFrontmatter(fields: Record<string, unknown>): string[] {
  if (Object.keys(fields).length === 0) {
    return [];
  }
  const serialized = YAML.stringify(fields).trimEnd();
  return serialized ? serialized.split("\n") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
