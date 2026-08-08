import { extractHashtags } from "./hashtags";
import { extractUnknownFrontmatter, serializeUnknownFrontmatter } from "./frontmatter";
import type { NormalizedMemo } from "../core/types";
import type { MemoThread } from "../threads/associate";

export interface MemoRenderOptions {
  accountName: string;
  apiUrl: string;
  existingContent?: string;
  resourceMarkdown?: Map<string, string[]>;
}

export function renderMemoNote(thread: MemoThread, options: MemoRenderOptions): string {
  const { parent, comments } = thread;
  const tags = ["memo", "daily-record", ...extractHashtags(parent.content)];
  const lines = [
    "---",
    `memo_id: ${parent.id}`,
    `created_at: ${JSON.stringify(parent.createdAtIso)}`,
    `timestamp: ${parent.timestamp}`,
    `date: ${parent.localDate}`,
    "tags:",
    ...tags.map((tag) => `  - ${tag}`),
    `source: ${JSON.stringify(`${options.accountName} (${options.apiUrl})`)}`,
    ...(comments.length
      ? [
          `comment_count: ${comments.length}`,
          "thread_ids:",
          ...comments.map((comment) => `  - ${comment.id}`),
        ]
      : []),
    ...serializeUnknownFrontmatter(extractUnknownFrontmatter(options.existingContent)),
    "---",
    "",
    renderSegment(parent, options.resourceMarkdown),
  ];

  if (comments.length) {
    lines.push("", "---", "", "## 💬 Comments", "", ...comments.flatMap((comment, index) => [
      ...(index === 0 ? [] : [""]),
      renderSegment(comment, options.resourceMarkdown),
    ]));
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderSegment(memo: NormalizedMemo, resourceMarkdown: Map<string, string[]> | undefined): string {
  const body = memo.content.trim();
  const resources = resourceMarkdown?.get(memo.id) ?? [];
  return [body, ...resources].filter((value) => value.length > 0).join("\n");
}
