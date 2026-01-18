---
name: cortex:save
description: Archive current session to memory. Use before clearing or when context is high.
allowed-tools: mcp__cortex-memory__cortex_save, mcp__cortex-memory__cortex_archive, mcp__cortex-memory__cortex_remember
---

# Cortex Save

Archive context to Cortex memory.

## Two Ways to Save

### 1. Granular Saving: `cortex_remember`

Save a specific piece of information:

```
cortex_remember(
  content: "We decided to use JWT for authentication",
  context: "Security discussion"
)
```

**No transcript path needed** - just specify what to remember.

### 2. Session Archiving: `cortex_save`

Archive the entire session:

```
cortex_save(projectId: "cortex")
```

**How it works:**
- SessionStart hook saves the transcript path keyed by projectId
- MCP tool looks up the transcript path using projectId
- No manual path finding needed

**The projectId is the last segment of the working directory** (e.g., `/Users/me/projects/cortex` → `cortex`)

## When to Use

- **cortex_remember**: During conversation for important decisions/facts
- **cortex_save**: Before `/clear` or when context is high

## Parameters

### cortex_remember
- `content` (required): The content to remember
- `context` (optional): Why this is important

### cortex_save / cortex_archive
- `projectId` (required if no transcriptPath): Project identifier for session lookup
- `transcriptPath` (optional): Direct path to transcript file
- `global` (optional): Save as global memories
