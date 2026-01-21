/**
 * Cortex v2.0 - Main Entry Point
 * Handles statusline display, CLI commands, and hook events
 */

import { readStdin, getProjectId, getContextPercent, formatDuration } from './stdin.js';
import { loadConfig, ensureDataDir, applyPreset, getDataDir, isSetupComplete, markSetupComplete, saveCurrentSession, shouldAutoSave, markAutoSaved, resetAutoSaveState, loadAutoSaveState, markWarningThresholdReached, type ConfigPreset } from './config.js';
import { initDb, getStats, getProjectStats, formatBytes, closeDb, saveDb, searchByVector, validateDatabase, isFts5Enabled, getBackupFiles } from './database.js';
import { verifyModel, getModelName, embedQuery } from './embeddings.js';
import { hybridSearch, formatSearchResults } from './search.js';
import { archiveSession, formatArchiveResult, buildRestorationContext, formatRestorationContext } from './archive.js';
import { startSession, updateContextPercent, recordSavePoint, recordClear, getCurrentSession } from './analytics.js';
import type { StdinData, CommandName } from './types.js';

// ============================================================================
// ANSI Colors for Terminal Output
// ============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;2;72;150;140m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  darkGray: '\x1b[38;5;240m',        // Darker grey for separators
  brick: '\x1b[38;2;217;119;87m',    // Claude terracotta/brick #D97757
};

