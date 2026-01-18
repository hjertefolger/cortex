# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Cortex is a Claude Code plugin that provides persistent local memory with cross-session recall. It uses vector embeddings and hybrid search to store and retrieve meaningful context from past sessions.

**Key Features:**
- Automated context management with configurable thresholds
- Smart compaction: save, clear, and restore continuity
- MCP server exposing memory tools to Claude
- Session analytics and insights
- Colored statusline with progress bar

## Build Commands

```bash
npm install            # Install dependencies
npm run build          # Build both index.js and mcp-server.js
npm run build:index    # Build main entry point only
npm run build:mcp      # Build MCP server only
npm run typecheck      # Type check without emitting

# Test with sample stdin data
echo '{"cwd":"/home/user/project","context_window":{"used_percentage":45}}' | node dist/index.js stats
```

## Architecture

### Data Flow

```
Claude Code → stdin JSON → parse → command router → handler → stdout
                                        ↓
                               SQLite + Embeddings
                                        ↓
                              ~/.cortex/memory.db

MCP Client → JSON-RPC → mcp-server.js → tools → database
```

### Core Components

| File | Purpose |
|------|---------|
| `src/index.ts` | Command router and handlers |
| `src/mcp-server.ts` | MCP server exposing tools |
| `src/stdin.ts` | Parse Claude Code's JSON input |
| `src/types.ts` | TypeScript interfaces |
| `src/database.ts` | SQLite schema, queries, FTS5 |
| `src/embeddings.ts` | BGE model loading, vector generation |
| `src/search.ts` | Hybrid search (vector + keyword + RRF) |
| `src/archive.ts` | Transcript parsing, content extraction, restoration context |
| `src/config.ts` | Configuration management |
| `src/analytics.ts` | Session tracking and insights |

### Database Schema

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  content_hash TEXT UNIQUE,
  embedding BLOB NOT NULL,
  project_id TEXT,
  source_session TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE memories_fts USING fts5(content);
```

### Search Algorithm

1. **Vector Search**: Query embedding vs stored embeddings (cosine similarity)
2. **Keyword Search**: FTS5 full-text search on content
3. **RRF Fusion**: Reciprocal Rank Fusion with k=60
4. **Recency Decay**: 7-day half-life for time weighting
5. **Result**: Top 5 sorted by combined score

### Stdin Format (Claude Code)

The plugin receives JSON via stdin from Claude Code:

```json
{
  "cwd": "/path/to/project",
  "transcript_path": "/path/to/session.jsonl",
  "model": {
    "id": "claude-opus-4-5-20251101",
    "display_name": "Opus"
  },
  "context_window": {
    "context_window_size": 200000,
    "used_percentage": 45
  }
}
```

## Plugin Structure

```
cortex/
├── .claude-plugin/
│   └── plugin.json      # Plugin metadata
├── .mcp.json            # MCP server configuration
├── commands/
│   ├── setup.md         # /cortex-setup (legacy)
│   ├── save.md          # /save (legacy)
│   ├── recall.md        # /recall (legacy)
│   ├── stats.md         # /cortex-stats (legacy)
│   └── configure.md     # /cortex-configure (legacy)
├── skills/
│   ├── setup/SKILL.md   # Setup wizard
│   ├── configure/SKILL.md # Configuration
│   ├── stats/SKILL.md   # Statistics display
│   ├── recall/SKILL.md  # Memory search (model-invoked)
│   ├── save/SKILL.md    # Save context (model-invoked)
│   └── manage/SKILL.md  # Memory management
├── hooks/
│   └── hooks.json       # SessionStart, PostToolUse, PreCompact
├── src/                 # TypeScript source
├── dist/
│   ├── index.js         # Compiled entry point
│   ├── mcp-server.js    # MCP server
│   └── sql-wasm.wasm    # SQLite WebAssembly
└── package.json
```

## MCP Tools

The MCP server exposes these tools:

| Tool | Purpose | Permission |
|------|---------|------------|
| `cortex_recall` | Search memory | Read-only |
| `cortex_save` | Archive session | Safe |
| `cortex_stats` | Get statistics | Read-only |
| `cortex_restore` | Get restoration context | Read-only |
| `cortex_delete` | Delete memory fragment | **Requires confirmation** |
| `cortex_forget_project` | Delete project memories | **Requires confirmation** |
| `cortex_analytics` | Get usage analytics | Read-only |

## Hooks

| Hook | Trigger | Handler | Purpose |
|------|---------|---------|---------|
| `SessionStart` | New session | `session-start` | Show memory count, start analytics |
| `PostToolUse` | After any tool | `context-check` | Monitor context, auto-save/clear |
| `PreCompact` | Before compaction | `smart-compact` | Save + restoration context |

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
  "monitor": {
    "tokenThreshold": 70
  },
  "automation": {
    "autoSaveThreshold": 70,
    "autoClearThreshold": 80,
    "autoClearEnabled": false,
    "restorationTokenBudget": 1000,
    "restorationMessageCount": 5
  },
  "setup": {
    "completed": true,
    "completedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Automation Settings

- `autoSaveThreshold`: Context % to trigger auto-save (default: 70)
- `autoClearThreshold`: Context % to trigger auto-clear (default: 80)
- `autoClearEnabled`: Enable automatic context clear (default: false)
- `restorationTokenBudget`: Max tokens for restoration context (default: 1000)
- `restorationMessageCount`: Messages to restore after clear (default: 5)

## Analytics

Analytics are stored at `~/.cortex/analytics.json` and track:
- Session metrics (peak context, save points, recalls)
- Usage patterns
- Recommendations for optimization

## Dependencies

- **sql.js**: SQLite via WebAssembly (bundled)
- **@xenova/transformers**: ONNX embeddings (external)
- **@anthropic-ai/sdk**: API types (external)

## Development Notes

- Uses esbuild for bundling with external dependencies
- sql-wasm.wasm must be copied to dist/ during build
- Embedding model is downloaded on first use (~33MB)
- Database is persisted at ~/.cortex/memory.db
- Analytics are stored at ~/.cortex/analytics.json
