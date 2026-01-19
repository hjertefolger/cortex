---
name: cortex-setup
description: Initialize Cortex for first-time use
allowed-tools: Bash, Write, Read, AskUserQuestion
user-invocable: true
---

# Cortex Setup Wizard

Initialize Cortex for first-time use. This wizard helps configure Cortex based on user preferences.

## Prerequisites Check

Before starting, verify:
1. Node.js 18+ is installed
2. The plugin directory exists

## Setup Steps

### 1. Create Data Directory

Create `~/.cortex` directory if it doesn't exist.

### 2. Initialize Database

Run the Cortex setup command to initialize the database:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/index.js setup
```

### 3. Configure Preferences

Ask the user about their preferences using AskUserQuestion:

**Question 1: Auto-save threshold**
- When should Cortex auto-save context?
- Options: 60% (eager), 70% (recommended), 80% (conservative)

**Question 2: Auto-clear**
- Should Cortex automatically clear context after saving?
- Options: Yes (auto-clear enabled), No (manual clear only)

**Question 3: Auto-clear threshold** (if auto-clear enabled)
- At what context % should auto-clear trigger?
- Options: 75%, 80% (recommended), 85%

### 4. Apply Configuration

Based on user responses, update `~/.cortex/config.json`:

```json
{
  "automation": {
    "autoSaveThreshold": <selected>,
    "autoClearEnabled": <selected>,
    "autoClearThreshold": <selected>
  },
  "setup": {
    "completed": true,
    "completedAt": "<timestamp>"
  }
}
```

### 5. Configure StatusLine (Optional)

Ask if user wants to enable the status line, then update `~/.claude/settings.json` to add:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/cortex/dist/index.js statusline"
  }
}
```

### 6. Complete Setup

Confirm setup is complete and show next steps:

- Use `/cortex-save` to archive context
- Use recall tool for past context
- Use `/cortex-configure` to adjust settings later

## Important Notes

- This wizard should only run once (first time setup)
- After setup, use `/cortex-configure` for adjustments
- All data is stored locally in `~/.cortex`