// ============================================================================
// Command Router
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] as CommandName | undefined;

  try {
    switch (command) {
      case 'statusline':
        await handleStatusline();
        break;

      case 'session-start':
        await handleSessionStart();
        break;

      case 'monitor':
        await handleMonitor();
        break;

      case 'context-check':
        await handleContextCheck();
        break;

      case 'clear-reminder':
        await handleClearReminder();
        break;

      case 'pre-compact':
        await handlePreCompact();
        break;

      case 'smart-compact':
        await handleSmartCompact();
        break;

      case 'save':
      case 'archive':
        await handleSave(args.slice(1));
        break;

      case 'recall':
      case 'search':
        await handleRecall(args.slice(1));
        break;

      case 'stats':
        await handleStats();
        break;

      case 'setup':
        await handleSetup();
        break;

      case 'configure':
        await handleConfigure(args.slice(1));
        break;

      case 'test-embed':
        await handleTestEmbed(args[1] || 'hello world');
        break;

      case 'check-db':
        await handleCheckDb();
        break;

      default:
        // Default: show statusline if no command
        await handleStatusline();
        break;
    }
  } catch (error) {
    console.error(`[Cortex Error] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    closeDb();
  }
}

// ============================================================================
// Statusline Handler
// ============================================================================

async function handleStatusline() {
  const stdin = await readStdin();
  const config = loadConfig();

  // Initialize database (may create if doesn't exist)
  const db = await initDb();

  // Track context and check thresholds (always needed for auto-save)
  let contextPercent = 0;
  let projectId: string | null = null;

  if (stdin?.cwd) {
    projectId = getProjectId(stdin.cwd);
    contextPercent = getContextPercent(stdin);
  }

  // === Statusline display (only if enabled) ===
  if (config.statusline.enabled) {
    const stats = getStats(db);
    const parts: string[] = [`${ANSI.brick}∿∿${ANSI.reset}`];

    // Memory count
    if (config.statusline.showFragments) {
      parts.push(`${stats.fragmentCount}`);
    }

    // Context usage with circle strip
    if (config.statusline.showContext) {
      const contextStrip = createContextStrip(contextPercent);
      parts.push(contextStrip);
    }

    // Output main statusline (no separators)
    console.log(parts.join(' '));

    // Line 2: Persistent indicators (shows until /clear)
    const autoSaveState = loadAutoSaveState();
    const warningThreshold = config.statusline.contextWarningThreshold;

    if (autoSaveState.hasSavedThisSession) {
      // Autosave message takes priority
      console.log(`${ANSI.green}✓ Autosaved${ANSI.reset} ${ANSI.yellow}⚠ Run /clear${ANSI.reset}`);
    } else if (warningThreshold > 0 && contextPercent >= warningThreshold) {
      // Context warning (only if threshold is set and not yet autosaved)
      if (!autoSaveState.hasReachedWarningThreshold) {
        markWarningThresholdReached(contextPercent);
      }
      console.log(`${ANSI.yellow}⚠ Context at ${contextPercent}%. Run /clear${ANSI.reset}`);
    } else if (autoSaveState.hasReachedWarningThreshold && !autoSaveState.hasSavedThisSession) {
      // Keep showing warning persistently even if context drops
      console.log(`${ANSI.yellow}⚠ Context at ${autoSaveState.warningContextPercent}%. Run /clear${ANSI.reset}`);
    }
  }

  // === Auto-save logic (runs after statusline display) ===
  if (contextPercent > 0 && config.automation.autoClearEnabled) {
    const transcriptPath = stdin?.transcript_path || null;

    // Check if we should auto-save
    if (shouldAutoSave(contextPercent, transcriptPath, config.automation.autoSaveThreshold)) {
      // Track in analytics
      updateContextPercent(contextPercent);

      if (transcriptPath) {
        // Perform auto-save (silent - only output result)

        const result = await archiveSession(db, transcriptPath, projectId);

        if (result.archived > 0) {
          recordSavePoint(contextPercent, result.archived);
          markAutoSaved(transcriptPath, contextPercent);
          // Brief message - restoration context will show on /clear via PreCompact hook
          console.log(`${ANSI.yellow}[Cortex]${ANSI.reset} Auto-saved ${result.archived} fragments. Run ${ANSI.cyan}/clear${ANSI.reset} to continue.`);
        } else {
          // No new content to save, but mark as saved to avoid retrying
          markAutoSaved(transcriptPath, contextPercent);
        }
      }
      // Silent if no transcript - nothing we can do
    }
  }
}

/**
 * Create a context strip with 5 circles (each = 20%)
 * ● = filled, ○ = empty
 * Color: brick (<70%), yellow (70-84%), red (>=85%)
 */
function createContextStrip(percent: number): string {
  const totalCircles = 5;
  const filled = Math.round((percent / 100) * totalCircles);
  const empty = totalCircles - filled;

  // Color based on percentage: brick → yellow → red
  let color: string;
  if (percent < 70) {
    color = ANSI.brick;
  } else if (percent < 85) {
    color = ANSI.yellow;
  } else {
    color = ANSI.red;
  }

  const filledCircles = '●'.repeat(filled);
  const emptyCircles = '○'.repeat(empty);

  return `${color}${filledCircles}${ANSI.dim}${emptyCircles}${ANSI.reset} ${percent}%`;
}

// ============================================================================
// Hook Handlers
// ============================================================================

async function handleSessionStart() {
  const stdin = await readStdin();
  const config = loadConfig();

  // Check if setup is completed
  if (!config.setup.completed) {
    console.log(`${ANSI.yellow}[Cortex]${ANSI.reset} First run detected. Run ${ANSI.cyan}/cortex:setup${ANSI.reset} to initialize.`);
    return;
  }

  // Reset auto-save state for new session
  resetAutoSaveState();

  // Initialize database
  const db = await initDb();

  const projectId = stdin?.cwd ? getProjectId(stdin.cwd) : null;

  // Save current session info for MCP tools to use
  if (stdin?.transcript_path) {
    saveCurrentSession(stdin.transcript_path, projectId);
  }

  // Start analytics session
  startSession(projectId);

  // Get project stats
  const projectStats = projectId ? getProjectStats(db, projectId) : null;

  if (projectStats && projectStats.fragmentCount > 0) {
    // Build full restoration context for Claude
    const restoration = await buildRestorationContext(db, projectId, {
      messageCount: config.automation.restorationMessageCount,
      tokenBudget: config.automation.restorationTokenBudget,
    });

    console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} ${projectStats.fragmentCount} memories for ${ANSI.bold}${projectId}${ANSI.reset}`);

    if (restoration.hasContent) {
      console.log('');
      console.log(`${ANSI.dim}--- Restoration Context ---${ANSI.reset}`);
      console.log(formatRestorationContext(restoration));
      console.log(`${ANSI.dim}---------------------------${ANSI.reset}`);
    }
  } else if (projectId) {
    console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} Ready for ${ANSI.bold}${projectId}${ANSI.reset} (no memories yet)`);
  } else {
    console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} Session started`);
  }
}

