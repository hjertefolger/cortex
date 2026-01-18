/**
 * Cortex Archive Module
 * Parses Claude Code transcripts, extracts meaningful content,
 * generates embeddings, and stores in the database
 */

import * as fs from 'fs';
import * as readline from 'readline';
import type { Database as SqlJsDatabase } from 'sql.js';
import { insertMemory, contentExists, saveDb } from './database.js';
import { embedBatch } from './embeddings.js';
import { loadConfig } from './config.js';
import type { ArchiveResult, TranscriptMessage } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

// Minimum content length to consider for archiving
const MIN_CONTENT_LENGTH = 50;

// Patterns to exclude (noise, acknowledgments, etc.)
const EXCLUDED_PATTERNS = [
  /^(ok|okay|done|yes|no|sure|thanks|thank you|got it|understood|alright)\.?$/i,
  /^(hello|hi|hey|bye|goodbye)\.?$/i,
  /^y(es)?$/i,
  /^n(o)?$/i,
  /^\d+$/,  // Just numbers
  /^[.!?]+$/, // Just punctuation
];

// Content patterns that indicate valuable information
const VALUABLE_PATTERNS = [
  /function\s+\w+/i,
  /class\s+\w+/i,
  /interface\s+\w+/i,
  /import\s+/,
  /export\s+/,
  /const\s+\w+\s*=/,
  /let\s+\w+\s*=/,
  /def\s+\w+/,
  /error|bug|fix|issue|problem/i,
  /implemented?|created?|added?|updated?|modified?|removed?/i,
  /because|since|therefore|however|although/i,
];

// ============================================================================
// Transcript Parsing
// ============================================================================

/**
 * Parse a JSONL transcript file
 */
export async function parseTranscript(
  transcriptPath: string
): Promise<TranscriptMessage[]> {
  if (!fs.existsSync(transcriptPath)) {
    return [];
  }

  const messages: TranscriptMessage[] = [];

  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);

      // Handle different transcript formats
      if (parsed.role && parsed.content) {
        // Direct message format
        const content = extractTextContent(parsed.content);
        if (content) {
          messages.push({
            role: parsed.role,
            content,
            timestamp: parsed.timestamp,
          });
        }
      } else if ((parsed.type === 'message' || parsed.type === 'user' || parsed.type === 'assistant') && parsed.message) {
        // Wrapped message format (Claude Code uses type: 'user' or 'assistant')
        const content = extractTextContent(parsed.message.content);
        if (content) {
          messages.push({
            role: parsed.message.role,
            content,
            timestamp: parsed.timestamp,
          });
        }
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return messages;
}

/**
 * Extract text content from various content formats
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts: string[] = [];

    for (const item of content) {
      if (typeof item === 'string') {
        textParts.push(item);
      } else if (typeof item === 'object' && item !== null) {
        if ('text' in item && typeof item.text === 'string') {
          textParts.push(item.text);
        }
      }
    }

    return textParts.join('\n');
  }

  return '';
}

// ============================================================================
// Content Filtering
// ============================================================================

/**
 * Check if content should be excluded
 */
function shouldExclude(content: string): boolean {
  const trimmed = content.trim();

  // Too short
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return true;
  }

  // Matches exclusion pattern
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if content appears to be valuable
 */
function isValuable(content: string): boolean {
  for (const pattern of VALUABLE_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  // Check for reasonable length and structure
  const words = content.split(/\s+/).length;
  return words >= 10;
}

/**
 * Extract meaningful chunks from content
 */
function extractChunks(content: string): string[] {
  const chunks: string[] = [];

  // Split by paragraphs or significant breaks
  const paragraphs = content.split(/\n\n+/);

  for (const para of paragraphs) {
    const trimmed = para.trim();

    if (trimmed.length < MIN_CONTENT_LENGTH) {
      continue;
    }

    // If paragraph is too long, split into sentences
    if (trimmed.length > 1000) {
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let currentChunk = '';

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > 800) {
          if (currentChunk.length >= MIN_CONTENT_LENGTH) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      }

      if (currentChunk.length >= MIN_CONTENT_LENGTH) {
        chunks.push(currentChunk.trim());
      }
    } else {
      chunks.push(trimmed);
    }
  }

  return chunks;
}

// ============================================================================
// Archiving
// ============================================================================

/**
 * Archive a transcript to the database
 */
