# Enhanced Memos Sync

This plugin brings Memos into Obsidian: each memo becomes its own note, and the day's memos are linked inside your Daily Note.

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

You'll need Obsidian 1.6.6 or later on desktop, a Memos server URL with an API token, and — if you want memos in your daily notes — the Daily Notes or Periodic Notes plugin.

To install, build the plugin (see [Development](#development)), copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/enhanced-memos-sync/` inside your vault, then enable **Enhanced Memos Sync** under Community Plugins.

## Using the plugin

Once configured, run a sync from the ribbon button or one of three commands:

| Command                         | What it does                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Smart Sync Memos**            | Full sync on first run, then incremental. Used by the ribbon button and scheduled syncs.          |
| **Incremental Sync (New Only)** | Fetches only memos newer than the last sync. Adds new notes; never touches existing ones.         |
| **Force Sync All Memos**        | Re-fetches the whole sync window, rewrites changed notes, and applies remote edits and deletions. |

In settings you can set the account name, server URL, API token, folders for memo notes and attachments, daily-note header, sync window, threading, and startup or periodic sync. On Obsidian 1.11.4 and newer, a configured token moves to Secret Storage; on older releases it stays in the plugin's data, shown in a password input for compatibility.

## Privacy

The plugin only ever talks to the Memos server you configure. No telemetry, and no vault data sent anywhere else.

## Development

```sh
bun install
bun run check
```
