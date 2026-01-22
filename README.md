# Cortex

[![Version](https://img.shields.io/badge/version-2.0.3-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-187%20passing-success.svg)](#testing)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.json)

**Persistent local memory for Claude Code.** Longer sessions. Cross-session recall. Zero cloud.

```
Ψ 47 ●●○○○ 45%
✓ Autosaved
```

## Why Cortex?

| Problem | Cortex Solution |
|---------|-----------------|
| Session limits hit mid-task | Auto-save on context step (5%) & session end |
| `/clear` wipes everything | SQLite persistence survives clears |
| Re-explaining context every session | Hybrid search recalls relevant memories |
| Cloud memory privacy concerns | 100% local — `~/.cortex/memory.db` |

## Install

Inside a Claude Code instance:

**Step 1: Add the marketplace**
```
/plugin marketplace add hjertefolger/cortex
```

**Step 2: Install the plugin**

<details>
<summary><strong>Linux users: Click here first</strong></summary>

On Linux, `/tmp` is often a separate filesystem (tmpfs), which causes plugin installation to fail with:
```
EXDEV: cross-device link not permitted
```

**Fix**: Set TMPDIR before installing:
```bash
mkdir -p ~/.cache/tmp && TMPDIR=~/.cache/tmp claude
```

Then run the install command below in that session.

</details>

```
/plugin install cortex
```

**Step 3: Run the setup wizard**

Ask Claude to run the setup skill:
```
Please run /cortex-setup
```

The wizard will initialize the database, download the embedding model, and configure the statusline.

**Step 4: Customize settings**

Ask Claude to configure your preferences:
```
Please run /cortex-configure
```

Done! Restart Claude Code to activate the statusline.

## Statusline

The statusline is configured automatically by `/cortex-setup`. Restart Claude Code after setup to see it.

```
Ψ 47 ●●○○○ 45%
✓ Autosaved
```

**Line 1:**
- `Ψ` — Cortex identifier
- `47` — Memory fragment count for current project
- `●●○○○` — Context usage (filled/empty circles, color-coded)
- `45%` — Context percentage

**Line 2 (conditional):**
- `✓ Autosaved` — Transient success indicator (5s)
- `⠋ Saving` — Animated loader during background save

## Architecture

```
                           ┌──────────────────────────────────────┐
                           │           Claude Code                │
                           └──────────────┬───────────────────────┘
                                          │ stdin (JSON)
                           ┌──────────────▼───────────────────────┐
                           │         Command Router               │
                           │         (src/index.ts)               │
                           └──────────────┬───────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
   ┌──────────▼──────────┐    ┌──────────▼──────────┐    ┌──────────▼──────────┐
   │     Database        │    │     Embeddings      │    │      Search         │
   │   (sql.js/WASM)     │    │  (Nomic Embed v1.5) │    │  (Vector + FTS5)    │
   │   + FTS5 + Backup   │    │     768 dims        │    │    + RRF Fusion     │
   └──────────┬──────────┘    └──────────┬──────────┘    └──────────┬──────────┘
              │                           │                           │
              └───────────────────────────┼───────────────────────────┘
                                          │
                           ┌──────────────▼───────────────────────┐
                           │      ~/.cortex/memory.db             │
                           │      (SQLite + Embeddings)           │
                           └──────────────────────────────────────┘
```

### Module Overview

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `index.ts` | 836 | Command router, hooks, statusline |
| `mcp-server.ts` | 750 | MCP protocol, 8 tools exposed |
| `database.ts` | 1143 | SQLite, FTS5, backups, recovery |
| `archive.ts` | 873 | Transcript parsing, chunking |
| `embeddings.ts` | 337 | Nomic Embed v1.5, quantization |
| `search.ts` | 308 | Hybrid search, RRF fusion |
| `config.ts` | 563 | Zod validation, presets |
| `analytics.ts` | 288 | Session tracking, insights |

**Total: ~5,700 lines TypeScript**

## Search Algorithm

Cortex uses a hybrid search combining three signals:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Query: "auth flow"                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Vector  │    │  FTS5    │    │ Recency  │
   │  Search  │    │ Keyword  │    │  Decay   │
   │  (60%)   │    │  (40%)   │    │ (7-day)  │
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        │               │               │
        └───────────────┼───────────────┘
                        ▼
              ┌──────────────────┐
              │   RRF Fusion     │
              │    (k=60)        │
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │  Ranked Results  │
              └──────────────────┘
```

- **Vector similarity**: Cosine distance on 768-dim embeddings
- **FTS5 keyword**: BM25 ranking with sqlite full-text search
- **RRF fusion**: `1/(k + rank)` aggregation across both lists
- **Recency decay**: 7-day half-life weights recent memories higher

## Commands

### User-Invocable Skills

| Command | Purpose |
|---------|---------|
| `/cortex-setup` | First-time initialization wizard |
| `/cortex-save` | Archive current session to memory |
| `/cortex-recall <query>` | Search memories with hybrid search |
| `/cortex-stats` | Display memory statistics |
| `/cortex-configure <preset>` | Apply configuration preset |
| `/cortex-manage` | Delete or manage memories |

### MCP Tools (Claude-invocable)

| Tool | Purpose | Side Effects |
|------|---------|--------------|
| `cortex_recall` | Search memory | Read-only |
| `cortex_remember` | Save specific insight | Creates memory |
| `cortex_save` | Archive full session | Creates memories |
| `cortex_stats` | Get statistics | Read-only |
| `cortex_restore` | Get restoration context | Read-only |
| `cortex_analytics` | Usage insights | Read-only |
| `cortex_delete` | Delete memory | **Destructive** |
| `cortex_forget_project` | Delete project memories | **Destructive** |

#### `cortex_remember` vs `cortex_save`

```
cortex_remember("JWT refresh tokens must use httpOnly cookies")
  → Creates ONE memory fragment from the string

cortex_save()
  → Parses transcript, extracts HIGH-VALUE content, creates MULTIPLE fragments
```

## Hooks

| Hook | Trigger | Behavior |
|------|---------|----------|
| `SessionStart` | New session | Shows memory count, injects restoration context |
| `PostToolUse` | After any tool | Monitors context %, triggers auto-save |
| `PreCompact` | Before `/clear` | Archives session, prepares restoration |

## Configuration

**Location:** `~/.cortex/config.json`

```json
{
  "statusline": {
    "enabled": true,
    "showFragments": true,
    "showContext": true,
    "contextWarningThreshold": 70
  },
  "archive": {
    "autoOnCompact": true,
    "projectScope": true,
    "minContentLength": 50
  },
  "automation": {
    "autoSaveThreshold": 70,    // Legacy (fallback)
    "contextStep": {            // Primary Trigger
       "enabled": true,
       "step": 5
    },
    "autoClearThreshold": 80,
    "autoClearEnabled": false,
    "restorationTokenBudget": 1000,
    "restorationMessageCount": 5
  }
}
```

### Presets

```bash
/cortex-configure full       # All features (statusline, auto-archive, warnings)
/cortex-configure essential  # Statusline + auto-archive only
/cortex-configure minimal    # Commands only, no automation
```

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `autoSaveThreshold` | 70 | Context % to trigger auto-save |
| `autoClearThreshold` | 80 | Context % to suggest `/clear` |
| `autoClearEnabled` | false | Auto-clear without prompting |
| `restorationTokenBudget` | 1000 | Max tokens for restoration context |
| `restorationMessageCount` | 5 | Recent messages to restore |

## Database Schema

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  content_hash TEXT UNIQUE,        -- SHA256 for deduplication
  embedding BLOB NOT NULL,         -- 768 × float32 = 3KB
  project_id TEXT,                 -- NULL for global scope
  source_session TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memories_project_id ON memories(project_id);
CREATE INDEX idx_memories_timestamp ON memories(timestamp);
CREATE INDEX idx_memories_content_hash ON memories(content_hash);

-- Optional FTS5 (graceful fallback to LIKE if unavailable)
CREATE VIRTUAL TABLE memories_fts USING fts5(content);
```

### Backup Strategy

- **Auto-backup**: Created on database open
- **Rotation**: Keeps 5 most recent backups
- **Recovery**: Tests each backup until one validates
- **Atomic writes**: temp file + rename pattern

## Data Storage

```
~/.cortex/
├── memory.db              # SQLite database (~2-3MB per 1000 memories)
├── memory.db.backup.*     # Rotated backups (max 5)
├── config.json            # User configuration
├── analytics.json         # Session tracking
└── autoSaveState.json     # Transient state
```

## Testing

```bash
npm test
```

**187 tests** covering:
- Database CRUD, deduplication, recovery
- Vector and keyword search
- RRF fusion scoring
- Archive parsing and chunking
- MCP tool handlers
- Configuration validation

```
✔ Analytics Module (14 tests)
✔ Archive Module (10 tests)
✔ Config Module (5 tests)
✔ Database Module (30+ tests)
✔ Embeddings Module (8 tests)
✔ Search Module (31 tests)
✔ Integration Tests (20+ tests)
✔ MCP Tool Handlers (30+ tests)

ℹ tests 215
ℹ suites 12
ℹ pass 215
ℹ fail 0
ℹ duration_ms 338
```

## Development

```bash
npm install            # Install dependencies
npm run build          # Build index.js + mcp-server.js + copy WASM
npm run build:index    # Build main entry only
npm run build:mcp      # Build MCP server only
npm run typecheck      # TypeScript strict check
npm test               # Run test suite
```

### Build Output

```
dist/
├── index.js           # 302KB - Main entry point
├── mcp-server.js      # 277KB - MCP server
└── sql-wasm.wasm      # 660KB - SQLite WebAssembly
```

### Testing Commands Manually

```bash
# Test stats command
echo '{"cwd":"/tmp/test"}' | node dist/index.js stats

# Test recall
echo '{"cwd":"/tmp/test"}' | node dist/index.js recall "authentication"

# Test MCP server
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/mcp-server.js
```

## Performance

| Operation | Typical Latency |
|-----------|-----------------|
| Embedding generation | ~100ms |
| Vector search (1000 memories) | ~50ms |
| FTS5 keyword search | ~10ms |
| Hybrid search (combined) | ~100ms |
| Database insert | ~5ms + embedding |

**Memory footprint**: ~50MB base (includes Nomic Embed model)

## Requirements

- **Node.js**: ≥18.0.0
- **Claude Code**: ≥2.0.12
- **Disk**: ~50MB for model + database

## Error Handling

Cortex implements defensive error handling:

- **Database corruption**: Auto-recovery from rotated backups
- **FTS5 unavailable**: Graceful fallback to LIKE queries
- **Embedding failures**: Logged, operation continues
- **Stdin parse errors**: Discriminated union with context
- **Missing config**: Auto-created with defaults

## Security

- **Zero cloud**: All data local to `~/.cortex/`
- **No telemetry**: No external network calls
- **Plaintext storage**: Acceptable for local-only use
- **Deduplication**: SHA256 hash prevents duplicates

## Troubleshooting

### Database integrity check
```
/cortex-manage
```

### Reset to defaults
```bash
rm -rf ~/.cortex
/cortex-setup
```

### View raw database
```bash
sqlite3 ~/.cortex/memory.db "SELECT id, substr(content, 1, 50), timestamp FROM memories ORDER BY timestamp DESC LIMIT 10;"
```

### Check embedding model
```bash
ls -la ~/.cache/huggingface/hub/models--nomic-ai--nomic-embed-text-v1.5/
```

## License

MIT

## Author

**Tomas Krajcik**
- Website: [rootdeveloper.dev](https://rootdeveloper.dev)
- Email: support@rootdeveloper.dev

---

<p align="center">
  <i>Built for developers who value their context.</i>
</p>