async function handleMonitor() {
  const stdin = await readStdin();
  const config = loadConfig();

  if (!stdin) return;

  // Check if context usage is above threshold
  const contextPercent = getContextPercent(stdin);

  // Track context usage in analytics
  updateContextPercent(contextPercent);

  if (contextPercent >= config.monitor.tokenThreshold) {
    console.log(`${ANSI.yellow}[Cortex]${ANSI.reset} Context at ${contextPercent}% - consider archiving with /cortex:save`);
  }
}

/**
 * Clear reminder handler - lightweight PostToolUse hook
 * Just checks if auto-save happened and reminds Claude to suggest /clear
 * Outputs JSON with additionalContext so Claude sees the message
 */
async function handleClearReminder() {
  const stdin = await readStdin();
  const config = loadConfig();

  if (!stdin || !config.automation.autoClearEnabled) return;

  const state = loadAutoSaveState();

  // If auto-save happened this session, remind Claude via JSON output
  if (state.hasSavedThisSession) {
    const contextPercent = getContextPercent(stdin);
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `[Cortex] Session auto-saved at ${state.lastAutoSaveContext}% context. Tell the user: "Your session has been auto-saved. Run /clear when ready to free up context - restoration context will help continue where we left off."`
      }
    };
    console.log(JSON.stringify(output));
  }
}

/**
 * Context check handler - called by PostToolUse hook
 * Triggers auto-save/auto-clear based on configured thresholds
 */
async function handleContextCheck() {
  const stdin = await readStdin();
  const config = loadConfig();

  if (!stdin) return;

  const contextPercent = getContextPercent(stdin);

  // Track in analytics
  updateContextPercent(contextPercent);

  // Check for auto-clear threshold (higher priority)
  if (contextPercent >= config.automation.autoClearThreshold && config.automation.autoClearEnabled) {
    console.log(`${ANSI.yellow}[Cortex]${ANSI.reset} Context at ${contextPercent}%. Triggering smart compaction...`);
    await handleSmartCompact();
    return;
  }

  // Check for auto-save threshold
  if (contextPercent >= config.automation.autoSaveThreshold) {
    const db = await initDb();
    const projectId = stdin.cwd ? getProjectId(stdin.cwd) : null;

    if (stdin.transcript_path) {
      console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} Context at ${contextPercent}%. Auto-saving...`);

      const result = await archiveSession(db, stdin.transcript_path, projectId);

      if (result.archived > 0) {
        recordSavePoint(contextPercent, result.archived);
        console.log(`${ANSI.green}[Cortex]${ANSI.reset} Auto-saved ${result.archived} fragments`);
      }
    }
  }
  // Otherwise: silent (no output to avoid noise)
}

/**
 * Smart compaction handler
 * Saves context, clears, and provides restoration context
 */
async function handleSmartCompact() {
  const stdin = await readStdin();
  const config = loadConfig();

  if (!stdin?.transcript_path) {
    console.log(`${ANSI.red}[Cortex]${ANSI.reset} No transcript available for compaction`);
    return;
  }

  const db = await initDb();
  const projectId = stdin.cwd ? getProjectId(stdin.cwd) : null;
  const contextPercent = getContextPercent(stdin);

  // 1. Save current session
  console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} Smart compaction starting...`);

  const result = await archiveSession(db, stdin.transcript_path, projectId, {
    onProgress: (current, total) => {
      process.stdout.write(`\r${ANSI.dim}[Cortex] Archiving ${current}/${total}...${ANSI.reset}`);
    },
  });

  console.log(''); // Clear progress line

  if (result.archived > 0) {
    recordSavePoint(contextPercent, result.archived);
    console.log(`${ANSI.green}[Cortex]${ANSI.reset} Archived ${result.archived} fragments`);
  }

  // 2. Build restoration context
  const restoration = await buildRestorationContext(db, projectId, {
    messageCount: config.automation.restorationMessageCount,
    tokenBudget: config.automation.restorationTokenBudget,
  });

  // 3. Record the clear
  recordClear();

  // 4. Output restoration context for Claude to see after clear
  console.log('');
  console.log(`${ANSI.cyan}=== Restoration Context ===${ANSI.reset}`);
  console.log(formatRestorationContext(restoration));
  console.log(`${ANSI.cyan}===========================${ANSI.reset}`);
  console.log('');
  console.log(`${ANSI.dim}Context saved and ready for clear. Use /clear to proceed.${ANSI.reset}`);
}

