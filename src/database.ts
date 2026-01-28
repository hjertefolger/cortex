/**
 * Cortex Database Module
 * SQLite database with vector storage using bun:sqlite
 * FTS5 is included in Bun's SQLite build
 */

import * as fs from 'fs';
import { Database } from 'bun:sqlite';
import { getDatabasePath, ensureDataDir, getBackupsDir, ensureBackupsDir } from './config.js';
import * as path from 'path';
import type { Memory, MemoryInput, DbStats, SessionTurn, TurnInput, SessionSummaryInput } from './types.js';
import * as crypto from 'crypto';

// ============================================================================ 
// Database Initialization
// ============================================================================ 

let dbInstance: Database | null = null;

/**
 * Initialize SQLite and load or create database
 */
export async function initDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  ensureDataDir();
  const dbPath = getDatabasePath();

  // Create backup before loading existing database
  createBackupOnStartup();

  dbInstance = new Database(dbPath, { create: true });
  
  // Enable WAL for concurrency/speed and reliability
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  dbInstance.exec("PRAGMA synchronous = NORMAL;");

  createSchema(dbInstance);

  return dbInstance;
}

// ============================================================================ 
// Database Backup & Recovery
// ============================================================================ 

const MAX_BACKUPS = 5;

/**
 * Create a backup of the database before loading
 * Only creates backup if the database file exists and has content
 */
function createBackupOnStartup(): void {
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dbPath)) {
    return;
  }

  const stats = fs.statSync(dbPath);
  if (stats.size === 0) {
    return;
  }

  ensureBackupsDir();
  const backupsDir = getBackupsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `memory.db.backup.${timestamp}`);

  try {
    fs.copyFileSync(dbPath, backupPath);
    rotateBackups();
  } catch {
    // Backup failures are non-fatal
  }
}

/**
 * Rotate backups, keeping only the most recent MAX_BACKUPS
 */
