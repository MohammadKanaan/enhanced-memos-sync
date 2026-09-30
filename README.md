# Enhanced Memos Sync

Bring your [Memos](https://github.com/usememos/memos) posts into Obsidian as Markdown notes, embedded in the Daily Note for the day you wrote them. Search and link them alongside your other notes.

- Keep replies with their parent memo or save them as separate notes.
- Download attached images into your vault, or skip them.
- Sync when you choose, on startup, or on a schedule.

## Get started

You need Obsidian 1.6.6 or later on desktop, a reachable Memos server, and an API token from **Memos > Settings > Access Tokens**. Enable Daily Notes or Periodic Notes in Obsidian; sync needs it to link memos by day.

1. Install **Enhanced Memos Sync** from **Settings > Community Plugins > Browse**. You can also build it as described in [Development](#development).
2. In the plugin settings, enter your Memos server URL and API token. Choose folders for notes and attachments if you don't want the defaults.
3. Click the ribbon button or run **Smart Sync Memos** from the command palette.

By default, the plugin syncs the last 30 days. Set **Sync-days limit** to `0` to include all memos. You can also turn on startup or periodic sync in settings.

## Choose a sync mode

- **Smart Sync Memos** runs a full sync the first time, then fetches new memos. The ribbon button and scheduled syncs use this mode.
- **Incremental Sync (New Only)** adds new memo notes without rewriting or deleting existing ones.
- **Force Sync All Memos** checks the full sync window for edits and deletions. It updates changed notes and moves eligible notes deleted from Memos to the trash.

Incremental sync adds embeds to Daily Notes without removing existing ones. Force sync updates the managed Daily Note section to match the server.

## Where your memos go

Memo notes are saved in `Memos/` by default, with names like `2026-01-20-1768867200.md`. Their frontmatter includes the memo ID, creation date, tags, source, and reply details when present, so you can query them with Dataview. Daily Notes embed the corresponding memo notes under a configurable heading.

## Privacy and troubleshooting

The plugin sends no telemetry or vault data to third parties. On Obsidian 1.11.4 and later, it stores your API token in Secret Storage; on older versions, the token is saved in the plugin's data.

If a sync fails, open the developer console with Ctrl/Cmd+Shift+I and look for `[Enhanced Memos Sync]`. Turn on **Debug logging** in settings for warnings and per-item details.

## Development

```sh
bun install
bun run check
```

Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/enhanced-memos-sync/` in your vault, and enable it.

Inspired by [yet-another-memos-sync](https://github.com/exusiaiwei/yet-another-memos-sync) by [@exusiaiwei](https://github.com/exusiaiwei).
