/**
 * Cortex Archive Module
 * Parses Claude Code transcripts, extracts meaningful content,
 * generates embeddings, and stores in the database
 */

import * as fs from 'fs';
import * as readline from 'readline';
import type { Database as SqlJsDatabase } from 'sql.js';
import { insertMemory, contentExists, saveDb, insertTurn, clearProjectTurns, getRecentTurns, upsertSessionSummary } from './database.js';
import { embedBatch } from './embeddings.js';
import { loadConfig } from './config.js';
import type { ArchiveResult, TranscriptMessage, ParseResult } from './types.js';

// ============================================================================
// Configuration - Optimized for Nomic Embed v1.5
// ============================================================================

// Chunk size settings (research-backed optimal range for semantic search)
const MIN_CONTENT_LENGTH = 150;  // Increased from 50 - avoid noise
const OPTIMAL_CHUNK_SIZE = 400;  // Target chunk size for best retrieval
const MAX_CHUNK_SIZE = 600;      // Upper bound before splitting

// Patterns to exclude (noise, acknowledgments, tool outputs)
const EXCLUDED_PATTERNS = [
  /^(ok|okay|done|yes|no|sure|thanks|thank you|got it|understood|alright)\.?$/i,
  /^(hello|hi|hey|bye|goodbye)\.?$/i,
  /^y(es)?$/i,
  /^n(o)?$/i,
  /^\d+$/,  // Just numbers
  /^[.!?]+$/, // Just punctuation
  /^```[\s\S]*```$/,  // Pure code blocks without explanation
  /^\[Cortex\]/,  // Our own status messages
  /^Running:/i,  // Tool execution outputs
];

// Content patterns that indicate HIGH-VALUE information (weighted higher)
const HIGH_VALUE_PATTERNS = [
  // Decisions and rationale
  /decided to|chose to|went with|opted for/i,
  /because|since|therefore|the reason/i,
  /trade-?off|pros? and cons?|alternative/i,

  // Architecture and design
  /architect|design|pattern|approach|strategy/i,
  /structure|schema|interface|contract/i,

  // Key outcomes
  /implemented|completed|fixed|resolved|solved/i,
  /created|added|updated|modified|refactored/i,
  /the solution|the fix|the approach/i,

  // Important context
  /important|critical|note that|keep in mind/i,
  /caveat|limitation|constraint|requirement/i,
  /blocker|issue|problem|error|bug/i,
];

// Content patterns that indicate STANDARD value
const VALUABLE_PATTERNS = [
  /function\s+\w+/i,
  /class\s+\w+/i,
  /interface\s+\w+/i,
  /import\s+/,
  /export\s+/,
  /const\s+\w+\s*=/,
  /let\s+\w+\s*=/,
  /def\s+\w+/,
  /however|although|while|whereas/i,
  /should|must|need to|have to/i,
  /config|setting|option|parameter/i,
];

// ============================================================================
// Transcript Parsing
// ============================================================================

/**
 * Parse a JSONL transcript file
 * Returns messages with parsing statistics
 */
export async function parseTranscript(
  transcriptPath: string
): Promise<ParseResult> {
  const result: ParseResult = {
    messages: [],
    stats: {
      totalLines: 0,
      parsedLines: 0,
      skippedLines: 0,
      emptyLines: 0,
      parseErrors: 0,
    },
  };

  if (!fs.existsSync(transcriptPath)) {
    return result;
  }

  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    result.stats.totalLines++;

    if (!line.trim()) {
      result.stats.emptyLines++;
      continue;
    }

    try {
      const parsed = JSON.parse(line);

      // Handle different transcript formats
      if (parsed.role && parsed.content) {
        // Direct message format
        const content = extractTextContent(parsed.content);
        if (content) {
          result.messages.push({
            role: parsed.role,
            content,
            timestamp: parsed.timestamp,
          });
          result.stats.parsedLines++;
        } else {
          result.stats.skippedLines++;
        }
      } else if ((parsed.type === 'message' || parsed.type === 'user' || parsed.type === 'assistant') && parsed.message) {
        // Wrapped message format (Claude Code uses type: 'user' or 'assistant')
        const content = extractTextContent(parsed.message.content);
        if (content) {
          result.messages.push({
            role: parsed.message.role,
            content,
            timestamp: parsed.timestamp,
          });
          result.stats.parsedLines++;
        } else {
          result.stats.skippedLines++;
        }
      } else {
        // Line parsed but not a message format we recognize
        result.stats.skippedLines++;
      }
    } catch {
      // Malformed JSON
      result.stats.parseErrors++;
    }
  }

  return result;
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
 * Returns: 0 = not valuable, 1 = standard value, 2 = high value
 */
