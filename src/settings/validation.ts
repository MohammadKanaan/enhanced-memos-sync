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

export function validateNonNegativeInteger(
  input: string,
  previous: number,
): ValidationResult<number> {
  if (!/^\d+$/.test(input)) {
    return { value: previous, error: "Enter a non-negative whole number." };
  }

  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 0) {
    return { value: previous, error: "Enter a non-negative whole number." };
  }

  return { value };
}

export function normalizeFolder(input: string, fallback: string): string {
  const normalized = input.trim().replace(/^\/+|\/+$/g, "");
  return normalized || fallback;
}

export function normalizeHeader(input: string): string {
  return input.trim();
}

export function validateCommentOrderRegex(
  input: string,
  previous: string,
): ValidationResult<string> {
  if (input === "") {
    return { value: "" };
  }

  try {
    new RegExp(input);
    return { value: input };
  } catch {
    return { value: previous, error: "Enter a valid regular expression." };
  }
}
