export interface MockFile {
  path: string;
  extension?: string;
}

export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

export function requireApiVersion(_version: string): boolean {
  return false;
}

export const moment = (value: string) => ({
  format: (format: string) => (format === "YYYY-MM-DD" ? value : value),
});

export class Notice {
  constructor(_message: string) {}
}

export class Plugin {}