function getContentValue(content: string): number {
  // Check high-value patterns first
  for (const pattern of HIGH_VALUE_PATTERNS) {
    if (pattern.test(content)) {
      return 2;  // High value - decisions, architecture, outcomes
    }
  }

  // Check standard value patterns
  for (const pattern of VALUABLE_PATTERNS) {
    if (pattern.test(content)) {
      return 1;  // Standard value - code, explanations
    }
  }

  // Check for reasonable length and structure (at least 15 words)
  const words = content.split(/\s+/).length;
  if (words >= 15) {
    return 1;  // Substantial content
  }

  return 0;  // Not valuable enough
}

/**
 * Legacy function for backwards compatibility
 */
function isValuable(content: string): boolean {
  return getContentValue(content) > 0;
}

/**
 * Extract meaningful chunks from content
 * Optimized for Nomic Embed v1.5 with 200-600 char target range
 */
function extractChunks(content: string, role: 'user' | 'assistant' = 'assistant'): string[] {
  const chunks: string[] = [];

  // Split by paragraphs or significant breaks
  const paragraphs = content.split(/\n\n+/);

  for (const para of paragraphs) {
    const trimmed = para.trim();

    if (trimmed.length < MIN_CONTENT_LENGTH) {
      continue;
    }

    // If paragraph is within optimal range, keep it whole
    if (trimmed.length <= MAX_CHUNK_SIZE) {
      chunks.push(trimmed);
      continue;
    }

    // For longer paragraphs, use semantic splitting
    // First try splitting by sentences
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      const potentialLength = currentChunk.length + (currentChunk ? 1 : 0) + sentence.length;

      // If adding this sentence exceeds max, save current and start new
      if (potentialLength > MAX_CHUNK_SIZE && currentChunk.length >= MIN_CONTENT_LENGTH) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
      // If current chunk is at optimal size and sentence is long, save and start new
      else if (currentChunk.length >= OPTIMAL_CHUNK_SIZE && sentence.length > 100) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
      else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.length >= MIN_CONTENT_LENGTH) {
      chunks.push(currentChunk.trim());
    }
  }

  // For user messages, prefix with context marker for better retrieval
  if (role === 'user' && chunks.length > 0) {
    return chunks.map(chunk => `[User request] ${chunk}`);
  }

  return chunks;
}

// ============================================================================
// Session Summary Extraction (LLM-free pattern matching)
// ============================================================================

// Patterns that indicate decisions
const DECISION_PATTERNS = [
  /(?:decided|chose|went with|opted for|selected|picked|using)\s+(.{20,150})/gi,
  /(?:the approach|the solution|the fix)\s+(?:is|was|will be)\s+(.{20,150})/gi,
  /(?:we(?:'ll| will)|I(?:'ll| will))\s+(?:use|implement|go with)\s+(.{20,100})/gi,
];

// Patterns that indicate outcomes/completions
const OUTCOME_PATTERNS = [
  /(?:implemented|completed|fixed|resolved|added|created|built)\s+(.{20,150})/gi,
  /(?:now works|is working|successfully)\s+(.{10,100})/gi,
  /(?:the (?:feature|bug|issue|problem))\s+(?:has been|was)\s+(.{20,100})/gi,
];

