import type { NormalizedMemo } from "../core/types";

export function orderComments(comments: NormalizedMemo[], pattern: string): NormalizedMemo[] {
  let regex: RegExp | undefined;
  if (pattern) {
    try {
      regex = new RegExp(pattern);
    } catch {
      regex = undefined;
    }
  }

  return comments
    .map((comment, index) => ({ comment, index, key: regex ? orderKey(regex, comment.content) : undefined }))
    .sort((left, right) => {
      if (left.key !== undefined && right.key !== undefined) {
        return left.key - right.key || left.comment.timestamp - right.comment.timestamp || left.index - right.index;
      }
      if (left.key !== undefined) return -1;
      if (right.key !== undefined) return 1;
      return left.comment.timestamp - right.comment.timestamp || left.index - right.index;
    })
    .map(({ comment }) => comment);
}

function orderKey(regex: RegExp, content: string): number | undefined {
  const match = regex.exec(content);
  const value = match?.[1];
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