async function handlePreCompact() {
  const stdin = await readStdin();
  const config = loadConfig();

  // Clear the persistent save notification (user is running /clear)
  resetAutoSaveState();

  if (!config.archive.autoOnCompact) {
    return;
  }

  if (!stdin?.transcript_path) {
    console.log('[Cortex] No transcript available for archiving');
    return;
  }

  const db = await initDb();
  const projectId = config.archive.projectScope && stdin.cwd
    ? getProjectId(stdin.cwd)
    : null;

  console.log('[Cortex] Auto-archiving before compact...');

  const result = await archiveSession(db, stdin.transcript_path, projectId, {
    onProgress: (current, total) => {
      process.stdout.write(`\r[Cortex] Embedding ${current}/${total}...`);
    },
  });

  console.log('');
  console.log(`[Cortex] Archived ${result.archived} fragments (${result.duplicates} duplicates skipped)`);
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleSave(args: string[]) {
  const stdin = await readStdin();
  const config = loadConfig();

  // Parse arguments
  let transcriptPath = '';
  let forceGlobal = false;

  for (const arg of args) {
    if (arg === '--all' || arg === '--global') {
      forceGlobal = true;
    } else if (arg.startsWith('--transcript=')) {
      transcriptPath = arg.slice('--transcript='.length);
    } else if (!arg.startsWith('--')) {
      transcriptPath = arg;
    }
  }

  // Get transcript path from stdin if not provided
  if (!transcriptPath && stdin?.transcript_path) {
    transcriptPath = stdin.transcript_path;
  }

  if (!transcriptPath) {
    console.log('Usage: cortex save [--transcript=PATH] [--global]');
    console.log('       Or pipe stdin data from Claude Code');
    return;
  }

  const db = await initDb();
  const projectId = forceGlobal
    ? null
    : config.archive.projectScope && stdin?.cwd
      ? getProjectId(stdin.cwd)
      : null;

  console.log(`[Cortex] Archiving session${projectId ? ` to ${projectId}` : ' (global)'}...`);

  const result = await archiveSession(db, transcriptPath, projectId, {
    onProgress: (current, total) => {
      process.stdout.write(`\r[Cortex] Processing ${current}/${total}...`);
    },
  });

  console.log('');
  console.log(formatArchiveResult(result));
}

async function handleRecall(args: string[]) {
  const stdin = await readStdin();

  // Parse arguments
  let query = '';
  let includeAll = false;

  for (const arg of args) {
    if (arg === '--all' || arg === '--global') {
      includeAll = true;
    } else if (!arg.startsWith('--')) {
      query += (query ? ' ' : '') + arg;
    }
  }

  if (!query) {
    console.log('Usage: cortex recall <query> [--all]');
    console.log('       --all: Search across all projects');
    return;
  }

  const db = await initDb();
  const projectId = stdin?.cwd ? getProjectId(stdin.cwd) : null;

  console.log(`[Cortex] Searching${includeAll ? ' all projects' : projectId ? ` in ${projectId}` : ''}...`);

  const results = await hybridSearch(db, query, {
    projectScope: !includeAll,
    projectId: projectId || undefined,
    includeAllProjects: includeAll,
    limit: 5,
  });

  console.log(formatSearchResults(results));
}

async function handleStats() {
  const stdin = await readStdin();
  const db = await initDb();
  const stats = getStats(db);

  const lines: string[] = [];
  lines.push('');
  lines.push('Cortex Memory Stats');
  lines.push('------------------------');
  lines.push(`  Fragments: ${stats.fragmentCount}`);
  lines.push(`  Projects:  ${stats.projectCount}`);
  lines.push(`  Sessions:  ${stats.sessionCount}`);
  lines.push(`  DB Size:   ${formatBytes(stats.dbSizeBytes)}`);
  lines.push(`  Model:     ${getModelName()}`);

  if (stats.oldestTimestamp) {
    lines.push(`  Oldest:    ${stats.oldestTimestamp.toLocaleDateString()}`);
  }

  if (stats.newestTimestamp) {
    lines.push(`  Newest:    ${stats.newestTimestamp.toLocaleDateString()}`);
  }

  // Project-specific stats if we have stdin
  if (stdin?.cwd) {
    const projectId = getProjectId(stdin.cwd);
    const projectStats = getProjectStats(db, projectId);

    lines.push('');
    lines.push(`Project: ${projectId}`);
    lines.push(`  Fragments: ${projectStats.fragmentCount}`);
    lines.push(`  Sessions:  ${projectStats.sessionCount}`);

    if (projectStats.lastArchive) {
      lines.push(`  Last Save: ${formatDuration(projectStats.lastArchive)}`);
    }
  }

  console.log(lines.join('\n'));
}

async function handleSetup() {
  console.log('[Cortex] Setting up Cortex...');

  // Ensure data directory exists
  ensureDataDir();
  console.log(`  ✓ Data directory: ${getDataDir()}`);

  // Initialize database
  const db = await initDb();
  saveDb(db);
  console.log('  ✓ Database initialized');

  // Check and install dependencies if needed
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const pluginDir = new URL('.', import.meta.url).pathname.replace('/dist/', '');
  const nodeModulesPath = `${pluginDir}/node_modules`;

  if (!fs.existsSync(nodeModulesPath)) {
    console.log('  ⏳ Installing dependencies (first run only)...');

    const { execSync } = await import('child_process');
    try {
      execSync('npm install', {
        cwd: pluginDir,
        stdio: 'pipe',
        timeout: 120000
      });
      console.log('  ✓ Dependencies installed');
    } catch (installError) {
      console.log(`  ✗ Install failed: ${installError instanceof Error ? installError.message : String(installError)}`);
      console.log('');
      console.log('Manual fix:');
      console.log(`  cd ${pluginDir} && npm install`);
      return;
    }
  }

  // Verify embedding model
  console.log('  ⏳ Loading embedding model (first run may take a minute)...');
  const modelStatus = await verifyModel();

  if (modelStatus.success) {
    console.log(`  ✓ Model loaded: ${modelStatus.model} (${modelStatus.dimensions}d)`);
  } else {
    console.log(`  ✗ Model failed: ${modelStatus.error}`);
    return;
  }

  // Configure statusline in ~/.claude/settings.json
  console.log('  ⏳ Configuring statusline...');
  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeSettingsPath = path.join(claudeDir, 'settings.json');

  // Ensure .claude directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // Load existing settings or create new
  let claudeSettings: Record<string, unknown> = {};
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
    } catch {
      // If parsing fails, start fresh
      claudeSettings = {};
    }
  }

  // Get plugin path - use CLAUDE_PLUGIN_ROOT env var or derive from current location
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || pluginDir;

  // Set statusline command
  claudeSettings.statusLine = {
    type: 'command',
    command: `node ${pluginRoot}/dist/index.js statusline`
  };

  // Write settings
  fs.writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2), 'utf8');
  console.log('  ✓ Statusline configured');

  // Mark setup as complete
  markSetupComplete();
  console.log('  ✓ Setup marked complete');

  // Save current session so MCP tools can access transcript path
  const stdin = await readStdin();
  if (stdin?.transcript_path) {
    const projectId = stdin.cwd ? getProjectId(stdin.cwd) : null;
    saveCurrentSession(stdin.transcript_path, projectId);
    console.log('  ✓ Session registered');
  }

  console.log('');
  console.log('[Cortex] Setup complete!');
  console.log('');
  console.log(`${ANSI.yellow}Important: Restart Claude Code to activate the statusline${ANSI.reset}`);
  console.log('');
  console.log('Commands available:');
  console.log('  /cortex:save     - Archive session context');
  console.log('  /cortex:recall   - Search memories');
  console.log('  /cortex:stats    - View memory statistics');
  console.log('  /cortex:configure - Adjust settings');
}

