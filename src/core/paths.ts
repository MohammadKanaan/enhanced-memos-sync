export function buildMemoBasename(localDate: string, timestamp: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("Memo date must use YYYY-MM-DD.");
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Memo timestamp must be a positive integer.");
  }
  return `${localDate}-${timestamp}`;
}

export function buildMemoPath(folder: string, localDate: string, timestamp: number): string {
  return `${normalizeFolderPath(folder, "Memos")}/${buildMemoBasename(localDate, timestamp)}.md`;
}

export function normalizeFolderPath(input: string, fallback: string): string {
  const candidate = input.trim().replace(/\\/g, "/");
  const source = candidate.replace(/^\/+|\/+$/g, "") || fallback;
  const segments = source.split("/").filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Folder path contains a traversal segment.");
  }

  return segments.join("/");
}

export function sanitizeAttachmentFilenamePart(value: string): string {
  return value.replace(/[\\/?%*:|"<>]/g, "-");
}
