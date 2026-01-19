# Cortex v2.0

Persistent local memory for Claude Code. Longer sessions. Cross-session recall. Zero cloud.

**Pure TypeScript - no Python dependencies required.**

## Why Cortex?

| Problem | Solution |
|---------|----------|
| Session limits hit mid-task | Proactive warnings + auto-archive before threshold |
| `/clear` wipes everything | Memory survives in local SQLite |
| Re-explaining every session | `/cortex:recall` brings back context |
| Cloud memory concerns | SQLite file you own, backup, delete |

## Quick Start

```bash
git clone https://github.com/hjertefolger/cortex.git
cd cortex
npm install
npm run build
```

Add the plugin to Claude Code:
```bash
claude plugin add ./cortex
```

Then in Claude Code:
```
/cortex:setup
```

## Commands

| Command | Purpose |
|---------|---------|
| `/cortex:save` | Archive current session context |
| `/cortex:recall` | Search past memories |
| `/cortex:stats` | View memory statistics |
| `/cortex:configure` | Adjust settings |
| `/cortex:manage` | Delete/manage memories |

## MCP Tools

Claude can use these tools directly during conversation:

| Tool | Purpose |
|------|---------|
| `cortex_recall` | Search memory for relevant context |
| `cortex_remember` | Save a specific insight, decision, or fact |
| `cortex_save` | Archive entire session |
| `cortex_stats` | Get memory statistics |
| `cortex_restore` | Get restoration context after clear |
| `cortex_analytics` | View usage analytics |
| `cortex_delete` | Delete specific memory (requires confirmation) |
| `cortex_forget_project` | Delete all project memories (requires confirmation) |

### Key Distinction

- **`cortex_remember`**: Save specific facts during conversation (granular)
- **`cortex_save`**: Archive entire session transcript (bulk)

## How It Works

### Technology Stack

- **SQLite (sql.js)**: Pure JS database via WebAssembly
- **@xenova/transformers**: Quantized ONNX embeddings (BGE-small-en-v1.5, ~33MB)
- **Hybrid Search**: Vector similarity + FTS5 keyword matching + RRF fusion
- **Recency Decay**: 7-day half-life for time weighting

### Search Algorithm

1. Query embedding compared to stored embeddings (cosine similarity)
2. FTS5 full-text search on content
3. Reciprocal Rank Fusion (k=60) to combine results
4. Recency decay applied
5. Top results returned with scores

### Data Flow

```
Claude Code → stdin JSON → command router → handler → stdout
                                ↓
                       SQLite + Embeddings
                                ↓
                      ~/.cortex/memory.db

MCP Client → JSON-RPC → mcp-server.js → tools → database
```

## Features

### Statusline

Real-time memory stats in your Claude Code statusline:
```
[Cortex] 47 frags | my-project | Last: 2m ago
```

### Auto-Archive

Automatically archives context when thresholds are reached:
- `autoSaveThreshold`: When to auto-save (default: 70%)
- `autoClearThreshold`: When to auto-clear (default: 80%)
- `autoClearEnabled`: Toggle auto-clear (default: false)

### Smart Compaction

Before context compaction:
1. Saves current session to memory
2. Generates restoration context
3. Restores continuity after clear

### Configuration Presets

```
/cortex:configure full       # All features enabled
/cortex:configure essential  # Statusline + auto-archive
/cortex:configure minimal    # Commands only
```

## Configuration

Config file: `~/.cortex/config.json`

```json
{
  "statusline": {
    "enabled": true,
    "showFragments": true,
    "showLastArchive": true,
    "showContext": true,
    "contextWarningThreshold": 70
  },
  "archive": {
    "autoOnCompact": true,
    "projectScope": true,
    "minContentLength": 50
  },
  "automation": {
    "autoSaveThreshold": 70,
    "autoClearThreshold": 80,
    "autoClearEnabled": false,
    "restorationTokenBudget": 1000,
    "restorationMessageCount": 5
  }
}
```

## Architecture

```
cortex/
├── .claude-plugin/
│   └── plugin.json          # Plugin metadata
├── .mcp.json                 # MCP server configuration
├── skills/                   # User-invocable commands
│   ├── cortex-setup/
│   ├── cortex-configure/
│   ├── cortex-stats/
│   ├── cortex-recall/
│   ├── cortex-save/
│   └── cortex-manage/
├── hooks/
│   └── hooks.json            # SessionStart, PostToolUse, PreCompact
├── src/                      # TypeScript source
│   ├── index.ts              # Command router
│   ├── mcp-server.ts         # MCP server
│   ├── database.ts           # SQLite + FTS5
│   ├── embeddings.ts         # BGE model
│   ├── search.ts             # Hybrid search
│   ├── archive.ts            # Transcript parsing
│   ├── config.ts             # Configuration
│   └── analytics.ts          # Usage tracking
├── dist/
│   ├── index.js              # Compiled entry point
│   ├── mcp-server.js         # MCP server
│   └── sql-wasm.wasm         # SQLite WebAssembly
└── package.json
```

## Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `SessionStart` | New session | Show memory count, start analytics |
| `PostToolUse` | After any tool | Monitor context, auto-save/clear |
| `PreCompact` | Before compaction | Save + restoration context |

## Requirements

- Node.js 18+
- Claude Code v2.0.12+
- ~50MB disk space

## Data Location

All data stored locally in `~/.cortex/`:

| File | Purpose |
|------|---------|
| `memory.db` | SQLite database with embeddings |
| `config.json` | User configuration |
| `analytics.json` | Session tracking data |

## Development

```bash
npm install            # Install dependencies
npm run build          # Build everything
npm run build:index    # Build main entry point
npm run build:mcp      # Build MCP server
npm run typecheck      # Type check without emitting
npm test               # Run tests
```

## Author

**Tomas Krajcik**
- Website: [rootdeveloper.dev](https://rootdeveloper.dev)
- Email: support@rootdeveloper.dev

## License

MIT