async function handleConfigure(args: string[]) {
  const preset = args[0] as ConfigPreset | undefined;

  if (preset && ['full', 'essential', 'minimal'].includes(preset)) {
    const config = applyPreset(preset);
    console.log(`[Cortex] Applied "${preset}" preset`);
    console.log('');
    console.log('Configuration:');
    console.log(`  Statusline: ${config.statusline.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  Auto-archive: ${config.archive.autoOnCompact ? 'enabled' : 'disabled'}`);
    console.log(`  Context warning: ${config.statusline.contextWarningThreshold}%`);
    return;
  }

  console.log('Usage: cortex configure <preset>');
  console.log('');
  console.log('Presets:');
  console.log('  full      - All features enabled (statusline, auto-archive, warnings)');
  console.log('  essential - Statusline + auto-archive only');
  console.log('  minimal   - Commands only (no hooks/statusline)');
}

async function handleTestEmbed(text: string) {
  console.log(`[Cortex] Testing embedding for: "${text}"`);

  const result = await verifyModel();

  if (result.success) {
    console.log(`  Model: ${result.model}`);
    console.log(`  Dimensions: ${result.dimensions}`);
    console.log('  ✓ Embedding generation working');
  } else {
    console.log(`  ✗ Error: ${result.error}`);
  }
}