// Patterns that indicate blockers/issues
const BLOCKER_PATTERNS = [
  /(?:blocked by|stuck on|can't|cannot|unable to)\s+(.{20,150})/gi,
  /(?:error|issue|problem|bug)(?::|was|is)\s+(.{20,150})/gi,
  /(?:need to|have to|must)\s+(?:first|before)\s+(.{20,100})/gi,
];

/**
 * Extract key information from messages using pattern matching
 */
function extractSessionInsights(messages: TranscriptMessage[]): {
  decisions: string[];
  outcomes: string[];
  blockers: string[];
  summary: string;
} {
  const decisions: string[] = [];
  const outcomes: string[] = [];
  const blockers: string[] = [];

  // Track what was discussed for summary
  const topics = new Set<string>();

  for (const msg of messages) {
    const content = msg.content;

    // Extract decisions
    for (const pattern of DECISION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const extracted = match[1]?.trim();
        if (extracted && extracted.length > 20 && !decisions.includes(extracted)) {
          decisions.push(extracted.substring(0, 150));
          if (decisions.length >= 5) break;
        }
      }
    }

    // Extract outcomes
    for (const pattern of OUTCOME_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const extracted = match[1]?.trim();
        if (extracted && extracted.length > 15 && !outcomes.includes(extracted)) {
          outcomes.push(extracted.substring(0, 150));
          if (outcomes.length >= 5) break;
        }
      }
    }

    // Extract blockers
    for (const pattern of BLOCKER_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const extracted = match[1]?.trim();
        if (extracted && extracted.length > 15 && !blockers.includes(extracted)) {
          blockers.push(extracted.substring(0, 150));
          if (blockers.length >= 3) break;
        }
      }
    }

    // Extract topics from user messages
    if (msg.role === 'user' && msg.content.length > 30) {
      // Get first sentence or first 100 chars as topic hint
      const firstSentence = content.split(/[.!?]/)[0]?.trim();
      if (firstSentence && firstSentence.length > 10) {
        topics.add(firstSentence.substring(0, 80));
      }
    }
  }

  // Build summary from topics and outcomes
  let summary = '';
  const topicList = Array.from(topics).slice(0, 3);

  if (topicList.length > 0) {
    summary = `Session topics: ${topicList.join('; ')}`;
  }

  if (outcomes.length > 0) {
    summary += summary ? '. ' : '';
    summary += `Completed: ${outcomes.slice(0, 2).join(', ')}`;
  }

  if (decisions.length > 0) {
    summary += summary ? '. ' : '';
    summary += `Key decisions: ${decisions.length}`;
  }

  if (!summary) {
    summary = `Session with ${messages.length} messages`;
  }

  return {
    decisions: decisions.slice(0, 5),
    outcomes: outcomes.slice(0, 5),
    blockers: blockers.slice(0, 3),
    summary: summary.substring(0, 500),
  };
}

// ============================================================================
// Session Turn Storage (for precise restoration)
// ============================================================================

/**
 * Save raw conversation turns for restoration after /clear
 * Keeps the last N turns (user + assistant messages) with timestamps
 */
