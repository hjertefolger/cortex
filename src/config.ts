/**
 * Cortex Configuration Module
 * Handles loading, saving, and validating configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import type { Config, StatuslineConfig, ArchiveConfig, MonitorConfig, AutomationConfig, SetupConfig } from './types.js';

// ============================================================================
// Zod Schemas for Config Validation
// ============================================================================

const StatuslineConfigSchema = z.object({
  enabled: z.boolean(),
  showFragments: z.boolean(),
  showLastArchive: z.boolean(),
  showContext: z.boolean(),
  contextWarningThreshold: z.number().min(0).max(100),
});

const ArchiveConfigSchema = z.object({
  autoOnCompact: z.boolean(),
  projectScope: z.boolean(),
  minContentLength: z.number().min(0).max(10000),
});

const MonitorConfigSchema = z.object({
  tokenThreshold: z.number().min(0).max(100),
});

const AutomationConfigSchema = z.object({
  autoSaveThreshold: z.number().min(0).max(100),
  autoClearThreshold: z.number().min(0).max(100),
  autoClearEnabled: z.boolean(),
  restorationTokenBudget: z.number().min(0).max(50000),
  restorationMessageCount: z.number().min(0).max(50),
  restorationTurnCount: z.number().min(0).max(50),
});

const SetupConfigSchema = z.object({
  completed: z.boolean(),
  completedAt: z.string().nullable(),
});

const ConfigSchema = z.object({
  statusline: StatuslineConfigSchema,
  archive: ArchiveConfigSchema,
  monitor: MonitorConfigSchema,
  automation: AutomationConfigSchema,
  setup: SetupConfigSchema,
});

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = {
  enabled: true,
  showFragments: true,
  showLastArchive: true,
  showContext: true,
  contextWarningThreshold: 60,
};

export const DEFAULT_ARCHIVE_CONFIG: ArchiveConfig = {
  autoOnCompact: true,
  projectScope: true,
  minContentLength: 50,
};

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  tokenThreshold: 70,
};

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  autoSaveThreshold: 80,
  autoClearThreshold: 80,
  autoClearEnabled: false,
  restorationTokenBudget: 2000,
  restorationMessageCount: 5,
  restorationTurnCount: 3,  // Last 3 turns (user+assistant pairs) for precise restoration
};

export const DEFAULT_SETUP_CONFIG: SetupConfig = {
  completed: false,
  completedAt: null,
};

export const DEFAULT_CONFIG: Config = {
  statusline: DEFAULT_STATUSLINE_CONFIG,
  archive: DEFAULT_ARCHIVE_CONFIG,
  monitor: DEFAULT_MONITOR_CONFIG,
  automation: DEFAULT_AUTOMATION_CONFIG,
  setup: DEFAULT_SETUP_CONFIG,
};

// ============================================================================
// Paths
// ============================================================================

/**
 * Get the Cortex data directory path
 */
export function getDataDir(): string {
  const home = os.homedir();
  return path.join(home, '.cortex');
}

/**
 * Get the configuration file path
 */
export function getConfigPath(): string {
  return path.join(getDataDir(), 'config.json');
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  return path.join(getDataDir(), 'memory.db');
}

/**
 * Get the backups directory path
 */
export function getBackupsDir(): string {
  return path.join(getDataDir(), 'backups');
}

/**
 * Ensure the backups directory exists
 */
export function ensureBackupsDir(): void {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure the data directory exists
 */
export function ensureDataDir(): void {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Configuration Loading/Saving
// ============================================================================

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null
    ) {
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Load configuration from disk, merging with defaults
 * Validates with Zod schema, falling back to defaults on validation error
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const loaded = JSON.parse(content);
    const merged = deepMerge(DEFAULT_CONFIG, loaded);

    // Validate with Zod schema
    const result = ConfigSchema.safeParse(merged);
    if (!result.success) {
      // Log validation errors but continue with defaults
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      console.error(`[Cortex] Config validation errors:\n  ${errors.join('\n  ')}`);
      console.error('[Cortex] Using default configuration');
      return DEFAULT_CONFIG;
    }

    return result.data;
  } catch {
    // Return defaults if loading fails
    return DEFAULT_CONFIG;
  }
}

