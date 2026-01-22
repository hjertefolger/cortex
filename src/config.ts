/**
 * Cortex Configuration Module
 * Handles loading, saving, and validating configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import type { Config, StatuslineConfig, ArchiveConfig, AutosaveConfig, RestorationConfig, SetupConfig } from './types.js';

// ============================================================================
// Zod Schemas for Config Validation
// ============================================================================

const StatuslineConfigSchema = z.object({
  enabled: z.boolean(),
  showFragments: z.boolean(),
  showLastArchive: z.boolean(),
  showContext: z.boolean(),
});

const ArchiveConfigSchema = z.object({
  projectScope: z.boolean(),
  minContentLength: z.number().min(0).max(10000),
});

const AutosaveConfigSchema = z.object({
  onSessionEnd: z.boolean(),
  onPreCompact: z.boolean(),
  contextStep: z.object({
    enabled: z.boolean(),
    step: z.number().min(1).max(100),
  }),
});

const RestorationConfigSchema = z.object({
  tokenBudget: z.number().min(0).max(50000),
  messageCount: z.number().min(0).max(50),
  turnCount: z.number().min(0).max(50),
});

const SetupConfigSchema = z.object({
  completed: z.boolean(),
  completedAt: z.string().nullable(),
});

const ConfigSchema = z.object({
  statusline: StatuslineConfigSchema,
  archive: ArchiveConfigSchema,
  autosave: AutosaveConfigSchema,
  restoration: RestorationConfigSchema,
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
};

export const DEFAULT_ARCHIVE_CONFIG: ArchiveConfig = {
  projectScope: true,
  minContentLength: 50,
};

export const DEFAULT_AUTOSAVE_CONFIG: AutosaveConfig = {
  onSessionEnd: true,
  onPreCompact: true,
  contextStep: {
    enabled: true,
    step: 5,  // Save every 5% increase in context
  },
};

export const DEFAULT_RESTORATION_CONFIG: RestorationConfig = {
  tokenBudget: 2000,
  messageCount: 5,
  turnCount: 3,
};

export const DEFAULT_SETUP_CONFIG: SetupConfig = {
  completed: false,
  completedAt: null,
};

export const DEFAULT_CONFIG: Config = {
  statusline: DEFAULT_STATUSLINE_CONFIG,
  archive: DEFAULT_ARCHIVE_CONFIG,
  autosave: DEFAULT_AUTOSAVE_CONFIG,
  restoration: DEFAULT_RESTORATION_CONFIG,
  setup: DEFAULT_SETUP_CONFIG,
};

// ============================================================================
// Paths
// ============================================================================

/**
 * Get the Cortex data directory path
 */
