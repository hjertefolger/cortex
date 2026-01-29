/**
 * Cortex Hybrid Search Module
 * Combines vector similarity and keyword search with recency decay
 */

import type { Database } from 'bun:sqlite';
import { searchByVector, searchByKeyword } from './database.js';
import { embedQuery } from './embeddings.js';
import type { SearchResult, SearchOptions } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

// Weights for combining scores
const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

// Recency decay: 7-day half-life
const RECENCY_HALF_LIFE_DAYS = 7;

// RRF (Reciprocal Rank Fusion) constant
const RRF_K = 60;

// ============================================================================
// Hybrid Search
// ============================================================================

/**
 * Perform hybrid search combining vector similarity and keyword matching
 */
export async function hybridSearch(
  db: Database,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    projectScope = true,
    projectId,
    limit = 5,
    includeAllProjects = false,
  } = options;

  // Determine project filter
  // When projectId is null (root/global), search all projects unless explicitly scoped
  const projectFilter = includeAllProjects
    ? undefined
    : projectScope && projectId !== null
      ? projectId
      : undefined;

  // Run vector and keyword searches in parallel
  const queryEmbedding = await embedQuery(query);

  const [vectorResults, keywordResults] = await Promise.all([
    searchByVector(db, queryEmbedding, projectFilter, limit * 2),
    searchByKeyword(db, query, projectFilter, limit * 2),
  ]);

  // Combine results using RRF (Reciprocal Rank Fusion)
  const combined = combineWithRRF(vectorResults, keywordResults);

  // Apply recency decay
  const withRecency = applyRecencyDecay(combined);

  // Sort by final score and limit
  const sorted = withRecency
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return sorted;
}

/**
 * Vector-only search (useful for semantic similarity)
 */
export async function vectorSearch(
  db: Database,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    projectScope = true,
    projectId,
    limit = 5,
    includeAllProjects = false,
  } = options;

  // When projectId is null (root/global), search all projects unless explicitly scoped
  const projectFilter = includeAllProjects
    ? undefined
    : projectScope && projectId !== null
      ? projectId
      : undefined;

  const queryEmbedding = await embedQuery(query);
  const results = searchByVector(db, queryEmbedding, projectFilter, limit);

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    content: r.content,
    source: 'vector' as const,
    timestamp: r.timestamp,
    projectId: r.projectId,
  }));
}

/**
 * Keyword-only search (useful for exact matches)
 */
export async function keywordSearch(
  db: Database,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    projectScope = true,
    projectId,
    limit = 5,
    includeAllProjects = false,
  } = options;

  // When projectId is null (root/global), search all projects unless explicitly scoped
  const projectFilter = includeAllProjects
    ? undefined
    : projectScope && projectId !== null
      ? projectId
      : undefined;

  const results = searchByKeyword(db, query, projectFilter, limit);

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    content: r.content,
    source: 'keyword' as const,
    timestamp: r.timestamp,
    projectId: r.projectId,
  }));
}

// ============================================================================
// Score Combination
// ============================================================================

interface ScoredItem {
  id: number;
  content: string;
  score: number;
  timestamp: Date;
  projectId: string | null;
}

/**
 * Combine results using Reciprocal Rank Fusion (RRF)
 * This is more robust than simple weighted combination
 */
function combineWithRRF(
  vectorResults: ScoredItem[],
  keywordResults: ScoredItem[]
): SearchResult[] {
  const scores = new Map<number, {
    rrfScore: number;
    content: string;
    timestamp: Date;
    projectId: string | null;
    sources: Set<'vector' | 'keyword'>;
  }>();

  // Add vector results with RRF scoring
  vectorResults.forEach((result, rank) => {
    const rrfScore = VECTOR_WEIGHT / (RRF_K + rank + 1);

    if (!scores.has(result.id)) {
      scores.set(result.id, {
        rrfScore: 0,
        content: result.content,
        timestamp: result.timestamp,
        projectId: result.projectId,
        sources: new Set(),
      });
    }

    const entry = scores.get(result.id)!;
    entry.rrfScore += rrfScore;
    entry.sources.add('vector');
  });

  // Add keyword results with RRF scoring
  keywordResults.forEach((result, rank) => {
    const rrfScore = KEYWORD_WEIGHT / (RRF_K + rank + 1);

    if (!scores.has(result.id)) {
      scores.set(result.id, {
        rrfScore: 0,
        content: result.content,
        timestamp: result.timestamp,
        projectId: result.projectId,
        sources: new Set(),
      });
    }

    const entry = scores.get(result.id)!;
    entry.rrfScore += rrfScore;
    entry.sources.add('keyword');
  });

  // Convert to SearchResult array
  return Array.from(scores.entries()).map(([id, data]) => {
    // Determine source label
    let source: 'vector' | 'keyword' | 'hybrid';
    if (data.sources.has('vector') && data.sources.has('keyword')) {
      source = 'hybrid';
    } else if (data.sources.has('vector')) {
      source = 'vector';
    } else {
      source = 'keyword';
    }

    return {
      id,
      score: data.rrfScore,
      content: data.content,
      source,
      timestamp: data.timestamp,
      projectId: data.projectId,
    };
  });
}

// ============================================================================
// Recency Decay
// ============================================================================

/**
 * Apply exponential recency decay to scores
 * Half-life determines how quickly older memories lose relevance
 */
function applyRecencyDecay(results: SearchResult[]): SearchResult[] {
  const now = Date.now();
  const halfLifeMs = RECENCY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

  return results.map((result) => {
    const ageMs = now - result.timestamp.getTime();
    const decayFactor = Math.pow(0.5, ageMs / halfLifeMs);

    // Blend original score with decay (70% score, 30% recency)
    const decayedScore = result.score * (0.7 + 0.3 * decayFactor);

    return {
      ...result,
      score: decayedScore,
    };
  });
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format search results for display
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No matching memories found.';
  }

  const lines: string[] = [];
  lines.push(`Found ${results.length} matching memories:\n`);

  results.forEach((result, index) => {
    const scorePercent = Math.round(result.score * 100);
    const timeAgo = formatTimeAgo(result.timestamp);
    const project = result.projectId ? `[${result.projectId}]` : '[global]';
    const sourceLabel = result.source === 'hybrid' ? '⚡' : result.source === 'vector' ? '🎯' : '🔤';

    lines.push(`${index + 1}. ${sourceLabel} ${project} (${scorePercent}% • ${timeAgo})`);

    // Truncate content if too long
    const maxLen = 200;
    const content = result.content.length > maxLen
      ? result.content.substring(0, maxLen) + '...'
      : result.content;

    lines.push(`   ${content}`);
    lines.push('');
  });

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