function rotateBackups(): void {
  const backupsDir = getBackupsDir();

  if (!fs.existsSync(backupsDir)) {
    return;
  }

  const files = fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('memory.db.backup.'))
    .map(f => ({
      name: f,
      path: path.join(backupsDir, f),
      mtime: fs.statSync(path.join(backupsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);  // Newest first

  // Remove old backups
  for (let i = MAX_BACKUPS; i < files.length; i++) {
    try {
      fs.unlinkSync(files[i].path);
    } catch {
      // Ignore deletion errors
    }
  }
}

/**
 * Get list of available backup files, sorted by date (newest first)
 */
export function getBackupFiles(): string[] {
  const backupsDir = getBackupsDir();

  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  return fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('memory.db.backup.'))
    .map(f => path.join(backupsDir, f))
    .sort((a, b) => {
      const aTime = fs.statSync(a).mtime.getTime();
      const bTime = fs.statSync(b).mtime.getTime();
      return bTime - aTime;  // Newest first
    });
}

/**
 * Database validation result
 */
export interface DatabaseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tablesFound: string[];
  integrityCheck: boolean;
  fts5Available: boolean;
  embeddingDimension: number | null;
}

/**
 * Validate database structure and integrity
 */
export function validateDatabase(db: Database): DatabaseValidationResult {
  const result: DatabaseValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    tablesFound: [],
    integrityCheck: false,
    fts5Available: true, // Bun includes FTS5
    embeddingDimension: null,
  };

  // Check required tables
  const requiredTables = ['memories', 'session_turns', 'session_summaries'];
  try {
    const tables = db.query(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    result.tablesFound = tableNames;

    for (const table of requiredTables) {
      if (!tableNames.includes(table)) {
        result.errors.push(`Missing required table: ${table}`);
        result.valid = false;
      }
    }
  } catch (error) {
    result.errors.push(`Failed to query tables: ${error instanceof Error ? error.message : String(error)}`);
    result.valid = false;
  }

  // Run SQLite integrity check
  try {
    const integrity = db.query(`PRAGMA integrity_check`).get() as any;
    // integrity_check returns a single row with column "integrity_check"
    const status = Object.values(integrity)[0];
    result.integrityCheck = status === 'ok';
    if (!result.integrityCheck) {
      result.errors.push(`Integrity check failed: ${status}`);
      result.valid = false;
    }
  } catch (error) {
    result.errors.push(`Integrity check error: ${error instanceof Error ? error.message : String(error)}`);
    result.valid = false;
  }

  // Check embedding dimension
  try {
    const row = db.query(`SELECT embedding FROM memories LIMIT 1`).get() as { embedding: Buffer } | null;
    if (row && row.embedding) {
      result.embeddingDimension = row.embedding.length / 4;  // Float32 = 4 bytes
      if (result.embeddingDimension !== 768) {
        result.warnings.push(`Embedding dimension is ${result.embeddingDimension}, expected 768`);
      }
    }
  } catch {
    // No embeddings yet is fine
  }

  return result;
}

/**
 * Create database schema
 */
function createSchema(db: Database): void {
  // Main memories table
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      embedding BLOB NOT NULL,
      project_id TEXT,
      source_session TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash)`);

  // Session turns table (for precise restoration after /clear)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      project_id TEXT,
      session_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_turns_project ON session_turns(project_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_turns_session ON session_turns(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_turns_timestamp ON session_turns(timestamp DESC)`);

  // Session summaries table (captures session-level context without full transcript)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      session_id TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      key_decisions TEXT,
      key_outcomes TEXT,
      blockers TEXT,
      context_at_save INTEGER,
      fragments_saved INTEGER,
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_summaries_timestamp ON session_summaries(timestamp DESC)`);

  // Session progress table (for incremental indexing)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_progress (
      session_id TEXT PRIMARY KEY,
      last_processed_line INTEGER NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // FTS5 virtual table
  try {
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        content='memories',
        content_rowid='id'
      )
    `);

    // Triggers to keep FTS5 in sync
    db.run(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
      END
    `);

    db.run(`
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END
    `);
  } catch (e) {
    console.warn("FTS5 setup failed, keyword search may degrade:", e);
  }
}

/**
 * Save database to disk
 * No-op in bun:sqlite (WAL mode handles persistence)
 */
export function saveDb(db: Database): void {
  // Optional: Force checkpoint if strict consistency required instantly
  // db.exec("PRAGMA wal_checkpoint(PASSIVE);");
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Check if FTS5 is enabled
 */
export function isFts5Enabled(): boolean {
  return true; // Bun includes it
}

// ============================================================================ 
// Memory Operations
// ============================================================================ 

/**
 * Generate content hash for deduplication
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex').substring(0, 16);
}

/**
 * Convert Float32Array to Buffer for storage
 */
function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Convert Buffer back to Float32Array
 */
function bufferToEmbedding(buffer: Buffer): Float32Array {
  // Ensure we have a proper ArrayBuffer underlying
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

/**
 * Insert a new memory
 */
export function insertMemory(
  db: Database,
  memory: MemoryInput
): { id: number; isDuplicate: boolean } {
  const hash = hashContent(memory.content);

  // Check for duplicate
  const existing = db.query(
    `SELECT id FROM memories WHERE content_hash = $hash`
  ).get({ $hash: hash }) as { id: number } | null;

  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  // Insert new memory
  const result = db.query(`
    INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
    VALUES ($content, $hash, $embedding, $projectId, $sourceSession, $timestamp)
    RETURNING id
  `).get({
    $content: memory.content,
    $hash: hash,
    $embedding: embeddingToBuffer(memory.embedding),
    $projectId: memory.projectId,
    $sourceSession: memory.sourceSession,
    $timestamp: memory.timestamp.toISOString(),
  }) as { id: number };

  return { id: result.id, isDuplicate: false };
}

/**
 * Get memory by ID
 */
export function getMemory(db: Database, id: number): Memory | null {
  const row = db.query(
    `SELECT id, content, content_hash, embedding, project_id, source_session, timestamp
     FROM memories WHERE id = $id`
  ).get({ $id: id }) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    content: row.content,
    contentHash: row.content_hash,
    embedding: bufferToEmbedding(row.embedding),
    projectId: row.project_id,
    sourceSession: row.source_session,
    timestamp: new Date(row.timestamp),
  };
}

/**
 * Check if content already exists
 */
export function contentExists(db: Database, content: string): boolean {
  const hash = hashContent(content);
  const result = db.query(
    `SELECT 1 FROM memories WHERE content_hash = $hash LIMIT 1`
  ).get({ $hash: hash });
  return !!result;
}

/**
 * Delete memory by ID
 */
export function deleteMemory(db: Database, id: number): boolean {
  const result = db.query(`DELETE FROM memories WHERE id = $id`).run({ $id: id });
  return result.changes > 0;
}

/**
 * Store a manual memory (from cortex_remember tool)
 */
export function storeManualMemory(
  db: Database,
  content: string,
  embedding: Float32Array,
  projectId: string | null,
  context?: string
): { id: number; isDuplicate: boolean } {
  const fullContent = context
    ? `${content}\n\n[Context: ${context}]`
    : content;

  const sessionId = `manual-${Date.now()}`;

  return insertMemory(db, {
    content: fullContent,
    embedding,
    projectId,
    sourceSession: sessionId,
    timestamp: new Date(),
  });
}

/**
 * Update memory content by ID
 */
export function updateMemory(
  db: Database,
  id: number,
  newContent: string,
  newEmbedding: Float32Array
): boolean {
  const newHash = hashContent(newContent);

  const result = db.query(`
    UPDATE memories SET content = $content, content_hash = $hash, embedding = $embedding
    WHERE id = $id
  `).run({
    $content: newContent,
    $hash: newHash,
    $embedding: embeddingToBuffer(newEmbedding),
    $id: id
  });

  return result.changes > 0;
}

/**
 * Update memory project ID
 */
export function updateMemoryProjectId(
  db: Database,
  id: number,
  newProjectId: string | null
): boolean {
  const result = db.query(
    `UPDATE memories SET project_id = $projectId WHERE id = $id`
  ).run({ $projectId: newProjectId, $id: id });

  return result.changes > 0;
}

/**
 * Bulk rename project
 */
export function renameProject(
  db: Database,
  oldProjectId: string,
  newProjectId: string
): number {
  const result = db.query(
    `UPDATE memories SET project_id = $newProjectId WHERE project_id = $oldProjectId`
  ).run({ $newProjectId: newProjectId, $oldProjectId: oldProjectId });

  return result.changes;
}

/**
 * Get recent memories for a project
 */
export function getRecentMemories(
  db: Database,
  projectId: string | null,
  limit: number = 10
): Array<{ id: number; content: string; timestamp: Date; projectId: string | null }> {
  let query = `SELECT id, content, project_id, timestamp FROM memories`;
  const params: any = {};

  if (projectId !== null) {
    query += ` WHERE project_id = $projectId`;
    params.$projectId = projectId;
  }

  query += ` ORDER BY timestamp DESC LIMIT $limit`;
  params.$limit = limit;

  const results = db.query(query).all(params) as any[];

  return results.map(row => ({
    id: row.id,
    content: row.content,
    projectId: row.project_id,
    timestamp: new Date(row.timestamp),
  }));
}

/**
 * Delete all memories for a project
 */
export function deleteProjectMemories(db: Database, projectId: string): number {
  const result = db.query(`DELETE FROM memories WHERE project_id = $projectId`).run({ $projectId: projectId });
  return result.changes;
}

// ============================================================================ 
// Search Operations
// ============================================================================ 

/**
 * Search memories by vector similarity
 */
export function searchByVector(
  db: Database,
  queryEmbedding: Float32Array,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  // Get all memories
  let query = `SELECT id, content, embedding, project_id, timestamp FROM memories`;
  const params: any = {};

  if (projectId !== undefined) {
    if (projectId === null) {
      query += ` WHERE project_id IS NULL`;
    } else {
      query += ` WHERE project_id = $projectId`;
      params.$projectId = projectId;
    }
  }

  const rows = db.query(query).all(params) as any[];

  // Calculate cosine similarity for each memory
  const scored = rows.map(row => {
    const embedding = bufferToEmbedding(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

    return {
      id: row.id,
      content: row.content,
      score: similarity,
      timestamp: new Date(row.timestamp),
      projectId: row.project_id,
    };
  });

  // Sort by score descending and limit
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Search memories using keyword matching (FTS5 or LIKE)
 */
export function searchByKeyword(
  db: Database,
  query: string,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  const cleanQuery = query.replace(/['"]/g, '').trim();
  if (!cleanQuery) return [];

  // FTS5 Search
  try {
    return searchByFts5(db, cleanQuery, projectId, limit);
  } catch {
    // Fallback handled by try/catch
  }

  return searchByLike(db, cleanQuery, projectId, limit);
}

/**
 * FTS5 full-text search
 */
function searchByFts5(
  db: Database,
  query: string,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  let sql = `
    SELECT m.id, m.content, m.project_id, m.timestamp,
           bm25(memories_fts) as rank
    FROM memories_fts f
    JOIN memories m ON f.rowid = m.id
    WHERE memories_fts MATCH $query
  `;

  const params: any = { $query: query };

  if (projectId !== undefined) {
    if (projectId === null) {
      sql += ` AND m.project_id IS NULL`;
    } else {
      sql += ` AND m.project_id = $projectId`;
      params.$projectId = projectId;
    }
  }

  sql += ` ORDER BY rank LIMIT $limit`;
  params.$limit = limit;

  const rows = db.query(sql).all(params) as any[];

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    projectId: row.project_id,
    timestamp: new Date(row.timestamp),
    score: Math.abs(row.rank),
  }));
}

/**
 * LIKE-based keyword search (fallback)
 */
function searchByLike(
  db: Database,
  query: string,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const conditions = words.map((_, i) => `LOWER(content) LIKE $word${i}`);
  const params: any = {};
  words.forEach((w, i) => { params[`$word${i}`] = `%${w}%`; });

  let sql = `
    SELECT id, content, project_id, timestamp
    FROM memories
    WHERE ${conditions.join(' AND ')}
  `;

  if (projectId !== undefined) {
    if (projectId === null) {
      sql += ` AND project_id IS NULL`;
    } else {
      sql += ` AND project_id = $projectId`;
      params.$projectId = projectId;
    }
  }

  sql += ` ORDER BY timestamp DESC LIMIT $limit`;
  params.$limit = limit;

  const rows = db.query(sql).all(params) as any[];

  return rows.map((row, index) => ({
    id: row.id,
    content: row.content,
    projectId: row.project_id,
    timestamp: new Date(row.timestamp),
    score: 1 - index * 0.1,
  }));
}

// ============================================================================ 
// Statistics
// ============================================================================ 

export function getStats(db: Database): DbStats {
  const fragmentCount = (db.query(`SELECT COUNT(*) as count FROM memories`).get() as any).count;
  const projectCount = (db.query(`SELECT COUNT(DISTINCT project_id) as count FROM memories WHERE project_id IS NOT NULL`).get() as any).count;
  const sessionCount = (db.query(`SELECT COUNT(DISTINCT source_session) as count FROM memories`).get() as any).count;

  const oldestStr = (db.query(`SELECT MIN(timestamp) as ts FROM memories`).get() as any).ts;
  const newestStr = (db.query(`SELECT MAX(timestamp) as ts FROM memories`).get() as any).ts;

  let dbSizeBytes = 0;
  const dbPath = getDatabasePath();
  if (fs.existsSync(dbPath)) {
    dbSizeBytes = fs.statSync(dbPath).size;
  }

  return {
    fragmentCount,
    projectCount,
    sessionCount,
    dbSizeBytes,
    oldestTimestamp: oldestStr ? new Date(oldestStr) : null,
    newestTimestamp: newestStr ? new Date(newestStr) : null,
  };
}

export function listProjects(db: Database): Array<{ projectId: string; fragmentCount: number }> {
  const rows = db.query(`
    SELECT project_id, COUNT(*) as count
    FROM memories
    WHERE project_id IS NOT NULL
    GROUP BY project_id
    ORDER BY count DESC
  `).all() as any[];

  return rows.map(row => ({
    projectId: row.project_id,
    fragmentCount: row.count,
  }));
}

export function getProjectStats(db: Database, projectId: string): {
  fragmentCount: number;
  sessionCount: number;
  lastArchive: Date | null;
} {
  const fragmentCount = (db.query(`SELECT COUNT(*) as count FROM memories WHERE project_id = $pid`).get({ $pid: projectId }) as any).count;
  const sessionCount = (db.query(`SELECT COUNT(DISTINCT source_session) as count FROM memories WHERE project_id = $pid`).get({ $pid: projectId }) as any).count;
  const lastStr = (db.query(`SELECT MAX(timestamp) as ts FROM memories WHERE project_id = $pid`).get({ $pid: projectId }) as any).ts;

  return {
    fragmentCount,
    sessionCount,
    lastArchive: lastStr ? new Date(lastStr) : null,
  };
}

// ============================================================================ 
// Session Turn Operations
// ============================================================================ 

export function insertTurn(db: Database, turn: TurnInput): number {
  const result = db.query(`
    INSERT INTO session_turns (role, content, project_id, session_id, turn_index, timestamp)
    VALUES ($role, $content, $projectId, $sessionId, $turnIndex, $timestamp)
    RETURNING id
  `).get({
    $role: turn.role,
    $content: turn.content,
    $projectId: turn.projectId,
    $sessionId: turn.sessionId,
    $turnIndex: turn.turnIndex,
    $timestamp: turn.timestamp.toISOString(),
  }) as { id: number };

  return result.id;
}

export function getRecentTurns(
  db: Database,
  projectId: string | null,
  limit: number = 6
): SessionTurn[] {
  let query = `
    SELECT id, role, content, project_id, session_id, turn_index, timestamp
    FROM session_turns
  `;
  const params: any = {};

  if (projectId !== null) {
    query += ` WHERE project_id = $projectId`;
    params.$projectId = projectId;
  }

  query += ` ORDER BY timestamp DESC, turn_index DESC LIMIT $limit`;
  params.$limit = limit;

  const rows = db.query(query).all(params) as any[];

  return rows.map(row => ({
    id: row.id,
    role: row.role,
    content: row.content,
    projectId: row.project_id,
    sessionId: row.session_id,
    turnIndex: row.turn_index,
    timestamp: new Date(row.timestamp),
  })).reverse();
}

export function clearOldTurns(db: Database, keepCount: number = 10): number {
  // SQLite doesn't support limit in subquery with DELETE easily in all versions, 
  // but bun:sqlite is recent.
  // Standard way:
  const result = db.query(`
    DELETE FROM session_turns
    WHERE id NOT IN (
      SELECT id FROM session_turns
      ORDER BY timestamp DESC, turn_index DESC
      LIMIT $limit
    )
  `).run({ $limit: keepCount });
  return result.changes;
}

export function clearProjectTurns(db: Database, projectId: string | null): number {
  if (projectId === null) {
    return db.query(`DELETE FROM session_turns WHERE project_id IS NULL`).run().changes;
  } else {
    return db.query(`DELETE FROM session_turns WHERE project_id = $pid`).run({ $pid: projectId }).changes;
  }
}

// ============================================================================ 
// Session Summary Operations
// ============================================================================ 

export function upsertSessionSummary(db: Database, input: SessionSummaryInput): number {
  const result = db.query(`
    INSERT OR REPLACE INTO session_summaries
    (project_id, session_id, summary, key_decisions, key_outcomes, blockers, context_at_save, fragments_saved, timestamp)
    VALUES ($pid, $sid, $summary, $decisions, $outcomes, $blockers, $ctx, $frags, $ts)
    RETURNING id
  `).get({
    $pid: input.projectId,
    $sid: input.sessionId,
    $summary: input.summary,
    $decisions: input.keyDecisions?.join('\n') || null,
    $outcomes: input.keyOutcomes?.join('\n') || null,
    $blockers: input.blockers?.join('\n') || null,
    $ctx: input.contextAtSave || null,
    $frags: input.fragmentsSaved || null,
    $ts: input.timestamp.toISOString(),
  }) as { id: number };

  return result.id;
}

export function getRecentSummaries(
  db: Database,
  projectId: string | null,
  limit: number = 5
): Array <{
  id: number;
  sessionId: string;
  summary: string;
  keyDecisions: string[];
  keyOutcomes: string[];
  timestamp: Date;
}> {
  let query = `
    SELECT id, session_id, summary, key_decisions, key_outcomes, timestamp
    FROM session_summaries
  `;
  const params: any = {};

  if (projectId !== null) {
    query += ` WHERE project_id = $projectId`;
    params.$projectId = projectId;
  }

  query += ` ORDER BY timestamp DESC LIMIT $limit`;
  params.$limit = limit;

  const rows = db.query(query).all(params) as any[];

  return rows.map(row => ({
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary,
    keyDecisions: (row.key_decisions as string | null)?.split('\n').filter(Boolean) || [],
    keyOutcomes: (row.key_outcomes as string | null)?.split('\n').filter(Boolean) || [],
    timestamp: new Date(row.timestamp),
  }));
}

// ============================================================================ 
// Session Progress Operations
// ============================================================================ 

export function getSessionProgress(db: Database, sessionId: string): number {
  try {
    const row = db.query(
      `SELECT last_processed_line FROM session_progress WHERE session_id = $sid`
    ).get({ $sid: sessionId }) as { last_processed_line: number } | null;
    return row ? row.last_processed_line : 0;
  } catch {
    return 0;
  }
}

export function updateSessionProgress(db: Database, sessionId: string, lastLine: number): void {
  try {
    db.query(
      `INSERT OR REPLACE INTO session_progress (session_id, last_processed_line) VALUES ($sid, $line)`
    ).run({ $sid: sessionId, $line: lastLine });
  } catch (e) {
    console.error('Failed to update session progress:', e);
  }
}

// ============================================================================ 
// Utility Functions
// ============================================================================ 

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}