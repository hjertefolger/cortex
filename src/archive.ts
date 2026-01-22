/**
 * Cortex Archive Module
 * Parses Claude Code transcripts, extracts meaningful content,
 * generates embeddings, and stores in the database
 */

import * as fs from 'fs';
import * as readline from 'readline';
import type { Database as SqlJsDatabase } from 'sql.js';
import { insertMemory, contentExists, saveDb, insertTurn, getRecentTurns, upsertSessionSummary, getSessionProgress, updateSessionProgress, clearOldTurns } from './database.js';
import { embedBatch } from './embeddings.js';
import { loadConfig } from './config.js';
import type { ArchiveResult, TranscriptMessage, ParseResult } from './types.js';

// ============================================================================
// Configuration - Optimized for Nomic Embed v1.5
// ============================================================================

// Chunk size settings (research-backed optimal range for semantic search)
const MIN_CONTENT_LENGTH = 75;  // Adjusted to capture code snippets
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
  // /^```[\s\S]*```$/,  // Removed: Code blocks ARE valuable
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
  transcriptPath: string,
  startLine: number = 0
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

  // Track tool IDs to names to filter outputs intelligently
  // Persists across lines since tool_use and tool_result are separated
  const toolIdMap = new Map<string, string>();

  let currentLine = 0;
  for await (const line of rl) {
    currentLine++;

    if (currentLine <= startLine) {
      result.stats.totalLines++; // Keep total count accurate
      continue;
    }

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
        const content = extractTextContent(parsed.content, toolIdMap);
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
      } else if ((parsed.type === 'message' || parsed.type === 'user' || parsed.type === 'assistant' || parsed.type === 'tool_use' || parsed.type === 'tool_result') && parsed.message) {
        // Wrapped message format (Claude Code uses type: 'user' or 'assistant')
        const content = extractTextContent(parsed.message.content, toolIdMap);
        if (content) {
          result.messages.push({
            role: parsed.message.role || (parsed.type === 'tool_result' ? 'user' : 'assistant'),
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
 * Uses toolIdMap to intelligently filter tool outputs
 */
function extractTextContent(content: unknown, toolIdMap: Map<string, string>): string {
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
        } else if ('thinking' in item && typeof item.thinking === 'string') {
          // Include thinking blocks as they contain valuable context/reasoning
          textParts.push(`[Thinking] ${item.thinking}`);
        } else if (item.type === 'tool_use') {
          // Track tool ID
          if (item.id && item.name) {
            toolIdMap.set(item.id, item.name);
          }

          // Capture tool usage (code writing, commands)
          const input = item.input || {};
          const name = item.name;

          if (name === 'write_to_file' || name === 'Write') {
            // Prioritize capturing written code
            const code = input.content || input.code;
            if (code) textParts.push(`[Code Written] ${name}:\n${code}`);
          } else if (name === 'replace_file_content' || name === 'Edit') {
            const code = input.replacement || input.new_string || input.content;
            if (code) textParts.push(`[Code Written] ${name}:\n${code}`);
            // Also capture instruction
            if (input.instruction) textParts.push(`[Task] ${input.instruction}`);
          } else if (name === 'run_command' || name === 'Bash') {
            if (input.command) textParts.push(`[Command] ${input.command}`);
          } else if (name === 'Task') {
            if (input.prompt) textParts.push(`[Task] ${input.prompt}`);
          } else {
            // Generic tool use - minimal info
            textParts.push(`[Tool Use] ${name}`);
          }
        } else if (item.type === 'tool_result') {
          // Filter based on tool type using map
          const toolName = toolIdMap.get(item.tool_use_id);
          const isCommand = toolName === 'run_command' || toolName === 'Bash' || toolName === 'repl';

          // DROP read_file, search, and other info-gathering outputs (already in repo/noise)
          // ONLY keep run_command outputs (test results, errors, logs)
          if (!isCommand) {
            // Skip completely
            continue;
          }

          let result = typeof item.content === 'string' ? item.content :
            Array.isArray(item.content) ? extractTextContent(item.content, toolIdMap) : '';

          // Truncate even command outputs if excessive
          if (result.length > 500) {
            result = result.substring(0, 500) + '... [Output truncated]';
          }

          textParts.push(`[Tool Output] ${result}`);
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
  // Always value code blocks
  if (content.includes('```')) {
    return 1;
  }

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

  // 1. preserve code blocks by replacing them with placeholders
  const codeBlockMatches: string[] = [];
  const placeholderPrefix = '___CORTEX_CODE_BLOCK_';

  const protectedContent = content.replace(/```[\s\S]*?```/g, (match) => {
    codeBlockMatches.push(match);
    return `${placeholderPrefix}${codeBlockMatches.length - 1}___`;
  });

  // 2. Split by paragraphs or significant breaks
  // We use lookahead to keep the delimiters or just split
  const paragraphs = protectedContent.split(/\n\n+/);

  for (const para of paragraphs) {
    let text = para.trim();

    // 3. Restore code blocks
    if (text.includes(placeholderPrefix)) {
      text = text.replace(new RegExp(`${placeholderPrefix}(\\d+)___`, 'g'), (_, index) => {
        return codeBlockMatches[parseInt(index)];
      });
    }

    const trimmed = text.trim();

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
 * Append new conversation turns to the session history
 */
export async function appendSessionTurns(
  db: SqlJsDatabase,
  newMessages: TranscriptMessage[],
  projectId: string | null,
  sessionId: string
): Promise<number> {
  if (newMessages.length === 0) {
    return 0;
  }

  // Filter to user and assistant messages only
  const relevantMessages = newMessages
    .filter(m => m.role === 'user' || m.role === 'assistant');

  if (relevantMessages.length === 0) {
    return 0;
  }

  // Get current max turn index to append correctly
  const result = db.exec(
    `SELECT MAX(turn_index) FROM session_turns WHERE session_id = ?`,
    [sessionId]
  );
  let nextIndex = (result[0]?.values[0]?.[0] as number ?? -1) + 1;

  let savedCount = 0;
  for (const msg of relevantMessages) {
    insertTurn(db, {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      projectId,
      sessionId,
      turnIndex: nextIndex++,
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

  const sessionId = getSessionId(transcriptPath);

  // Incremental processing: get last line
  const startLine = getSessionProgress(db, sessionId);

  // Parse transcript from last position
  const { messages, stats: parseStats } = await parseTranscript(transcriptPath, startLine);

  if (messages.length === 0) {
    // Even if no messages, we might have skipped lines effectively
    if (parseStats.totalLines > startLine) {
      updateSessionProgress(db, sessionId, parseStats.totalLines);
      saveDb(db);
    }
    return result;
  }

  // Log parse stats if there were errors
  if (parseStats.parseErrors > 0 || parseStats.skippedLines > 0) {
    console.log(`Debug Parse Stats: Total: ${parseStats.totalLines}, Parsed: ${parseStats.parsedLines}, Skipped: ${parseStats.skippedLines}, Errors: ${parseStats.parseErrors}`);
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

  const totalExtractedLength = contentToArchive.reduce((sum, c) => sum + c.content.length, 0);
  console.log(`Debug: Extracted ${contentToArchive.length} chunks (${totalExtractedLength} chars) from ${messages.length} messages`);

  if (contentToArchive.length === 0) {
    return result;
  }

  // Generate embeddings in batches
  const texts = contentToArchive.map((c) => c.content);
  const embeddings = await embedBatch(texts, {
    onProgress: options.onProgress,
  });

  // Store in database
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

  // Update session progress
  updateSessionProgress(db, sessionId, parseStats.totalLines);

  // Also save raw turns for precise restoration after /clear
  await appendSessionTurns(db, messages, projectId, sessionId);

  // Prune old turns to keep database size manageable
  const turnLimit = config.restoration.turnCount * 4; // Keep generous history for safety
  clearOldTurns(db, turnLimit);

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
    tokenBudget = config.restoration.tokenBudget,
    turnCount = config.restoration.turnCount * 2  // * 2 for user+assistant pairs
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
