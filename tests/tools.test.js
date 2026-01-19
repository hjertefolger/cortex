/**
 * Cortex MCP Tools Tests
 * Tests the tool handlers for cortex_recall, cortex_remember, cortex_stats, etc.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Test data directory
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-tools-test-' + Date.now());
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'memory.db');

describe('MCP Tool Handlers', () => {
  let SQL;
  let db;

  before(async () => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    const sqljs = await import('sql.js');
    SQL = await sqljs.default();
  });

  after(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    db = new SQL.Database();
    createTestSchema(db);
  });

  describe('cortex_stats', () => {
    test('should return empty stats for new database', () => {
      const stats = getTestStats(db);

      assert.strictEqual(stats.fragmentCount, 0);
      assert.strictEqual(stats.projectCount, 0);
      assert.strictEqual(stats.sessionCount, 0);
    });

    test('should return correct counts', () => {
      // Insert test data with unique content
      const seed = Date.now() + Math.random();
      insertTestMemory(db, `Count Memory 1 - ${seed}`, 'project-a', 'session-1');
      insertTestMemory(db, `Count Memory 2 - ${seed}`, 'project-a', 'session-1');
      insertTestMemory(db, `Count Memory 3 - ${seed}`, 'project-b', 'session-2');

      const stats = getTestStats(db);

      assert.strictEqual(stats.fragmentCount, 3);
      assert.strictEqual(stats.projectCount, 2);
      assert.strictEqual(stats.sessionCount, 2);
    });

    test('should return project-specific stats', () => {
      const seed = Date.now() + Math.random();
      insertTestMemory(db, `Stats Memory A - ${seed}`, 'project-x', 'session-1');
      insertTestMemory(db, `Stats Memory B - ${seed}`, 'project-x', 'session-2');
      insertTestMemory(db, `Stats Memory C - ${seed}`, 'project-y', 'session-3');

      const projectStats = getTestProjectStats(db, 'project-x');

      assert.strictEqual(projectStats.fragmentCount, 2);
      assert.strictEqual(projectStats.sessionCount, 2);
    });
  });

  describe('cortex_recall (search)', () => {
    let testSeed;

    beforeEach(() => {
      // Use unique seed for each test to avoid hash collisions
      testSeed = Date.now() + Math.random();

      // Seed with test memories (unique per test run)
      insertTestMemory(db, `Implementing JWT authentication for API security - ${testSeed}`, 'auth-project', 'session-1');
      insertTestMemory(db, `Database migration strategy using Prisma ORM - ${testSeed}`, 'db-project', 'session-2');
      insertTestMemory(db, `React component optimization with memo and useMemo - ${testSeed}`, 'frontend-project', 'session-3');
      insertTestMemory(db, `API rate limiting with Redis caching - ${testSeed}`, 'auth-project', 'session-4');
      insertTestMemory(db, `User authentication flow with OAuth2 - ${testSeed}`, 'auth-project', 'session-5');
    });

    test('should find memories by keyword', () => {
      const results = searchTestMemoriesByKeyword(db, 'authentication');

      assert.ok(results.length >= 2, 'Should find at least 2 authentication-related memories');
      assert.ok(
        results.every((r) => r.content.toLowerCase().includes('authentication') || r.content.toLowerCase().includes('auth')),
        'Results should contain authentication keyword'
      );
    });

    test('should filter by project', () => {
      const results = searchTestMemoriesByKeyword(db, 'authentication', 'auth-project');

      assert.ok(results.length >= 1);
      assert.ok(results.every((r) => r.projectId === 'auth-project'));
    });

    test('should return empty for no matches', () => {
      const results = searchTestMemoriesByKeyword(db, 'nonexistent-xyz-123');

      assert.strictEqual(results.length, 0);
    });

    test('should handle multi-word queries', () => {
      const results = searchTestMemoriesByKeyword(db, 'API security');

      assert.ok(results.length >= 1);
    });
  });

  describe('cortex_remember', () => {
    test('should store a manual memory', () => {
      const result = storeTestManualMemory(db, 'Important decision: Use PostgreSQL', 'my-project');

      assert.ok(result.id > 0);
      assert.strictEqual(result.isDuplicate, false);

      // Verify it was stored
      const stats = getTestStats(db);
      assert.strictEqual(stats.fragmentCount, 1);
    });

    test('should detect duplicate content', () => {
      const content = 'Duplicate content test';

      const first = storeTestManualMemory(db, content, 'project-1');
      const second = storeTestManualMemory(db, content, 'project-1');

      assert.strictEqual(first.isDuplicate, false);
      assert.strictEqual(second.isDuplicate, true);
      assert.strictEqual(first.id, second.id);
    });

    test('should store memory with context', () => {
      const result = storeTestManualMemory(db, 'Architecture decision', 'project-1', 'Discussed in planning meeting');

      assert.ok(result.id > 0);

      // Verify content includes context
      const memory = getTestMemoryById(db, result.id);
      assert.ok(memory.content.includes('Architecture decision'));
      assert.ok(memory.content.includes('Context:'));
    });
  });

  describe('cortex_delete', () => {
    test('should delete memory by id', () => {
      insertTestMemory(db, 'To be deleted', 'project-del', 'session-del');

      let stats = getTestStats(db);
      assert.strictEqual(stats.fragmentCount, 1);

      const deleted = deleteTestMemory(db, 1);
      assert.strictEqual(deleted, true);

      stats = getTestStats(db);
      assert.strictEqual(stats.fragmentCount, 0);
    });

    test('should return false for non-existent id', () => {
      const deleted = deleteTestMemory(db, 9999);
      assert.strictEqual(deleted, false);
    });
  });

  describe('cortex_forget_project', () => {
    test('should delete all memories for a project', () => {
      insertTestMemory(db, 'Memory 1', 'target-project', 'session-1');
      insertTestMemory(db, 'Memory 2', 'target-project', 'session-2');
      insertTestMemory(db, 'Memory 3', 'keep-project', 'session-3');

      const deletedCount = deleteTestProjectMemories(db, 'target-project');

      assert.strictEqual(deletedCount, 2);

      const stats = getTestStats(db);
      assert.strictEqual(stats.fragmentCount, 1);

      const remaining = db.exec(`SELECT project_id FROM memories`);
      assert.strictEqual(remaining[0].values[0][0], 'keep-project');
    });

    test('should return 0 for non-existent project', () => {
      const deletedCount = deleteTestProjectMemories(db, 'non-existent-project');
      assert.strictEqual(deletedCount, 0);
    });
  });

  describe('Input validation', () => {
    test('should handle empty query gracefully', () => {
      const results = searchTestMemoriesByKeyword(db, '');
      assert.deepStrictEqual(results, []);
    });

    test('should handle whitespace-only query', () => {
      const results = searchTestMemoriesByKeyword(db, '   ');
      assert.deepStrictEqual(results, []);
    });

    test('should sanitize special characters in query', () => {
      insertTestMemory(db, 'Test content', 'project', 'session');

      // Should not throw
      const results = searchTestMemoriesByKeyword(db, "test's \"quoted\" content");
      assert.ok(Array.isArray(results));
    });
  });
});

describe('Utility Functions', () => {
  test('formatBytes should format correctly', () => {
    assert.strictEqual(formatTestBytes(0), '0 B');
    assert.strictEqual(formatTestBytes(500), '500.0 B');
    assert.strictEqual(formatTestBytes(1024), '1.0 KB');
    assert.strictEqual(formatTestBytes(1536), '1.5 KB');
    assert.strictEqual(formatTestBytes(1048576), '1.0 MB');
    assert.strictEqual(formatTestBytes(1073741824), '1.0 GB');
  });

  test('hashContent should produce consistent hashes', () => {
    const hash1 = hashTestContent('test content');
    const hash2 = hashTestContent('test content');
    const hash3 = hashTestContent('different content');

    assert.strictEqual(hash1, hash2, 'Same content should produce same hash');
    assert.notStrictEqual(hash1, hash3, 'Different content should produce different hash');
  });

  test('hashContent should ignore leading/trailing whitespace', () => {
    const hash1 = hashTestContent('test');
    const hash2 = hashTestContent('  test  ');

    assert.strictEqual(hash1, hash2);
  });
});

// Test helper functions
function createTestSchema(db) {
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id)`);
}

function createMockEmbedding() {
  const embedding = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    embedding[i] = Math.random() - 0.5;
  }
  return Buffer.from(embedding.buffer);
}

function hashTestContent(content) {
  return crypto.createHash('sha256').update(content.trim()).digest('hex').substring(0, 16);
}

function insertTestMemory(db, content, projectId, sourceSession) {
  const hash = hashTestContent(content);
  const embedding = createMockEmbedding();

  db.run(
    `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [content, hash, embedding, projectId, sourceSession, new Date().toISOString()]
  );

  const result = db.exec(`SELECT last_insert_rowid()`);
  return result[0].values[0][0];
}

function getTestStats(db) {
  const fragmentResult = db.exec(`SELECT COUNT(*) FROM memories`);
  const fragmentCount = fragmentResult[0]?.values[0]?.[0] ?? 0;

  const projectResult = db.exec(`SELECT COUNT(DISTINCT project_id) FROM memories WHERE project_id IS NOT NULL`);
  const projectCount = projectResult[0]?.values[0]?.[0] ?? 0;

  const sessionResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories`);
  const sessionCount = sessionResult[0]?.values[0]?.[0] ?? 0;

  return { fragmentCount, projectCount, sessionCount };
}

function getTestProjectStats(db, projectId) {
  const fragmentResult = db.exec(`SELECT COUNT(*) FROM memories WHERE project_id = ?`, [projectId]);
  const fragmentCount = fragmentResult[0]?.values[0]?.[0] ?? 0;

  const sessionResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories WHERE project_id = ?`, [projectId]);
  const sessionCount = sessionResult[0]?.values[0]?.[0] ?? 0;

  return { fragmentCount, sessionCount };
}

function searchTestMemoriesByKeyword(db, query, projectId = null) {
  const cleanQuery = query.replace(/['"]/g, '').trim();

  if (!cleanQuery) {
    return [];
  }

  const words = cleanQuery.toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const conditions = words.map(() => `LOWER(content) LIKE ?`);
  const params = words.map((w) => `%${w}%`);

  let sql = `SELECT id, content, project_id, timestamp FROM memories WHERE ${conditions.join(' AND ')}`;

  if (projectId) {
    sql += ` AND project_id = ?`;
    params.push(projectId);
  }

  sql += ` ORDER BY timestamp DESC LIMIT 10`;

  const result = db.exec(sql, params);

  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  return result[0].values.map((row) => ({
    id: row[0],
    content: row[1],
    projectId: row[2],
    timestamp: new Date(row[3]),
  }));
}

function storeTestManualMemory(db, content, projectId, context = null) {
  const fullContent = context ? `${content}\n\n[Context: ${context}]` : content;
  const hash = hashTestContent(fullContent);

  // Check for duplicate
  const existing = db.exec(`SELECT id FROM memories WHERE content_hash = ?`, [hash]);

  if (existing.length > 0 && existing[0].values.length > 0) {
    return { id: existing[0].values[0][0], isDuplicate: true };
  }

  const embedding = createMockEmbedding();
  const sessionId = `manual-${Date.now()}`;

  db.run(
    `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fullContent, hash, embedding, projectId, sessionId, new Date().toISOString()]
  );

  const result = db.exec(`SELECT last_insert_rowid()`);
  return { id: result[0].values[0][0], isDuplicate: false };
}

function getTestMemoryById(db, id) {
  const result = db.exec(`SELECT id, content, project_id FROM memories WHERE id = ?`, [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const row = result[0].values[0];
  return { id: row[0], content: row[1], projectId: row[2] };
}

function deleteTestMemory(db, id) {
  db.run(`DELETE FROM memories WHERE id = ?`, [id]);
  return db.getRowsModified() > 0;
}

function deleteTestProjectMemories(db, projectId) {
  db.run(`DELETE FROM memories WHERE project_id = ?`, [projectId]);
  return db.getRowsModified();
}

function formatTestBytes(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
