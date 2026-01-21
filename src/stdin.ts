/**
 * Cortex Stdin Parser
 * Reads and parses JSON data from Claude Code via stdin
 *
 * Follows claude-hud's production pattern for reliable stdin parsing
 */

import type { StdinData, StdinReadResult } from './types.js';

/**
 * Read and parse stdin data from Claude Code with full error context
 * Uses async iterator pattern for reliable streaming
 * Returns discriminated union with success/error status
 */
export async function readStdinWithResult(): Promise<StdinReadResult> {
  // Check if stdin is a TTY (interactive terminal) - no data to read
  if (process.stdin.isTTY) {
    return {
      success: false,
      data: null,
      error: {
        type: 'tty',
        message: 'stdin is a TTY (interactive terminal)',
      },
    };
  }

  const chunks: string[] = [];
  let raw = '';

  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      chunks.push(chunk as string);
    }
    raw = chunks.join('');

    if (!raw.trim()) {
      return {
        success: false,
        data: null,
        error: {
          type: 'empty',
          message: 'stdin was empty or whitespace only',
        },
      };
    }

    const data = JSON.parse(raw) as StdinData;
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        type: 'parse_error',
        message: error instanceof Error ? error.message : String(error),
        raw: raw.length < 500 ? raw : raw.substring(0, 500) + '...',
      },
    };
  }
}

/**
 * Read and parse stdin data from Claude Code
 * Uses async iterator pattern for reliable streaming
 * Returns null if no data available or parsing fails
 * @deprecated Use readStdinWithResult() for error context
 */
export async function readStdin(): Promise<StdinData | null> {
  const result = await readStdinWithResult();
  return result.success ? result.data : null;
}

/**
 * Get total tokens from stdin context window
 */
function getTotalTokens(stdin: StdinData): number {
  const usage = stdin.context_window?.current_usage;
  return (
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0)
  );
}

/**
 * Get native percentage from Claude Code v2.1.6+ if available
 * Returns null if not available, triggering fallback to manual calculation
 */
function getNativePercent(stdin: StdinData): number | null {
  const nativePercent = stdin.context_window?.used_percentage;
  if (typeof nativePercent === 'number' && !Number.isNaN(nativePercent)) {
    return Math.min(100, Math.max(0, Math.round(nativePercent)));
  }
  return null;
}

/**
 * Get context usage percentage
 * Prefers native percentage (v2.1.6+), falls back to manual calculation
 */
export function getContextPercent(stdin: StdinData): number {
  // Prefer native percentage (v2.1.6+) - accurate and matches /context
  const native = getNativePercent(stdin);
  if (native !== null) {
    return native;
  }

  // Fallback: manual calculation
  const size = stdin.context_window?.context_window_size;
  if (!size || size <= 0) {
    return 0;
  }

  const totalTokens = getTotalTokens(stdin);
  return Math.min(100, Math.round((totalTokens / size) * 100));
}

/**
 * Get model display name from stdin
 */
export function getModelName(stdin: StdinData): string {
  return stdin.model?.display_name ?? stdin.model?.id ?? 'Unknown';
}

/**
 * Extract project ID from working directory path
 * Uses the last component of the path as the project identifier
 */
export function getProjectId(cwd: string | undefined): string {
  if (!cwd) return 'unknown';

  // Normalize path separators and get last component
  const normalized = cwd.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  return parts[parts.length - 1] || 'unknown';
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
