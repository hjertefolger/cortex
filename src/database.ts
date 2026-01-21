/**
 * Cortex Database Module
 * SQLite database with vector storage using sql.js
 * FTS5 is optional - falls back to LIKE search if unavailable
 */

import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import { getDatabasePath, ensureDataDir, getBackupsDir, ensureBackupsDir } from './config.js';
import * as path from 'path';
import type { Memory, MemoryInput, DbStats, SessionTurn, TurnInput } from './types.js';
import * as crypto from 'crypto';

// ============================================================================
// Database Initialization
// ============================================================================

let dbInstance: SqlJsDatabase | null = null;
let SQL: initSqlJs.SqlJsStatic | null = null;
let fts5Available = false;
let initPromise: Promise<SqlJsDatabase> | null = null;

/**
 * Initialize sql.js and load or create database
 * Uses promise-based mutex to prevent concurrent initialization
 */
export async function initDb(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  // Wait for in-progress initialization
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Initialize sql.js
      if (!SQL) {
        SQL = await initSqlJs();
      }

      ensureDataDir();
      const dbPath = getDatabasePath();

      // Create backup before loading existing database
      createBackupOnStartup();

      // Load existing database or create new one
      if (fs.existsSync(dbPath)) {
        let loadedDb: SqlJsDatabase | null = null;
        let needsRecovery = false;

        try {
          const buffer = fs.readFileSync(dbPath);
          loadedDb = new SQL.Database(buffer);

          // Validate the database
          const validation = validateDatabase(loadedDb);
          if (!validation.valid) {
            needsRecovery = true;
            loadedDb.close();
            loadedDb = null;
          }
        } catch {
          needsRecovery = true;
        }

        // Attempt recovery from backups if needed
        if (needsRecovery) {
          loadedDb = attemptRecovery();
          if (loadedDb) {
            // Save recovered database to main path
            const data = loadedDb.export();
            const tempPath = `${dbPath}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(tempPath, Buffer.from(data));
            fs.renameSync(tempPath, dbPath);
          }
        }

        if (loadedDb) {
          dbInstance = loadedDb;
          // Check if FTS5 table exists
          try {
            dbInstance.exec(`SELECT 1 FROM memories_fts LIMIT 1`);
            fts5Available = true;
          } catch {
            fts5Available = false;
          }
        } else {
          // All recovery attempts failed, create fresh database
          dbInstance = new SQL.Database();
          createSchema(dbInstance);
        }
      } else {
        dbInstance = new SQL.Database();
        createSchema(dbInstance);
      }

      return dbInstance;
    } catch (error) {
      initPromise = null;  // Allow retry on failure
      throw error;
    }
  })();

  return initPromise;
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
export function validateDatabase(db: SqlJsDatabase): DatabaseValidationResult {
  const result: DatabaseValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    tablesFound: [],
    integrityCheck: false,
    fts5Available: false,
    embeddingDimension: null,
  };

  // Check required tables
  const requiredTables = ['memories', 'session_turns', 'session_summaries'];
  try {
    const tablesResult = db.exec(`SELECT name FROM sqlite_master WHERE type='table'`);
    if (tablesResult.length > 0) {
      result.tablesFound = tablesResult[0].values.map(row => row[0] as string);
    }

    for (const table of requiredTables) {
      if (!result.tablesFound.includes(table)) {
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
    const integrityResult = db.exec(`PRAGMA integrity_check`);
    if (integrityResult.length > 0 && integrityResult[0].values.length > 0) {
      const status = integrityResult[0].values[0][0] as string;
      result.integrityCheck = status === 'ok';
      if (!result.integrityCheck) {
        result.errors.push(`Integrity check failed: ${status}`);
        result.valid = false;
      }
    }
  } catch (error) {
    result.errors.push(`Integrity check error: ${error instanceof Error ? error.message : String(error)}`);
    result.valid = false;
  }

  // Check FTS5 availability
  try {
    db.exec(`SELECT 1 FROM memories_fts LIMIT 1`);
    result.fts5Available = true;
  } catch {
    result.fts5Available = false;
    result.warnings.push('FTS5 table not available - keyword search will use fallback');
  }

  // Check embedding dimension
  try {
    const embeddingResult = db.exec(`SELECT embedding FROM memories LIMIT 1`);
    if (embeddingResult.length > 0 && embeddingResult[0].values.length > 0) {
      const embeddingBlob = embeddingResult[0].values[0][0] as Buffer;
      if (embeddingBlob) {
        result.embeddingDimension = embeddingBlob.length / 4;  // Float32 = 4 bytes
        if (result.embeddingDimension !== 768) {
          result.warnings.push(`Embedding dimension is ${result.embeddingDimension}, expected 768`);
        }
      }
    }
  } catch {
    // No embeddings yet is fine
  }

  return result;
}

/**
 * Attempt to recover database from backups
 * Returns the first valid database or null if all backups are corrupt
 */
function attemptRecovery(): SqlJsDatabase | null {
  if (!SQL) {
    return null;
  }

  const backups = getBackupFiles();

  for (const backupPath of backups) {
    try {
      const buffer = fs.readFileSync(backupPath);
      const db = new SQL.Database(buffer);

      // Validate the backup
      const validation = validateDatabase(db);
      if (validation.valid) {
        return db;
      }

      // Invalid backup, close and try next
      db.close();
    } catch {
      // Corrupt backup, try next
    }
  }

  return null;
}

// ============================================================================
// FTS5 Support
// ============================================================================

/**
 * Check if FTS5 is available
 */
function checkFts5(db: SqlJsDatabase): boolean {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(test)`);
    db.exec(`DROP TABLE _fts5_test`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create database schema
 */
function createSchema(db: SqlJsDatabase): void {
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

  db.run(`CREATE INDEX IF NOT EXISTS idx_summaries_project ON session_summaries(project_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_summaries_timestamp ON session_summaries(timestamp DESC)`);

  // Try to create FTS5 virtual table (may not be available in all sql.js builds)
  fts5Available = checkFts5(db);

  if (fts5Available) {
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
    } catch {
      fts5Available = false;
    }
  }
}

/**
 * Save database to disk using atomic write pattern
 * Uses temp-file + rename to prevent corruption on crash
 */
export function saveDb(db: SqlJsDatabase): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbPath = getDatabasePath();

  // Atomic write: temp file + rename
  const tempPath = `${dbPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, dbPath);  // Atomic on POSIX
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
 * Close database connection
 */
export function closeDb(): void {
  if (dbInstance) {
    saveDb(dbInstance);
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Check if FTS5 is enabled
 */
export function isFts5Enabled(): boolean {
  return fts5Available;
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
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

/**
 * Insert a new memory
 */
export function insertMemory(
  db: SqlJsDatabase,
  memory: MemoryInput
): { id: number; isDuplicate: boolean } {
  const hash = hashContent(memory.content);

  // Check for duplicate
  const existing = db.exec(
    `SELECT id FROM memories WHERE content_hash = ?`,
    [hash]
  );

  if (existing.length > 0 && existing[0].values.length > 0) {
    return { id: existing[0].values[0][0] as number, isDuplicate: true };
  }

  // Insert new memory
  db.run(
    `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      memory.content,
      hash,
      embeddingToBuffer(memory.embedding),
      memory.projectId,
      memory.sourceSession,
      memory.timestamp.toISOString(),
    ]
  );

  // Get the inserted ID
  const result = db.exec(`SELECT last_insert_rowid()`);
  const id = result[0].values[0][0] as number;

  return { id, isDuplicate: false };
}

