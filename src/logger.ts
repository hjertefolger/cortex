/**
 * Cortex Logger Module
 * Structured logging with levels and optional verbose output
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  verbose?: boolean;
  jsonOutput?: boolean;
  prefix?: string;
}

// ============================================================================
// Logger State
// ============================================================================

let globalVerbose = false;
let globalJsonOutput = false;
let globalPrefix = '[Cortex]';

/**
 * Configure global logger settings
 */
export function configureLogger(options: LoggerOptions): void {
  if (options.verbose !== undefined) {
    globalVerbose = options.verbose;
  }
  if (options.jsonOutput !== undefined) {
    globalJsonOutput = options.jsonOutput;
  }
  if (options.prefix !== undefined) {
    globalPrefix = options.prefix;
  }
}

/**
 * Check if verbose mode is enabled
 */
export function isVerbose(): boolean {
  return globalVerbose;
}

// ============================================================================
// Log Level Priority
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get minimum log level based on verbose setting
 * - Verbose: debug and above (all levels)
 * - Normal: warn and above (quiet mode)
 */
function getMinLevel(): number {
  return globalVerbose ? LOG_LEVELS.debug : LOG_LEVELS.warn;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format log entry as plain text
 */
function formatPlain(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const levelTag = level.toUpperCase().padEnd(5);
  let output = `${globalPrefix} ${levelTag} ${message}`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    output += ` (${contextStr})`;
  }

  return output;
}

/**
 * Format log entry as JSON
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  // Check if this level should be logged
  if (LOG_LEVELS[level] < getMinLevel()) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };

  const output = globalJsonOutput ? formatJson(entry) : formatPlain(level, message, context);

  // Error and warn go to stderr, others to stdout
  if (level === 'error' || level === 'warn') {
    console.error(output);
  } else {
    console.log(output);
  }
}

/**
 * Log debug message (only shown in verbose mode)
 */
export function debug(message: string, context?: Record<string, unknown>): void {
  log('debug', message, context);
}

/**
 * Log info message (only shown in verbose mode)
 */
export function info(message: string, context?: Record<string, unknown>): void {
  log('info', message, context);
}

/**
 * Log warning message (always shown)
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  log('warn', message, context);
}

/**
 * Log error message (always shown)
 */
export function error(message: string, context?: Record<string, unknown>): void {
  log('error', message, context);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a child logger with additional context
 */
export function createLogger(defaultContext: Record<string, unknown>): {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
} {
  const mergeContext = (context?: Record<string, unknown>) => ({
    ...defaultContext,
    ...context,
  });

  return {
    debug: (message, context) => debug(message, mergeContext(context)),
    info: (message, context) => info(message, mergeContext(context)),
    warn: (message, context) => warn(message, mergeContext(context)),
    error: (message, context) => error(message, mergeContext(context)),
  };
}

/**
 * Parse --verbose flag from command line args
 */
export function parseVerboseFlag(args: string[]): boolean {
  return args.includes('--verbose') || args.includes('-v');
}
