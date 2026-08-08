# Enhanced Memos Sync

An Obsidian desktop plugin that synchronizes one Memos account into individual Markdown notes and embeds them in Daily Notes.

## Requirements

- Obsidian 1.6.6 or later on desktop.
- A Memos server URL and API token.
- Daily Notes or Periodic Notes when daily-note reconciliation is required.

## Configuration

Configure the account name, Memos server URL, API token, note folders, daily-note header, sync window, threading, attachments, and optional startup or periodic sync in the plugin settings.

This is a single-account plugin; it has no profile arrays or per-profile sync state. On Obsidian 1.11.4 and newer, a configured token is migrated to Obsidian Secret Storage. On older supported releases, the token remains in the plugin's persisted data and is shown in a password input for compatibility.

## Commands

- Smart Sync Memos
- Incremental Sync (New Only)
- Force Sync All Memos

## Privacy and network

The plugin contacts only the Memos server URL you configure. It sends no telemetry and does not send vault data to the plugin author.

## Conformance tests

| SPEC acceptance section | Acceptance suite |
| --- | --- |
| 10.1 Settings and lifecycle | [`tests/acceptance/settings-lifecycle.test.ts`](tests/acceptance/settings-lifecycle.test.ts) |
| 10.2 Commands and modes | [`tests/acceptance/commands-modes.test.ts`](tests/acceptance/commands-modes.test.ts) |
| 10.3 API and normalization | [`tests/acceptance/api-normalization.test.ts`](tests/acceptance/api-normalization.test.ts) |
| 10.4 Memo files and frontmatter | [`tests/acceptance/memo-files.test.ts`](tests/acceptance/memo-files.test.ts) |
| 10.5 Hashtags and todos | [`tests/acceptance/hashtags-todos.test.ts`](tests/acceptance/hashtags-todos.test.ts) |
| 10.6 Threads | [`tests/acceptance/threads.test.ts`](tests/acceptance/threads.test.ts) |
| 10.7 Resources and attachments | [`tests/acceptance/resources.test.ts`](tests/acceptance/resources.test.ts) |
| 10.8 Daily notes | [`tests/acceptance/daily-notes.test.ts`](tests/acceptance/daily-notes.test.ts) |
| 10.9 Reconciliation safety | [`tests/acceptance/reconciliation.test.ts`](tests/acceptance/reconciliation.test.ts) |
| Source-defect regressions | [`tests/acceptance/idempotency.test.ts`](tests/acceptance/idempotency.test.ts) |

## Build

```sh
bun install
bun run check
```

## Install into a test vault

Build the plugin, then copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/enhanced-memos-sync/` in a disposable test vault and enable it from Obsidian's Community Plugins settings.
