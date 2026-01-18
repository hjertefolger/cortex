---
name: cortex:save
description: Archive current session to memory. Use before clearing or when context is high.
allowed-tools: mcp__cortex-memory__cortex_save
---

# Cortex Save

Archive the current session to Cortex memory.

## When to Use

- Before running `/clear` to preserve context
- When context usage is high (>70%)
- User explicitly asks to save progress
- After completing a significant piece of work
- System indicates context threshold reached

## Usage

Use the `cortex_save` MCP tool:

```
cortex_save(transcriptPath: "/path/to/transcript.jsonl")
```

## Parameters

- `transcriptPath` (required): Path to the session transcript
- `projectId` (optional): Project ID for the memories
- `global` (optional): Save as global memories (not project-specific)

## Notes

- The transcript path is available in stdin from Claude Code
- Duplicate content is automatically detected and skipped
- Short or trivial content is filtered out
- Memories are associated with the current project by default