/**
 * Get memory by ID
 */
export function getMemory(db: SqlJsDatabase, id: number): Memory | null {
  const result = db.exec(
    `SELECT id, content, content_hash, embedding, project_id, source_session, timestamp
     FROM memories WHERE id = ?`,
    [id]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    content: row[1] as string,
    contentHash: row[2] as string,
    embedding: bufferToEmbedding(row[3] as Buffer),
    projectId: row[4] as string | null,
    sourceSession: row[5] as string,
    timestamp: new Date(row[6] as string),
  };
}

/**
 * Check if content already exists
 */
export function contentExists(db: SqlJsDatabase, content: string): boolean {
  const hash = hashContent(content);
  const result = db.exec(
    `SELECT 1 FROM memories WHERE content_hash = ? LIMIT 1`,
    [hash]
  );
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * Delete memory by ID
 */
export function deleteMemory(db: SqlJsDatabase, id: number): boolean {
  db.run(`DELETE FROM memories WHERE id = ?`, [id]);
  return db.getRowsModified() > 0;
}

/**
 * Store a manual memory (from cortex_remember tool)
 * Unlike insertMemory, this creates a unique session ID for manual entries
 */
export function storeManualMemory(
  db: SqlJsDatabase,
  content: string,
  embedding: Float32Array,
  projectId: string | null,
  context?: string
): { id: number; isDuplicate: boolean } {
  // Combine content with context if provided
  const fullContent = context
    ? `${content}\n\n[Context: ${context}]`
    : content;

  // Generate a unique session identifier for manual entries
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
  db: SqlJsDatabase,
  id: number,
  newContent: string,
  newEmbedding: Float32Array
): boolean {
  const newHash = hashContent(newContent);

  db.run(
    `UPDATE memories SET content = ?, content_hash = ?, embedding = ? WHERE id = ?`,
    [newContent, newHash, embeddingToBuffer(newEmbedding), id]
  );

  return db.getRowsModified() > 0;
}

/**
 * Get recent memories for a project, sorted by timestamp
 */
export function getRecentMemories(
  db: SqlJsDatabase,
  projectId: string | null,
  limit: number = 10
): Array<{ id: number; content: string; timestamp: Date; projectId: string | null }> {
  let query = `SELECT id, content, project_id, timestamp FROM memories`;
  const params: (string | number)[] = [];

  if (projectId !== null) {
    query += ` WHERE project_id = ?`;
    params.push(projectId);
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);

  const result = db.exec(query, params);

  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as number,
    content: row[1] as string,
    projectId: row[2] as string | null,
    timestamp: new Date(row[3] as string),
  }));
}

