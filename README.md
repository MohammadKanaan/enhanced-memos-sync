# Enhanced Memos Sync

An Obsidian desktop plugin that synchronizes one Memos account into individual Markdown notes and embeds them in Daily Notes.

## Requirements

- Obsidian 1.6.6 or later on desktop.
- A Memos server URL and API token.
- Daily Notes or Periodic Notes when daily-note reconciliation is required.

## Configuration

Configure the account name, Memos server URL, API token, note folders, daily-note header, sync window, threading, attachments, and optional startup or periodic sync in the plugin settings.

## Commands

- Smart Sync Memos
- Incremental Sync (New Only)
- Force Sync All Memos

## Privacy and network

The plugin contacts only the Memos server URL you configure. It sends no telemetry and does not send vault data to the plugin author.

## Build

```sh
bun install
bun run check
```

## Install into a test vault

Build the plugin, then copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/enhanced-memos-sync/` in a disposable test vault and enable it from Obsidian's Community Plugins settings.
