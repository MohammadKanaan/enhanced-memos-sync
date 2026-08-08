import type { NormalizedMemo } from "../core/types";

export interface MemoThread {
  parent: NormalizedMemo;
  comments: NormalizedMemo[];
}

export function associateThreads(memos: NormalizedMemo[], mergeComments: boolean): MemoThread[] {
  if (!mergeComments) {
    return memos.map((memo) => ({ parent: memo, comments: [] }));
  }

  const parents = memos.filter((memo) => !memo.parent);
  const commentsByParent = new Map<NormalizedMemo, NormalizedMemo[]>();
  const unattached: NormalizedMemo[] = [];

  for (const memo of memos) {
    if (!memo.parent) {
      continue;
    }
    const parent = findParent(memo, parents);
    if (!parent) {
      unattached.push(memo);
      continue;
    }
    const comments = commentsByParent.get(parent) ?? [];
    comments.push(memo);
    commentsByParent.set(parent, comments);
  }

  return [
    ...parents.map((parent) => ({ parent, comments: commentsByParent.get(parent) ?? [] })),
    ...unattached.map((parent) => ({ parent, comments: [] })),
  ];
}

function findParent(reply: NormalizedMemo, parents: NormalizedMemo[]): NormalizedMemo | undefined {
  const parentReference = reply.parent!;
  const exactName = parents.find((parent) => parent.source.name === parentReference);
  if (exactName) {
    return exactName;
  }

  const target = trailingSegment(parentReference);
  return parents.find((parent) => {
    const name = parent.source.name;
    return (
      (name !== undefined && trailingSegment(name) === target) ||
      trailingSegment(parent.id) === target ||
      String(parent.source.id ?? "") === target
    );
  });
}

function trailingSegment(value: string): string {
  const segments = value.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}