/**
 * Delete all memories for a project
 */
export function deleteProjectMemories(db: SqlJsDatabase, projectId: string): number {
  db.run(`DELETE FROM memories WHERE project_id = ?`, [projectId]);
  return db.getRowsModified();
}

// ============================================================================
// Search Operations
// ============================================================================

/**
 * Search memories by vector similarity (cosine distance)
 */
export function searchByVector(
  db: SqlJsDatabase,
  queryEmbedding: Float32Array,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  // Get all memories (with optional project filter)
  let query = `SELECT id, content, embedding, project_id, timestamp FROM memories`;
  const params: (string | null)[] = [];

  if (projectId !== undefined) {
    if (projectId === null) {
      query += ` WHERE project_id IS NULL`;
    } else {
      query += ` WHERE project_id = ?`;
      params.push(projectId);
    }
  }

  const result = db.exec(query, params);

  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  // Calculate cosine similarity for each memory
  const scored = result[0].values.map((row: SqlValue[]) => {
    const embedding = bufferToEmbedding(row[2] as Buffer);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

    return {
      id: row[0] as number,
      content: row[1] as string,
      score: similarity,
      timestamp: new Date(row[4] as string),
      projectId: row[3] as string | null,
    };
  });

  type ScoredResult = { id: number; content: string; score: number; timestamp: Date; projectId: string | null };
  // Sort by score descending and limit
  return scored.sort((a: ScoredResult, b: ScoredResult) => b.score - a.score).slice(0, limit);
}

/**
 * Search memories using keyword matching
 * Uses FTS5 if available, falls back to LIKE queries
 */
export function searchByKeyword(
  db: SqlJsDatabase,
  query: string,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  const cleanQuery = query.replace(/['"]/g, '').trim();

  if (!cleanQuery) {
    return [];
  }

  // Try FTS5 first if available
  if (fts5Available) {
    try {
      return searchByFts5(db, cleanQuery, projectId, limit);
    } catch {
      // Fall through to LIKE search
    }
  }

  // Fallback to LIKE search
  return searchByLike(db, cleanQuery, projectId, limit);
}

/**
 * FTS5 full-text search
 */
function searchByFts5(
  db: SqlJsDatabase,
  query: string,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  let sql = `
    SELECT m.id, m.content, m.project_id, m.timestamp,
           bm25(memories_fts) as rank
    FROM memories_fts f
    JOIN memories m ON f.rowid = m.id
    WHERE memories_fts MATCH ?
  `;

  const params: (string | null)[] = [query];

  if (projectId !== undefined) {
    if (projectId === null) {
      sql += ` AND m.project_id IS NULL`;
    } else {
      sql += ` AND m.project_id = ?`;
      params.push(projectId);
    }
  }

  sql += ` ORDER BY rank LIMIT ?`;
  params.push(limit.toString());

  const result = db.exec(sql, params);

  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as number,
    content: row[1] as string,
    projectId: row[2] as string | null,
    timestamp: new Date(row[3] as string),
    score: Math.abs(row[4] as number), // BM25 returns negative scores
  }));
}

