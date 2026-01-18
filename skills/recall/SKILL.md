---
name: cortex:recall
description: Search local memory for past context. Use when user references past work or needs historical context.
allowed-tools: mcp__cortex-memory__cortex_recall
---

# Cortex Recall

Search Cortex memory for relevant past context.

## When to Use

- User asks about past work or decisions
- User references something from a previous session
- You need historical context about the project
- User says "remember when we..." or "what did we do about..."

## Usage

Use the `cortex_recall` MCP tool with a search query:

```
cortex_recall(query: "authentication implementation", limit: 5)
```

## Parameters

- `query` (required): Natural language search query
- `limit` (optional): Max results (default: 5)
- `includeAllProjects` (optional): Search across all projects
- `projectId` (optional): Specific project to search

## Notes

- Results are ranked by semantic similarity and recency
- More specific queries yield better results
- Use `includeAllProjects: true` if user asks about work from other projects
