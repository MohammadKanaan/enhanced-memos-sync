export interface ValidationResult<T> {
  value: T;
  error?: string;
}

export function validateApiUrl(input: string, previous: string): ValidationResult<string> {
  const candidate = input.trim();

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    const normalized = candidate.replace(/\/+$/, "");
    if (normalized.length === 0) {
      throw new Error("empty URL");
    }

    return { value: normalized };
  } catch {
    return { value: previous, error: "Enter a valid HTTP or HTTPS URL." };
  }
}

/**
 * Upper bounds for numeric settings. Browser timers fire immediately once a
 * delay exceeds 2^31-1 ms, so scheduling values must stay well below that.
 * The sync-days limit stays under ~50 years so its cutoff never predates the
 * Unix epoch (which would silently mean "unlimited"); 0 is the explicit no-limit value.
 */
export const SETTING_MAXIMUMS = {
  syncDaysLimit: 18_250,
  startupDelaySeconds: 3_600,
  periodicSyncIntervalMinutes: 10_080,
} as const;

export function validateNonNegativeInteger(
  input: string,
  previous: number,
  maximum: number = Number.MAX_SAFE_INTEGER,
): ValidationResult<number> {
  if (!/^\d+$/.test(input.trim())) {
    return { value: previous, error: "Enter a non-negative whole number." };
  }

  const value = Number(input.trim());
  if (!Number.isSafeInteger(value) || value < 0) {
    return { value: previous, error: "Enter a non-negative whole number." };
  }
  if (value > maximum) {
    return { value: previous, error: `Enter a whole number no greater than ${maximum}.` };
  }

  return { value };
}

export function validateAccountName(input: string, previous: string): ValidationResult<string> {
  const value = input.trim();
  return value ? { value } : { value: previous, error: "Enter a name." };
}

export function normalizeFolder(input: string, fallback: string): string {
  return normalizeFolderPath(input, fallback);
}

export function validateFolder(
  input: string,
  previous: string,
  fallback: string,
): ValidationResult<string> {
  try {
    return { value: normalizeFolder(input, fallback) };
  } catch {
    return { value: previous, error: "Folder paths cannot contain traversal segments." };
  }
}

export function normalizeHeader(input: string): string {
  return input.trim();
}

export function validateHeader(input: string, previous: string): ValidationResult<string> {
  const value = normalizeHeader(input);
  return /^#*$/.test(value) ? { value: previous, error: "Enter a heading." } : { value };
}

export function validateCommentOrderRegex(
  input: string,
  previous: string,
): ValidationResult<string> {
  if (input.trim() === "") {
    return { value: "" };
  }

  try {
    new RegExp(input);
    return { value: input };
  } catch {
    return { value: previous, error: "Enter a valid regular expression." };
  }
}
import { normalizeFolderPath } from "../core/paths";