export async function archiveSession(
  db: SqlJsDatabase,
  transcriptPath: string,
  projectId: string | null,
  options: {
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ArchiveResult> {
  const config = loadConfig();
  const minLength = config.archive.minContentLength || MIN_CONTENT_LENGTH;

  const result: ArchiveResult = {
    archived: 0,
    skipped: 0,
    duplicates: 0,
  };

  // Parse transcript
  const messages = await parseTranscript(transcriptPath);

  if (messages.length === 0) {
    return result;
  }

  // Extract and filter content
  const contentToArchive: Array<{
    content: string;
    timestamp: Date;
  }> = [];

  for (const message of messages) {
    // Focus on assistant messages (they contain the valuable context)
    if (message.role !== 'assistant') {
      continue;
    }

    const chunks = extractChunks(message.content);

    for (const chunk of chunks) {
      if (chunk.length < minLength) {
        result.skipped++;
        continue;
      }

      if (shouldExclude(chunk)) {
        result.skipped++;
        continue;
      }

      if (!isValuable(chunk)) {
        result.skipped++;
        continue;
      }

      // Check for duplicates before adding
      if (contentExists(db, chunk)) {
        result.duplicates++;
        continue;
      }

      contentToArchive.push({
        content: chunk,
        timestamp: message.timestamp
          ? new Date(message.timestamp)
          : new Date(),
      });
    }
  }

  if (contentToArchive.length === 0) {
    return result;
  }

  // Generate embeddings in batches
  const texts = contentToArchive.map((c) => c.content);
  const embeddings = await embedBatch(texts, {
    onProgress: options.onProgress,
  });

  // Store in database
  const sessionId = getSessionId(transcriptPath);

  for (let i = 0; i < contentToArchive.length; i++) {
    const { content, timestamp } = contentToArchive[i];
    const embedding = embeddings[i];

    const { isDuplicate } = insertMemory(db, {
      content,
      embedding,
      projectId,
      sourceSession: sessionId,
      timestamp,
    });

    if (isDuplicate) {
      result.duplicates++;
    } else {
      result.archived++;
    }
  }

  // Save database
  saveDb(db);

  return result;
}

/**
 * Extract session ID from transcript path
 */
function getSessionId(transcriptPath: string): string {
  // Extract filename without extension
  const basename = transcriptPath.split('/').pop() || transcriptPath;
  return basename.replace(/\.[^.]+$/, '');
}

/**
 * Archive content directly (for manual archiving)
 */
export async function archiveContent(
  db: SqlJsDatabase,
  content: string,
  projectId: string | null
): Promise<{ success: boolean; isDuplicate: boolean }> {
  if (contentExists(db, content)) {
    return { success: false, isDuplicate: true };
  }

  const embeddings = await embedBatch([content]);
  const embedding = embeddings[0];

  const { isDuplicate } = insertMemory(db, {
    content,
    embedding,
    projectId,
    sourceSession: 'manual',
    timestamp: new Date(),
  });

  if (!isDuplicate) {
    saveDb(db);
  }

  return { success: !isDuplicate, isDuplicate };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format archive result for display
 */
export function formatArchiveResult(result: ArchiveResult): string {
  const lines: string[] = [];

  lines.push('Archive Complete');
  lines.push('----------------');
  lines.push(`Archived:   ${result.archived} fragments`);
  lines.push(`Skipped:    ${result.skipped} (too short/noise)`);
  lines.push(`Duplicates: ${result.duplicates} (already stored)`);

  return lines.join('\n');
}

// ============================================================================
// Restoration Context
// ============================================================================

export interface RestorationContext {
  hasContent: boolean;
  summary: string;
  fragments: Array<{
    content: string;
    timestamp: Date;
  }>;
  estimatedTokens: number;
}

/**
 * Build restoration context from recent memories
 * Used after context clear to restore continuity
 */
export async function buildRestorationContext(
  db: SqlJsDatabase,
  projectId: string | null,
  options: {
    messageCount?: number;
    tokenBudget?: number;
  } = {}
): Promise<RestorationContext> {
  const { messageCount = 5, tokenBudget = 1000 } = options;

  // Import search functions dynamically to avoid circular dependency
  const { searchByVector } = await import('./database.js');
  const { embedQuery } = await import('./embeddings.js');

  // Query for recent context
  const queryEmbedding = await embedQuery('recent work summary context decisions');

  // Get recent memories sorted by relevance
  const results = searchByVector(db, queryEmbedding, projectId, messageCount * 2);

  if (results.length === 0) {
    return {
      hasContent: false,
      summary: 'No recent context available.',
      fragments: [],
      estimatedTokens: 0,
    };
  }

  // Select fragments within token budget
  const fragments: Array<{ content: string; timestamp: Date }> = [];
  let totalTokens = 0;
  const tokensPerChar = 0.25; // Rough estimate

  for (const result of results) {
    const contentTokens = Math.ceil(result.content.length * tokensPerChar);

    if (totalTokens + contentTokens > tokenBudget) {
      // Truncate content to fit within budget
      const remainingTokens = tokenBudget - totalTokens;
      if (remainingTokens > 50) {
        const truncatedLength = Math.floor(remainingTokens / tokensPerChar);
        fragments.push({
          content: result.content.substring(0, truncatedLength) + '...',
          timestamp: result.timestamp,
        });
      }
      break;
    }

    fragments.push({
      content: result.content,
      timestamp: result.timestamp,
    });
    totalTokens += contentTokens;

    if (fragments.length >= messageCount) {
      break;
    }
  }

  // Build summary
  const summary = fragments.length > 0
    ? `Restored ${fragments.length} context fragments from ${projectId || 'global'} memory.`
    : 'No relevant context found.';

  return {
    hasContent: fragments.length > 0,
    summary,
    fragments,
    estimatedTokens: totalTokens,
  };
}

/**
 * Format restoration context for display
 */
export function formatRestorationContext(context: RestorationContext): string {
  if (!context.hasContent) {
    return context.summary;
  }

  const lines: string[] = [];
  lines.push(context.summary);
  lines.push('');

  for (let i = 0; i < context.fragments.length; i++) {
    const fragment = context.fragments[i];
    const timeAgo = formatTimeAgo(fragment.timestamp);
    lines.push(`[${i + 1}] (${timeAgo})`);
    lines.push(fragment.content);
    lines.push('');
  }

  lines.push(`~${context.estimatedTokens} tokens`);

  return lines.join('\n');
}

/**
 * Format time ago string
 */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}