/**
 * LIKE-based keyword search (fallback when FTS5 unavailable)
 */
function searchByLike(
  db: SqlJsDatabase,
  query: string,
  projectId?: string | null,
  limit: number = 10
): Array<{ id: number; content: string; score: number; timestamp: Date; projectId: string | null }> {
  // Split query into words for multi-word search
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  // Build LIKE conditions for each word
  const conditions = words.map(() => `LOWER(content) LIKE ?`);
  const params: (string | null)[] = words.map((w) => `%${w}%`);

  let sql = `
    SELECT id, content, project_id, timestamp,
           LENGTH(content) as len
    FROM memories
    WHERE ${conditions.join(' AND ')}
  `;

  if (projectId !== undefined) {
    if (projectId === null) {
      sql += ` AND project_id IS NULL`;
    } else {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
  }

  sql += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit.toString());

  const result = db.exec(sql, params);

  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  return result[0].values.map((row: SqlValue[], index: number) => ({
    id: row[0] as number,
    content: row[1] as string,
    projectId: row[2] as string | null,
    timestamp: new Date(row[3] as string),
    // Simple score based on position (earlier = higher score)
    score: 1 - index * 0.1,
  }));
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get database statistics
 */
export function getStats(db: SqlJsDatabase): DbStats {
  const fragmentResult = db.exec(`SELECT COUNT(*) FROM memories`);
  const fragmentCount = fragmentResult[0]?.values[0]?.[0] as number ?? 0;

  const projectResult = db.exec(`SELECT COUNT(DISTINCT project_id) FROM memories WHERE project_id IS NOT NULL`);
  const projectCount = projectResult[0]?.values[0]?.[0] as number ?? 0;

  const sessionResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories`);
  const sessionCount = sessionResult[0]?.values[0]?.[0] as number ?? 0;

  const oldestResult = db.exec(`SELECT MIN(timestamp) FROM memories`);
  const oldestStr = oldestResult[0]?.values[0]?.[0] as string | null;
  const oldestTimestamp = oldestStr ? new Date(oldestStr) : null;

  const newestResult = db.exec(`SELECT MAX(timestamp) FROM memories`);
  const newestStr = newestResult[0]?.values[0]?.[0] as string | null;
  const newestTimestamp = newestStr ? new Date(newestStr) : null;

  // Get database file size
  const dbPath = getDatabasePath();
  let dbSizeBytes = 0;
  if (fs.existsSync(dbPath)) {
    dbSizeBytes = fs.statSync(dbPath).size;
  }

  return {
    fragmentCount,
    projectCount,
    sessionCount,
    dbSizeBytes,
    oldestTimestamp,
    newestTimestamp,
  };
}

/**
 * Get stats for a specific project
 */
export function getProjectStats(db: SqlJsDatabase, projectId: string): {
  fragmentCount: number;
  sessionCount: number;
  lastArchive: Date | null;
} {
  const fragmentResult = db.exec(
    `SELECT COUNT(*) FROM memories WHERE project_id = ?`,
    [projectId]
  );
  const fragmentCount = fragmentResult[0]?.values[0]?.[0] as number ?? 0;

  const sessionResult = db.exec(
    `SELECT COUNT(DISTINCT source_session) FROM memories WHERE project_id = ?`,
    [projectId]
  );
  const sessionCount = sessionResult[0]?.values[0]?.[0] as number ?? 0;

  const lastResult = db.exec(
    `SELECT MAX(timestamp) FROM memories WHERE project_id = ?`,
    [projectId]
  );
  const lastStr = lastResult[0]?.values[0]?.[0] as string | null;
  const lastArchive = lastStr ? new Date(lastStr) : null;

  return {
    fragmentCount,
    sessionCount,
    lastArchive,
  };
}

// ============================================================================
// Session Turn Operations (for precise restoration)
// ============================================================================

/**
 * Insert a session turn
 */
export function insertTurn(db: SqlJsDatabase, turn: TurnInput): number {
  db.run(
    `INSERT INTO session_turns (role, content, project_id, session_id, turn_index, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [turn.role, turn.content, turn.projectId, turn.sessionId, turn.turnIndex, turn.timestamp.toISOString()]
  );
  const result = db.exec(`SELECT last_insert_rowid()`);
  return result[0].values[0][0] as number;
}

/**
 * Get recent turns for a project, ordered chronologically
 */
export function getRecentTurns(
  db: SqlJsDatabase,
  projectId: string | null,
  limit: number = 6
): SessionTurn[] {
  let query = `
    SELECT id, role, content, project_id, session_id, turn_index, timestamp
    FROM session_turns
  `;
  const params: (string | number)[] = [];

  if (projectId !== null) {
    query += ` WHERE project_id = ?`;
    params.push(projectId);
  }

  query += ` ORDER BY timestamp DESC, turn_index DESC LIMIT ?`;
  params.push(limit);

  const result = db.exec(query, params);
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  // Reverse to chronological order
  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as number,
    role: row[1] as 'user' | 'assistant',
    content: row[2] as string,
    projectId: row[3] as string | null,
    sessionId: row[4] as string,
    turnIndex: row[5] as number,
    timestamp: new Date(row[6] as string),
  })).reverse();
}

