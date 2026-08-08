import type { RemoteMemo } from "../../src/core/types";

export function memo(timestamp: number, overrides: Partial<RemoteMemo> = {}): RemoteMemo {
  return {
    name: `memos/${timestamp}`,
    content: `memo ${timestamp}`,
    createdTs: timestamp,
    ...overrides,
  };
}
