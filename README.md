# Enhanced Memos Sync

[Memos](https://github.com/usememos/memos) is a self-hosted, lightweight microblog. This plugin brings it into Obsidian: each memo becomes its own note, and the day's memos are linked inside your Daily Note.

## Features

- **Every memo becomes a note.** Each memo is saved as its own Markdown file in the folder you choose.
- **Memos land in your Daily Notes.** The day's memos appear under a header you configure, so your journal and your memos live in the same place.
- **Sync at your pace.** Smart Sync handles everyday use, Incremental Sync pulls in just the new stuff, and Force Sync reapplies edits and deletions from the server.
- **Conversations stay together.** Replies are kept, and you can fold comments into their parent memo's note.
- **Images come along.** Attachments are downloaded into a folder you pick and linked from your notes — or skipped entirely if you prefer.
- **Safe to run on autopilot.** Incremental syncs only ever add notes — they never rewrite or delete files you already have.
- **Runs itself if you want.** Sync on startup (with a delay and a "skip if synced today" option) or on a regular schedule.
- **Keep the vault tidy.** A sync-days limit controls how far back memos go; `0` means no limit.
- **Tokens stay safe.** On Obsidian 1.11.4+, your API token lives in Obsidian's Secret Storage; elsewhere it's masked in a password field.

## Getting started

### Requirements

- Obsidian 1.6.6 or later on desktop.
- A [Memos](https://github.com/usememos/memos) server you can reach over HTTP or HTTPS.
- An API token for that server (found in Memos under Settings > Access Tokens).
- The built-in Daily Notes or Periodic Notes plugin enabled (only needed if you want memos linked into your daily notes).

### Install

Once the plugin is listed in the Obsidian community directory, install it from **Settings > Community Plugins > Browse** and search for "Enhanced Memos Sync".

To install manually instead, build the plugin (see [Development](#development)), then copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/enhanced-memos-sync/` inside your vault and enable it under Community Plugins.

## Using the plugin

Once configured, run a sync from the ribbon button or one of three commands:

| Command                         | What it does                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Smart Sync Memos**            | Full sync on first run, then incremental. Used by the ribbon button and scheduled syncs.          |
| **Incremental Sync (New Only)** | Fetches only memos newer than the last sync. Adds new notes; never touches existing ones.         |
| **Force Sync All Memos**        | Re-fetches the whole sync window, rewrites changed notes, and applies remote edits and deletions. |

In settings you can set the account name, server URL, API token, folders for memo notes and attachments, daily-note header, sync window, threading, and startup or periodic sync. On Obsidian 1.11.4 and newer, a configured token moves to Secret Storage; on older releases it stays in the plugin's data, shown in a password input for compatibility.

### Comment-order regex

The **Comment-order regex** setting controls how replies are ordered when merged into a parent memo. Leave it blank for chronological order. The default `-- (\d+)/(\d+) --` extracts a numeric prefix from each comment's text and sorts by that value — useful if your Memos replies are tagged with sequence markers like `-- 1/5 --`, `-- 2/5 --`. If your replies don't use this convention, blank is fine.

## How notes are organized

Each memo is saved as a Markdown file named `YYYY-MM-DD-{timestamp}.md` in the folder you choose (default: `Memos`). The timestamp is the memo's Unix creation time, which keeps files unique and sortable. For example, a memo created on January 20, 2026 becomes `Memos/2026-01-20-1768867200.md`.

Every note starts with YAML frontmatter you can query with Dataview or other plugins:

```yaml
---
memo_id: memos/1768867200
created_at: "2026-01-20T00:00:00.000Z"
timestamp: 1768867200
date: 2026-01-20
tags:
  - memo
  - daily-record
  - Launch
source: "Default (https://memos.example)"
comment_count: 1
thread_ids:
  - memos/1768867201
---
```

- `memo_id` — the memo's ID on the Memos server.
- `created_at` / `timestamp` / `date` — the memo's creation time in ISO 8601, Unix seconds, and local date.
- `tags` — always includes `memo` and `daily-record`, plus any `#hashtags` found in the memo content.
- `source` — the account name and server URL this memo came from.
- `comment_count` / `thread_ids` — present only when the memo has replies.

When comments are merged into the parent (enable **Merge comments into parent** in settings), the reply text appears under a `## 💬 Comments` heading inside the same note. When merging is off, each comment is a standalone note with its own frontmatter.

In your Daily Notes, the plugin manages a section under the header you configure (default: `## 📓 Memos`). Each memo is embedded as a link:

```markdown
## 📓 Memos

![[2026-01-20-1768867200]]
![[2026-01-20-1768867201]]
```

Incremental syncs only add embeds — they never rewrite or remove existing ones. Force sync rebuilds the section from the server state.

## Privacy

The plugin only ever talks to the Memos server you configure. No telemetry, and no vault data sent anywhere else.

## Acknowledgements

Inspired by [yet-another-memos-sync](https://github.com/exusiaiwei/yet-another-memos-sync) by [@exusiaiwei](https://github.com/exusiaiwei).

## Development

```sh
bun install
bun run check
```
