---
name: cortex-stats
description: Display Cortex memory statistics
allowed-tools: mcp__cortex-memory__cortex_stats, mcp__cortex-memory__cortex_analytics
user-invocable: true
---

# Cortex Stats

Display memory statistics and session analytics.

## What This Shows

- Total memory fragments stored
- Project-specific fragment counts
- Database size and age
- Session analytics and insights
- Usage patterns and recommendations

## Usage

When the user invokes `/cortex-stats`, retrieve and display:

1. **Memory Stats** using `cortex_stats`:
   - Total fragments, projects, sessions
   - Database size
   - Current project stats if applicable

2. **Analytics** using `cortex_analytics`:
   - Session patterns
   - Save/recall usage
   - Insights and recommendations

## Output Format

Present the information in a clear, readable format:

```
Cortex Memory Stats
-------------------
Total Fragments: 234
Projects: 5
Sessions: 47
DB Size: 2.3 MB

Current Project: cortex
  Fragments: 45
  Sessions: 12
  Last Save: 2h ago

This Week
---------
Sessions: 8
Fragments Created: 56
Recalls Used: 23

Insights
--------
- Your average save happens at 72% context
- 12 sessions used smart compaction
```
