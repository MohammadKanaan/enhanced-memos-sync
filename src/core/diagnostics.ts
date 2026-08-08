export const MAX_USER_ERROR_BODY_LENGTH = 500;

export function normalizeServerBody(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, MAX_USER_ERROR_BODY_LENGTH);
}

export function redactApiToken(value: string, token: string | undefined): string {
  if (!token) {
    return value;
  }
  return value.split(token).join("[REDACTED]");
}

export interface RedactedExternalErrorOptions {
  message: string;
  responseBody?: string;
  token?: string;
  cause?: unknown;
}

export class RedactedExternalError extends Error {
  readonly cause: unknown;
  readonly consoleMessage: string;

  constructor(message: string, consoleMessage: string, cause: unknown) {
    super(message);
    this.name = "RedactedExternalError";
    this.cause = cause;
    this.consoleMessage = consoleMessage;
  }
}

export function createRedactedExternalError(
  options: RedactedExternalErrorOptions,
): RedactedExternalError {
  const body = options.responseBody ? `: ${normalizeServerBody(options.responseBody)}` : "";
  const message = redactApiToken(`${options.message}${body}`, options.token);
  return new RedactedExternalError(message, message, options.cause);
}