export async function saveSessionTurns(
  db: SqlJsDatabase,
  transcriptPath: string,
  projectId: string | null,
  maxTurns: number = 6
): Promise<number> {
  const { messages } = await parseTranscript(transcriptPath);

  // Get session ID from transcript path
  const sessionId = getSessionId(transcriptPath);

  // Filter to user and assistant messages only, take last N
  const relevantMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-maxTurns);

  if (relevantMessages.length === 0) {
    return 0;
  }

  // Clear existing turns for this project before saving new ones
  clearProjectTurns(db, projectId);

  let savedCount = 0;
  for (let i = 0; i < relevantMessages.length; i++) {
    const msg = relevantMessages[i];
    insertTurn(db, {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      projectId,
      sessionId,
      turnIndex: i,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    });
    savedCount++;
  }

  return savedCount;
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
  const { messages, stats: parseStats } = await parseTranscript(transcriptPath);

  if (messages.length === 0) {
    return result;
  }

  // Log parse stats if there were errors
  if (parseStats.parseErrors > 0) {
    console.error(`[Cortex] Warning: ${parseStats.parseErrors} lines failed to parse in transcript`);
  }

  // Extract and filter content from BOTH user and assistant messages
  // User messages provide context; assistant messages provide answers
  const contentToArchive: Array<{
    content: string;
    timestamp: Date;
    value: number;  // 1 = standard, 2 = high value
  }> = [];

  for (const message of messages) {
    // Process both user and assistant messages
    const role = message.role as 'user' | 'assistant';
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }

    // For user messages, only keep substantial requests (not short commands)
    if (role === 'user' && message.content.length < 200) {
      continue;
    }

    const chunks = extractChunks(message.content, role);

    for (const chunk of chunks) {
      if (chunk.length < minLength) {
        result.skipped++;
        continue;
      }

      if (shouldExclude(chunk)) {
        result.skipped++;
        continue;
      }

      const value = getContentValue(chunk);
      if (value === 0) {
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
        value,
      });
    }
  }

  // Sort by value (high-value content first) to prioritize if we hit limits
  contentToArchive.sort((a, b) => b.value - a.value);

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

  // Also save raw turns for precise restoration after /clear
  const turnCount = config.automation.restorationTurnCount * 2; // * 2 for user+assistant pairs
  await saveSessionTurns(db, transcriptPath, projectId, turnCount);

  // Extract and save session summary (LLM-free pattern matching)
  const insights = extractSessionInsights(messages);
  if (insights.summary || insights.decisions.length > 0 || insights.outcomes.length > 0) {
    upsertSessionSummary(db, {
      projectId,
      sessionId,
      summary: insights.summary,
      keyDecisions: insights.decisions,
      keyOutcomes: insights.outcomes,
      blockers: insights.blockers,
      fragmentsSaved: result.archived,
      timestamp: new Date(),
    });
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
  turns: Array<{  // Raw conversation turns for precise restoration
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  fragments: Array<{  // Semantic memory fragments
    content: string;
    timestamp: Date;
  }>;
  estimatedTokens: number;
}

/**
 * Build restoration context from recent turns and memories
 * Used after context clear to restore continuity
 * Prioritizes raw turns for precise context, supplements with semantic fragments
 */
export async function buildRestorationContext(
  db: SqlJsDatabase,
  projectId: string | null,
  options: {
    messageCount?: number;
    tokenBudget?: number;
    turnCount?: number;
  } = {}
): Promise<RestorationContext> {
  const config = loadConfig();
  const {
    messageCount = 5,
    tokenBudget = config.automation.restorationTokenBudget,
    turnCount = config.automation.restorationTurnCount * 2  // * 2 for user+assistant pairs
  } = options;

  const tokensPerChar = 0.25; // Rough estimate
  let totalTokens = 0;

  // 1. Get raw turns first (primary restoration data - preserves conversation flow)
  const rawTurns = getRecentTurns(db, projectId, turnCount);
  const includedTurns: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> = [];

  // Allocate 70% of budget for turns, 30% for semantic fragments
  const turnsBudget = Math.floor(tokenBudget * 0.7);
  let turnsTokens = 0;

  for (const turn of rawTurns) {
    // Truncate very long turns to 600 chars
    const truncatedContent = turn.content.length > 600
      ? turn.content.substring(0, 600) + '...'
      : turn.content;
    const turnTokens = Math.ceil(truncatedContent.length * tokensPerChar);

    if (turnsTokens + turnTokens > turnsBudget) {
      break;
    }

    includedTurns.push({
      role: turn.role,
      content: truncatedContent,
      timestamp: turn.timestamp,
    });
    turnsTokens += turnTokens;
  }

  totalTokens += turnsTokens;

  // 2. Get semantic fragments for remaining budget (supplements with broader context)
  const fragmentsBudget = tokenBudget - totalTokens;
  const fragments: Array<{ content: string; timestamp: Date }> = [];

  if (fragmentsBudget > 100) {
    // Import search functions dynamically to avoid circular dependency
    const { searchByVector } = await import('./database.js');
    const { embedQuery } = await import('./embeddings.js');

    // Query for recent context
    const queryEmbedding = await embedQuery('recent work summary context decisions');
    const results = searchByVector(db, queryEmbedding, projectId, messageCount * 2);

    for (const result of results) {
      // Truncate to 300 chars for fragments
      const truncatedContent = result.content.length > 300
        ? result.content.substring(0, 300) + '...'
        : result.content;
      const contentTokens = Math.ceil(truncatedContent.length * tokensPerChar);

      if (totalTokens + contentTokens > tokenBudget) {
        break;
      }

      fragments.push({
        content: truncatedContent,
        timestamp: result.timestamp,
      });
      totalTokens += contentTokens;

      if (fragments.length >= messageCount) {
        break;
      }
    }
  }

  // Build summary
  const hasContent = includedTurns.length > 0 || fragments.length > 0;
  let summary = 'No recent context available.';
  if (hasContent) {
    const parts: string[] = [];
    if (includedTurns.length > 0) {
      parts.push(`${includedTurns.length} turns`);
    }
    if (fragments.length > 0) {
      parts.push(`${fragments.length} memories`);
    }
    summary = `Restored ${parts.join(' and ')} from ${projectId || 'global'}.`;
  }

  return {
    hasContent,
    summary,
    turns: includedTurns,
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

  // Format raw turns (primary - conversation continuity)
  if (context.turns.length > 0) {
    lines.push('--- Recent Conversation ---');
    for (const turn of context.turns) {
      const timeAgo = formatTimeAgo(turn.timestamp);
      const roleLabel = turn.role === 'user' ? 'User' : 'Assistant';
      lines.push(`[${roleLabel}] (${timeAgo})`);
      lines.push(turn.content);
      lines.push('');
    }
  }

  // Format semantic fragments (secondary - broader context)
  if (context.fragments.length > 0) {
    lines.push('--- Related Memories ---');
    for (let i = 0; i < context.fragments.length; i++) {
      const fragment = context.fragments[i];
      const timeAgo = formatTimeAgo(fragment.timestamp);
      lines.push(`[${i + 1}] (${timeAgo})`);
      lines.push(fragment.content);
      lines.push('');
    }
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