/**
 * Atomic file write helper
 * Uses temp-file + rename to prevent corruption on crash
 */
function atomicWriteFileSync(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);  // Atomic on POSIX
  } catch (error) {
    // Clean up temp file if rename failed
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Save configuration to disk using atomic write pattern
 */
export function saveConfig(config: Config): void {
  ensureDataDir();
  const configPath = getConfigPath();
  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Update a specific section of the configuration
 */
export function updateConfig(updates: Partial<Config>): Config {
  const current = loadConfig();
  const updated = deepMerge(current, updates);
  saveConfig(updated);
  return updated;
}

// ============================================================================
// Configuration Presets
// ============================================================================

export type ConfigPreset = 'full' | 'essential' | 'minimal';

export const CONFIG_PRESETS: Record<ConfigPreset, Partial<Config>> = {
  full: {
    statusline: {
      enabled: true,
      showFragments: true,
      showLastArchive: true,
      showContext: true,
      contextWarningThreshold: 70,
    },
    archive: {
      autoOnCompact: true,
      projectScope: true,
      minContentLength: 50,
    },
    monitor: {
      tokenThreshold: 70,
    },
    automation: {
      autoSaveThreshold: 70,
      autoClearThreshold: 80,
      autoClearEnabled: false,
      restorationTokenBudget: 2000,
      restorationMessageCount: 5,
      restorationTurnCount: 3,
    },
  },
  essential: {
    statusline: {
      enabled: true,
      showFragments: true,
      showLastArchive: false,
      showContext: true,
      contextWarningThreshold: 80,
    },
    archive: {
      autoOnCompact: true,
      projectScope: true,
      minContentLength: 100,
    },
    monitor: {
      tokenThreshold: 80,
    },
    automation: {
      autoSaveThreshold: 75,
      autoClearThreshold: 85,
      autoClearEnabled: false,
      restorationTokenBudget: 1500,
      restorationMessageCount: 5,
      restorationTurnCount: 3,
    },
  },
  minimal: {
    statusline: {
      enabled: false,
      showFragments: false,
      showLastArchive: false,
      showContext: false,
      contextWarningThreshold: 90,
    },
    archive: {
      autoOnCompact: false,
      projectScope: true,
      minContentLength: 50,
    },
    monitor: {
      tokenThreshold: 90,
    },
    automation: {
      autoSaveThreshold: 85,
      autoClearThreshold: 90,
      autoClearEnabled: false,
      restorationTokenBudget: 1000,
      restorationMessageCount: 3,
      restorationTurnCount: 2,
    },
  },
};

/**
 * Apply a configuration preset
 */
export function applyPreset(preset: ConfigPreset): Config {
  const presetConfig = CONFIG_PRESETS[preset];
  const config = deepMerge(DEFAULT_CONFIG, presetConfig);
  saveConfig(config);
  return config;
}

// ============================================================================
// Setup and Analytics
// ============================================================================

/**
 * Get the analytics file path
 */
export function getAnalyticsPath(): string {
  return path.join(getDataDir(), 'analytics.json');
}

/**
 * Get the sessions file path (stores all active sessions keyed by projectId)
 */
export function getSessionsPath(): string {
  return path.join(getDataDir(), 'sessions.json');
}

interface SessionInfo {
  transcriptPath: string;
  projectId: string;
  savedAt: string;
}

interface SessionsStore {
  [projectId: string]: SessionInfo;
}

/**
 * Load all sessions
 */
function loadSessions(): SessionsStore {
  const sessionsPath = getSessionsPath();
  if (!fs.existsSync(sessionsPath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(sessionsPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save all sessions using atomic write pattern
 */
function saveSessions(sessions: SessionsStore): void {
  ensureDataDir();
  atomicWriteFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2));
}

/**
 * Save current session info (transcript path, project)
 * Keyed by projectId so multiple instances don't conflict
 */
export function saveCurrentSession(transcriptPath: string, projectId: string | null): void {
  if (!projectId) {
    // Can't store without a projectId key
    return;
  }
  const sessions = loadSessions();
  sessions[projectId] = {
    transcriptPath,
    projectId,
    savedAt: new Date().toISOString(),
  };
  saveSessions(sessions);
}

/**
 * Get session info for a specific project
 */
export function getCurrentSession(projectId?: string): { transcriptPath: string; projectId: string } | null {
  if (!projectId) {
    return null;
  }
  const sessions = loadSessions();
  return sessions[projectId] || null;
}

/**
 * Mark setup as completed
 */
export function markSetupComplete(): Config {
  const config = loadConfig();
  config.setup.completed = true;
  config.setup.completedAt = new Date().toISOString();
  saveConfig(config);
  return config;
}

/**
 * Check if setup has been completed
 */
export function isSetupComplete(): boolean {
  const config = loadConfig();
  return config.setup.completed;
}

// ============================================================================
// Auto-Save State Management
// ============================================================================

interface AutoSaveState {
  lastAutoSaveTimestamp: string | null;
  lastAutoSaveContext: number;
  transcriptPath: string | null;
  hasSavedThisSession: boolean;
  hasReachedWarningThreshold: boolean;
  warningContextPercent: number;
}

const DEFAULT_AUTO_SAVE_STATE: AutoSaveState = {
  lastAutoSaveTimestamp: null,
  lastAutoSaveContext: 0,
  transcriptPath: null,
  hasSavedThisSession: false,
  hasReachedWarningThreshold: false,
  warningContextPercent: 0,
};

/**
 * Get the auto-save state file path
 */
export function getAutoSaveStatePath(): string {
  return path.join(getDataDir(), 'auto-save-state.json');
}

/**
 * Load auto-save state from disk
 */
export function loadAutoSaveState(): AutoSaveState {
  const statePath = getAutoSaveStatePath();
  if (!fs.existsSync(statePath)) {
    return { ...DEFAULT_AUTO_SAVE_STATE };
  }
  try {
    const content = fs.readFileSync(statePath, 'utf8');
    return { ...DEFAULT_AUTO_SAVE_STATE, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULT_AUTO_SAVE_STATE };
  }
}

/**
 * Save auto-save state to disk using atomic write pattern
 */
export function saveAutoSaveState(state: AutoSaveState): void {
  ensureDataDir();
  atomicWriteFileSync(getAutoSaveStatePath(), JSON.stringify(state, null, 2));
}

/**
 * Check if we should trigger auto-save
 * Returns true if:
 * - Context is above threshold
 * - Haven't already saved this session
 * - OR transcript path changed (new session)
 */
export function shouldAutoSave(currentContext: number, transcriptPath: string | null, threshold: number): boolean {
  if (currentContext < threshold) {
    return false;
  }

  const state = loadAutoSaveState();

  // New transcript = new session, allow save
  if (transcriptPath && state.transcriptPath !== transcriptPath) {
    return true;
  }

  // Already saved this session
  if (state.hasSavedThisSession) {
    return false;
  }

  return true;
}

/**
 * Mark that we've auto-saved for this session
 */
export function markAutoSaved(transcriptPath: string | null, contextPercent: number): void {
  const currentState = loadAutoSaveState();
  const state: AutoSaveState = {
    lastAutoSaveTimestamp: new Date().toISOString(),
    lastAutoSaveContext: contextPercent,
    transcriptPath,
    hasSavedThisSession: true,
    hasReachedWarningThreshold: currentState.hasReachedWarningThreshold,
    warningContextPercent: currentState.warningContextPercent,
  };
  saveAutoSaveState(state);
}

/**
 * Reset auto-save state (call on session start or after clear)
 */
export function resetAutoSaveState(): void {
  saveAutoSaveState({ ...DEFAULT_AUTO_SAVE_STATE });
}

/**
 * Mark that context has reached warning threshold
 */
export function markWarningThresholdReached(contextPercent: number): void {
  const state = loadAutoSaveState();
  state.hasReachedWarningThreshold = true;
  state.warningContextPercent = contextPercent;
  saveAutoSaveState(state);
}