/**
 * Clear old turns, keeping only the most recent N per project
 */
export function clearOldTurns(db: SqlJsDatabase, keepCount: number = 10): number {
  // Delete turns older than the most recent keepCount
  db.run(`
    DELETE FROM session_turns
    WHERE id NOT IN (
      SELECT id FROM session_turns
      ORDER BY timestamp DESC, turn_index DESC
      LIMIT ?
    )
  `, [keepCount]);
  return db.getRowsModified();
}

/**
 * Clear all turns for a project (called before saving new turns)
 */
export function clearProjectTurns(db: SqlJsDatabase, projectId: string | null): number {
  if (projectId === null) {
    db.run(`DELETE FROM session_turns WHERE project_id IS NULL`);
  } else {
    db.run(`DELETE FROM session_turns WHERE project_id = ?`, [projectId]);
  }
  return db.getRowsModified();
}

// ============================================================================
// Session Summary Operations
// ============================================================================

export interface SessionSummaryInput {
  projectId: string | null;
  sessionId: string;
  summary: string;
  keyDecisions?: string[];
  keyOutcomes?: string[];
  blockers?: string[];
  contextAtSave?: number;
  fragmentsSaved?: number;
  timestamp: Date;
}

/**
 * Insert or update a session summary
 */
export function upsertSessionSummary(db: SqlJsDatabase, input: SessionSummaryInput): number {
  db.run(
    `INSERT OR REPLACE INTO session_summaries
     (project_id, session_id, summary, key_decisions, key_outcomes, blockers, context_at_save, fragments_saved, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.projectId,
      input.sessionId,
      input.summary,
      input.keyDecisions?.join('\n') || null,
      input.keyOutcomes?.join('\n') || null,
      input.blockers?.join('\n') || null,
      input.contextAtSave || null,
      input.fragmentsSaved || null,
      input.timestamp.toISOString(),
    ]
  );
  const result = db.exec(`SELECT last_insert_rowid()`);
  return result[0].values[0][0] as number;
}

/**
 * Get recent session summaries for a project
 */
export function getRecentSummaries(
  db: SqlJsDatabase,
  projectId: string | null,
  limit: number = 5
): Array<{
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
  const params: (string | number)[] = [];

  if (projectId !== null) {
    query += ` WHERE project_id = ?`;
    params.push(projectId);
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);

  const result = db.exec(query, params);
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  return result[0].values.map((row: SqlValue[]) => ({
    id: row[0] as number,
    sessionId: row[1] as string,
    summary: row[2] as string,
    keyDecisions: (row[3] as string | null)?.split('\n').filter(Boolean) || [],
    keyOutcomes: (row[4] as string | null)?.split('\n').filter(Boolean) || [],
    timestamp: new Date(row[5] as string),
  }));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