async function handleCheckDb() {
  console.log('[Cortex] Database Integrity Check');
  console.log('================================');

  let hasErrors = false;

  try {
    const db = await initDb();
    const validation = validateDatabase(db);

    // Schema validation
    console.log('');
    console.log('Schema Validation:');
    if (validation.tablesFound.length > 0) {
      console.log(`  Tables found: ${validation.tablesFound.join(', ')}`);
    }
    if (validation.errors.length === 0) {
      console.log(`  ${ANSI.green}✓${ANSI.reset} All required tables present`);
    } else {
      for (const error of validation.errors) {
        console.log(`  ${ANSI.red}✗${ANSI.reset} ${error}`);
        hasErrors = true;
      }
    }

    // SQLite integrity check
    console.log('');
    console.log('SQLite Integrity:');
    if (validation.integrityCheck) {
      console.log(`  ${ANSI.green}✓${ANSI.reset} PRAGMA integrity_check passed`);
    } else {
      console.log(`  ${ANSI.red}✗${ANSI.reset} Integrity check failed`);
      hasErrors = true;
    }

    // FTS5 availability
    console.log('');
    console.log('FTS5 Full-Text Search:');
    if (validation.fts5Available) {
      console.log(`  ${ANSI.green}✓${ANSI.reset} FTS5 table available`);
    } else {
      console.log(`  ${ANSI.yellow}⚠${ANSI.reset} FTS5 not available (using LIKE fallback)`);
    }

    // Embedding dimension check
    console.log('');
    console.log('Embeddings:');
    if (validation.embeddingDimension !== null) {
      if (validation.embeddingDimension === 768) {
        console.log(`  ${ANSI.green}✓${ANSI.reset} Embedding dimension: ${validation.embeddingDimension} (expected)`);
      } else {
        console.log(`  ${ANSI.yellow}⚠${ANSI.reset} Embedding dimension: ${validation.embeddingDimension} (expected 768)`);
      }
    } else {
      console.log(`  ${ANSI.dim}No embeddings stored yet${ANSI.reset}`);
    }

    // Backup status
    console.log('');
    console.log('Backups:');
    const backups = getBackupFiles();
    if (backups.length > 0) {
      console.log(`  ${ANSI.green}✓${ANSI.reset} ${backups.length} backup(s) available`);
    } else {
      console.log(`  ${ANSI.yellow}⚠${ANSI.reset} No backups found`);
    }

    // Warnings
    if (validation.warnings.length > 0) {
      console.log('');
      console.log('Warnings:');
      for (const warning of validation.warnings) {
        console.log(`  ${ANSI.yellow}⚠${ANSI.reset} ${warning}`);
      }
    }

    // Summary
    console.log('');
    console.log('--------------------------------');
    if (hasErrors) {
      console.log(`${ANSI.red}Database has errors. Consider restoring from backup.${ANSI.reset}`);
      process.exit(1);
    } else if (validation.warnings.length > 0) {
      console.log(`${ANSI.yellow}Database is functional with ${validation.warnings.length} warning(s).${ANSI.reset}`);
    } else {
      console.log(`${ANSI.green}Database is healthy.${ANSI.reset}`);
    }
  } catch (error) {
    console.log(`${ANSI.red}✗ Failed to check database: ${error instanceof Error ? error.message : String(error)}${ANSI.reset}`);
    process.exit(1);
  }
}

// ============================================================================
// Exports for testing
// ============================================================================

export {
  handleStatusline,
  handleSessionStart,
  handleMonitor,
  handleContextCheck,
  handleClearReminder,
  handlePreCompact,
  handleSmartCompact,
  handleSave,
  handleRecall,
  handleStats,
  handleSetup,
  handleConfigure,
  handleCheckDb,
};

// Run main
main();