export function getDataDir(): string {
  if (process.env.CORTEX_DATA_DIR) {
    return process.env.CORTEX_DATA_DIR;
  }
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
      console.error(`Config validation errors:\n  ${errors.join('\n  ')}`);
      console.error('Using default configuration');
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
    },
    archive: {
      projectScope: true,
      minContentLength: 50,
    },
    autosave: {
      onSessionEnd: true,
      onPreCompact: true,
      contextStep: {
        enabled: true,
        step: 5,
      },
    },
    restoration: {
      tokenBudget: 3000,
      messageCount: 5,
      turnCount: 5,
    },
  },
  essential: {
    statusline: {
      enabled: true,
      showFragments: true,
      showLastArchive: false,
      showContext: true,
    },
    archive: {
      projectScope: true,
      minContentLength: 100,
    },
    autosave: {
      onSessionEnd: true,
      onPreCompact: true,
      contextStep: {
        enabled: true,
        step: 10,
      },
    },
    restoration: {
      tokenBudget: 1500,
      messageCount: 5,
      turnCount: 3,
    },
  },
  minimal: {
    statusline: {
      enabled: false,
      showFragments: false,
      showLastArchive: false,
      showContext: false,
    },
    archive: {
      projectScope: true,
      minContentLength: 50,
    },
    autosave: {
      onSessionEnd: true,
      onPreCompact: true,
      contextStep: {
        enabled: false,
        step: 20,
      },
    },
    restoration: {
      tokenBudget: 1000,
      messageCount: 3,
      turnCount: 2,
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

// Fallback key for sessions without a project
const GLOBAL_SESSION_KEY = '_global';

/**
 * Save current session info (transcript path, project)
 * Keyed by projectId so multiple instances don't conflict
 * Uses '_global' fallback when no projectId is available
 */
export function saveCurrentSession(transcriptPath: string, projectId: string | null): void {
  const key = projectId || GLOBAL_SESSION_KEY;
  const sessions = loadSessions();
  sessions[key] = {
    transcriptPath,
    projectId: projectId || GLOBAL_SESSION_KEY,
    savedAt: new Date().toISOString(),
  };
  saveSessions(sessions);
}

/**
 * Get session info for a specific project
 * Falls back to '_global' session when no projectId is provided
 */
export function getCurrentSession(projectId?: string): { transcriptPath: string; projectId: string } | null {
  const sessions = loadSessions();

  // Try specific project first, then fall back to global
  if (projectId && sessions[projectId]) {
    return sessions[projectId];
  }

  // Fall back to global session
  return sessions[GLOBAL_SESSION_KEY] || null;
}

/**
 * Get the most recently saved session (by savedAt timestamp)
 * Used when no projectId is provided to auto-detect current session
 */
export function getMostRecentSession(): { transcriptPath: string; projectId: string; savedAt: string } | null {
  const sessions = loadSessions();

  let mostRecent: { transcriptPath: string; projectId: string; savedAt: string } | null = null;
  let mostRecentTime = 0;

  for (const [key, session] of Object.entries(sessions)) {
    if (key === GLOBAL_SESSION_KEY) continue; // Skip global fallback
    const savedTime = new Date(session.savedAt).getTime();
    if (savedTime > mostRecentTime) {
      mostRecentTime = savedTime;
      mostRecent = session;
    }
  }

  return mostRecent;
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
  lastSaveTimestamp: number;      // Unix ms
  lastSaveContext: number;        // Context % at last save
  lastSaveFragments: number;      // Number of fragments saved
  transcriptPath: string | null;  // Current session
  isSaving: boolean;              // Is a save currently in progress?
  saveStartTime: number;          // When the current save started (for timeout/animation)
}

const DEFAULT_AUTO_SAVE_STATE: AutoSaveState = {
  lastSaveTimestamp: 0,
  lastSaveContext: 0,
  lastSaveFragments: 0,
  transcriptPath: null,
  isSaving: false,
  saveStartTime: 0,
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
 * Get last save timestamp (Unix ms)
 */
export function getLastSaveTimestamp(): number {
  const state = loadAutoSaveState();
  return state.lastSaveTimestamp;
}

/**
 * Get last save context percentage
 */
export function getLastSaveContext(): number {
  const state = loadAutoSaveState();
  return state.lastSaveContext;
}

/**
 * Check if should auto-save based on context step
 */
export function shouldAutoSave(currentContext: number, transcriptPath: string | null): boolean {
  if (!transcriptPath) return false;

  const state = loadAutoSaveState();
  const config = loadConfig();

  // New session -> reset state implicitly by not matching path
  if (state.transcriptPath !== transcriptPath) {
    // If context is already high enough to trigger first step
    return currentContext >= config.autosave.contextStep.step;
  }

  // Check if we've crossed the next step threshold
  // E.g. last 10%, current 16%, step 5% -> diff 6% -> save
  const diff = currentContext - state.lastSaveContext;
  return diff >= config.autosave.contextStep.step;
}

/**
 * Mark that we've auto-saved
 */
export function markAutoSaved(transcriptPath: string | null, contextPercent: number, fragments: number): void {
  const state: AutoSaveState = {
    lastSaveTimestamp: Date.now(),
    lastSaveContext: contextPercent,
    lastSaveFragments: fragments,
    transcriptPath,
    isSaving: false,
    saveStartTime: 0,
  };
  saveAutoSaveState(state);
}

/**
 * Set the saving state (start/stop)
 */
export function setSavingState(isSaving: boolean, transcriptPath: string | null): void {
  const state = loadAutoSaveState();
  state.isSaving = isSaving;
  if (isSaving) {
    state.saveStartTime = Date.now();
    state.transcriptPath = transcriptPath; // Ensure we track which session is saving
  } else {
    state.saveStartTime = 0;
  }
  saveAutoSaveState(state);
}

/**
 * Check if a save is currently in progress
 */
export function isSaving(): boolean {
  const state = loadAutoSaveState();
  // Auto-expire lock after 60 seconds in case of crash
  if (state.isSaving && Date.now() - state.saveStartTime > 60000) {
    return false;
  }
  return state.isSaving;
}

/**
 * Check if we saved recently (for statusline indicator)
 */
export function wasRecentlySaved(windowMs: number = 5000): boolean {
  const state = loadAutoSaveState();
  if (state.lastSaveTimestamp === 0) return false;

  // If currently saving, don't show "Autosaved" yet
  if (state.isSaving) return false;

  const elapsed = Date.now() - state.lastSaveTimestamp;
  return elapsed < windowMs;
}

/**
 * Reset auto-save state (call on session start or after clear)
 */
export function resetAutoSaveState(): void {
  saveAutoSaveState({ ...DEFAULT_AUTO_SAVE_STATE });
}

/**
 * Check if auto-save state is for current session
 */
export function isAutoSaveStateCurrentSession(transcriptPath: string | null): boolean {
  if (!transcriptPath) return false;
  const state = loadAutoSaveState();
  return state.transcriptPath === transcriptPath;
}
