# Serendipity Engine · Obsidian Plugin

<p align="center">
  <strong>🌐 Language / 语言：</strong>
  <a href="README.md">🇨🇳 简体中文</a> ·
  🇺🇸 <strong>English</strong>
</p>

> Graph roaming: bring the engine (seren) roaming into your Obsidian vault.
>
> White-box, local, pure native. The panel is a native Obsidian UI — the theme follows automatically and it adapts to narrow widths; click a card to continue roaming from that node.

[![Version](https://img.shields.io/badge/version-v0.2.0-7aa2f7)](https://github.com/heptaspirit/serendipity-obsidian/tags) [![License](https://img.shields.io/badge/License-MIT-9cf)](LICENSE) [![Obsidian](https://img.shields.io/badge/Obsidian-plugin-7aa2f7)](https://obsidian.md/) [![MCP Server](https://img.shields.io/badge/MCP%20Server-AI%20ready-7aa2f7)](https://github.com/heptaspirit/serendipity-obsidian) [![English](https://img.shields.io/badge/English-README.en-7aa2f7)](README.en.md) [![简体中文](https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-README-7aa2f7)](README.md)

## Features

- **Native panel**: search + 🎲 random roam, a popular-nodes bubble cloud, and result cards (click a card = continue roaming from that node; "Similar" opens a similarity modal; "Open" jumps back to the note); params & similar use native Obsidian modals
- **Current-node action bar**: after roaming, the main anchor gets a Preview/Similar/Relation action bar (mirrors the engine Web UI), with aliases preferred for the title
- **Engine control**: the toolbar can stop the engine (⏹), refresh the graph, and tune params; detects `seren.exe` / `seren` across platforms and sets the unix exec bit
- **Behavior digest**: a passive, non-popup status-bar reminder when the engine has a fresh touch digest; view it and export as a `serendipity-digest-*.md` note
- **MCP (AI)**: the settings page and panel status show the live embedded `/mcp` enable/disable state (with controls), plus a one-click copyable `mcpServers` (Streamable HTTP) config
- **Full UI**: the "Open engine full UI" command opens the engine Web UI in a browser (communities / export / params)

## Requires

- **Engine** `serendipity-engine ≥ v0.2.0` (a light client; the engine is not bundled)
- **Obsidian** ≥ v1.5.0

> **About versioning**: the plugin and engine use **independent version numbers** — the engine is a mature core (currently v0.2.0), and this plugin is a separately released new client (currently **v0.2.0**). The engine version is only a **compatibility floor**: on connect the plugin compares `stats.version` and only warns if the engine is **below v0.2.0** (missing endpoints such as `/api/mcp/*`).

## Install

1. Copy this repo into the Obsidian plugins folder: `<vault>/.obsidian/plugins/serendipity-engine/`
2. Obsidian Settings → Community plugins → enable **Serendipity Engine**; in its settings set the **engine core path** (or drop the engine binary in the plugin folder / add it to PATH)

> The plugin auto-detects the local engine service (`http://127.0.0.1:<port>`). If it isn't running, the panel shows a status page that distinguishes "engine executable not found" (a config issue) from "engine not running" (just click Start).

## Quick Start

Start the engine, then search / 🎲 random-roam in the panel; the panel's current-node bar covers Preview/Similar/Relation; more advanced features (communities / export / params) live in the engine Web UI via the "Open engine full UI" command.

## MCP (AI, rewritten as Streamable HTTP in v0.2.0)

Since v0.2.0 the MCP server is **embedded** in the engine `serve` process (endpoint `/mcp`; Web+REST+MCP in one), so a standalone `seren mcp` process is no longer needed. The settings page (or tapping the MCP status in the panel) shows the live `/mcp` enable/disable state (with controls) and a **one-click copy** of the `mcpServers` config, to paste into any MCP client (Codex / DeepSeek Harness / Claude Code / Cursor / others):

```json
{
  "mcpServers": {
    "seren": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8910/mcp",
      "headers": { "X-Seren-Token": "<token>" }
    }
  }
}
```

Read-only tools: `graph.stats / roam / random / relation / node / similar / community / touch_digest / state` (never writes touch, never triggers refresh — an AI session cannot mutate local state). The engine must be running and `/mcp` enabled.

## Development

```bash
npm install
npm run build   # produces main.js (release needs main.js / manifest.json / styles.css)
```

AI agents: read [AGENTS.md](AGENTS.md) first (orientation / repo map / dev red lines).

## Docs

| Doc | Description |
|---|---|
| [`docs/api-contract.md`](docs/api-contract.md) | API contract (plugin ↔ engine REST): auth, endpoints, versioning. The engine-side `docs/api-contract.md` is authoritative; the local type mirror is `src/seren-api.d.ts` |
| [`docs/architecture.md`](docs/architecture.md) | Plugin architecture: native panel, lifecycle, process management, extension points |
| [`docs/README.md`](docs/README.md) | Doc navigation |

## License

MIT License — see [LICENSE](LICENSE).
