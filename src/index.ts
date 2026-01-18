/**
 * Cortex v2.0 - Main Entry Point
 * Handles statusline display, CLI commands, and hook events
 */

import { readStdin, getProjectId, getContextPercent, formatDuration } from './stdin.js';
import { loadConfig, ensureDataDir, applyPreset, getDataDir, isSetupComplete, markSetupComplete, type ConfigPreset } from './config.js';
import { initDb, getStats, getProjectStats, formatBytes, closeDb, saveDb, searchByVector } from './database.js';
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
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
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

  if (!config.statusline.enabled) {
    return;
  }

  // Initialize database (may create if doesn't exist)
  const db = await initDb();
  const stats = getStats(db);

  const parts: string[] = [`${ANSI.cyan}[Cortex]${ANSI.reset}`];

  // Fragment count
  if (config.statusline.showFragments) {
    parts.push(`${stats.fragmentCount} frags`);
  }

  // Project info
  if (stdin?.cwd) {
    const projectId = getProjectId(stdin.cwd);
    const projectStats = getProjectStats(db, projectId);

    parts.push(`${ANSI.bold}${projectId}${ANSI.reset}`);

    // Last archive time
    if (config.statusline.showLastArchive && projectStats.lastArchive) {
      parts.push(`${ANSI.dim}Last: ${formatDuration(projectStats.lastArchive)}${ANSI.reset}`);
    }

    // Context usage with colored progress bar
    if (config.statusline.showContext) {
      const contextPercent = getContextPercent(stdin);
      const progressBar = createProgressBar(contextPercent);
      parts.push(progressBar);
    }
  }

  console.log(parts.join(' | '));
}

/**
 * Create a colored progress bar for context usage
 */
function createProgressBar(percent: number): string {
  const width = 10;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // Color based on percentage
  let color: string;
  if (percent < 70) {
    color = ANSI.green;
  } else if (percent < 85) {
    color = ANSI.yellow;
  } else {
    color = ANSI.red;
  }

  const filledBar = '\u2588'.repeat(filled); // Full block
  const emptyBar = '\u2591'.repeat(empty);   // Light shade

  return `${color}${filledBar}${ANSI.dim}${emptyBar}${ANSI.reset} ${percent}%`;
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

  // Initialize database
  const db = await initDb();

  const projectId = stdin?.cwd ? getProjectId(stdin.cwd) : null;

  // Start analytics session
  startSession(projectId);

  // Get project stats
  const projectStats = projectId ? getProjectStats(db, projectId) : null;

  if (projectStats && projectStats.fragmentCount > 0) {
    // Get recent context summary
    const recentContext = await getRecentContextSummary(db, projectId);

    console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} ${projectStats.fragmentCount} memories for ${ANSI.bold}${projectId}${ANSI.reset}`);

    if (recentContext) {
      console.log(`${ANSI.dim}  Last session: ${recentContext}${ANSI.reset}`);
    }
  } else if (projectId) {
    console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} Ready for ${ANSI.bold}${projectId}${ANSI.reset} (no memories yet)`);
  } else {
    console.log(`${ANSI.cyan}[Cortex]${ANSI.reset} Session started`);
  }
}

/**
 * Get a brief summary of recent context for a project
 */
async function getRecentContextSummary(db: Awaited<ReturnType<typeof initDb>>, projectId: string | null): Promise<string | null> {
  try {
    // Get most recent memory for the project
    const queryEmbedding = await embedQuery('recent work context');
    const results = searchByVector(db, queryEmbedding, projectId, 1);

    if (results.length === 0) {
      return null;
    }

    const recent = results[0];
    const timeAgo = formatDuration(recent.timestamp);

    // Truncate content for summary
    const maxLen = 60;
    const content = recent.content.length > maxLen
      ? recent.content.substring(0, maxLen).trim() + '...'
      : recent.content;

    return `${timeAgo} - "${content}"`;
  } catch {
    return null;
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
  const { existsSync } = await import('fs');
  const pluginDir = new URL('.', import.meta.url).pathname.replace('/dist/', '');
  const nodeModulesPath = `${pluginDir}/node_modules`;

  if (!existsSync(nodeModulesPath)) {
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

  console.log('');
  console.log('[Cortex] Setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Install the plugin in Claude Code settings');
  console.log('  2. Use /save to archive session context');
  console.log('  3. Use /recall <query> to search memories');
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

// ============================================================================
// Exports for testing
// ============================================================================

export {
  handleStatusline,
  handleSessionStart,
  handleMonitor,
  handleContextCheck,
  handlePreCompact,
  handleSmartCompact,
  handleSave,
  handleRecall,
  handleStats,
  handleSetup,
  handleConfigure,
};

// Run main
main();
