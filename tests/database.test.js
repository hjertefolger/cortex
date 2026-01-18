/**
 * Cortex Database Module Tests
 * Tests CRUD operations, deduplication, search, and statistics
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test data directory - isolated from production
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-test-' + Date.now());
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'memory.db');

// Mock embeddings (384-dimensional vectors like BGE-small)
function createMockEmbedding(seed = 0) {
  const embedding = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    embedding[i] = Math.sin(seed + i * 0.1);
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < 384; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < 384; i++) {
    embedding[i] /= norm;
  }
  return embedding;
}

describe('Database Module', async () => {
  let initSqlJs;
  let SQL;
  let db;

  before(async () => {
    // Create test directory
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Import sql.js
    const sqljs = await import('sql.js');
    initSqlJs = sqljs.default;
    SQL = await initSqlJs();
  });

  after(() => {
    // Cleanup test directory
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Create fresh database for each test
    db = new SQL.Database();

    // Create schema
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
    db.run(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash)`);
  });

  test('should create empty database', () => {
    const result = db.exec(`SELECT COUNT(*) FROM memories`);
    assert.strictEqual(result[0].values[0][0], 0, 'Database should start empty');
  });

  test('should insert memory correctly', () => {
    const embedding = createMockEmbedding(1);
    const embeddingBuffer = Buffer.from(embedding.buffer);
    const hash = 'test-hash-1';

    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Test content 1', hash, embeddingBuffer, 'test-project', 'session-1', new Date().toISOString()]
    );

    const result = db.exec(`SELECT COUNT(*) FROM memories`);
    assert.strictEqual(result[0].values[0][0], 1, 'Should have 1 memory');
  });

  test('should prevent duplicate content_hash', () => {
    const embedding = createMockEmbedding(1);
    const embeddingBuffer = Buffer.from(embedding.buffer);
    const hash = 'duplicate-hash';

    // First insert should succeed
    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Content 1', hash, embeddingBuffer, 'project-1', 'session-1', new Date().toISOString()]
    );

    // Second insert with same hash should fail
    assert.throws(() => {
      db.run(
        `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['Content 2', hash, embeddingBuffer, 'project-1', 'session-1', new Date().toISOString()]
      );
    }, /UNIQUE constraint failed/);
  });

  test('should retrieve memory by id', () => {
    const embedding = createMockEmbedding(2);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Retrievable content', 'hash-retrieve', embeddingBuffer, 'project-test', 'session-test', new Date().toISOString()]
    );

    const result = db.exec(`SELECT id, content, project_id FROM memories WHERE id = 1`);
    assert.strictEqual(result.length, 1, 'Should return 1 result set');
    assert.strictEqual(result[0].values[0][1], 'Retrievable content', 'Content should match');
    assert.strictEqual(result[0].values[0][2], 'project-test', 'Project ID should match');
  });

  test('should delete memory by id', () => {
    const embedding = createMockEmbedding(3);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['To be deleted', 'hash-delete', embeddingBuffer, null, 'session-del', new Date().toISOString()]
    );

    // Verify insert
    let result = db.exec(`SELECT COUNT(*) FROM memories`);
    assert.strictEqual(result[0].values[0][0], 1);

    // Delete
    db.run(`DELETE FROM memories WHERE id = 1`);

    // Verify deletion
    result = db.exec(`SELECT COUNT(*) FROM memories`);
    assert.strictEqual(result[0].values[0][0], 0, 'Memory should be deleted');
  });

  test('should count memories per project', () => {
    const embedding = createMockEmbedding(4);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    // Insert memories for different projects
    for (let i = 0; i < 3; i++) {
      db.run(
        `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`Content A-${i}`, `hash-a-${i}`, embeddingBuffer, 'project-a', `session-${i}`, new Date().toISOString()]
      );
    }

    for (let i = 0; i < 2; i++) {
      db.run(
        `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`Content B-${i}`, `hash-b-${i}`, embeddingBuffer, 'project-b', `session-${i}`, new Date().toISOString()]
      );
    }

    // Count project-a
    const resultA = db.exec(`SELECT COUNT(*) FROM memories WHERE project_id = ?`, ['project-a']);
    assert.strictEqual(resultA[0].values[0][0], 3, 'Project A should have 3 memories');

    // Count project-b
    const resultB = db.exec(`SELECT COUNT(*) FROM memories WHERE project_id = ?`, ['project-b']);
    assert.strictEqual(resultB[0].values[0][0], 2, 'Project B should have 2 memories');

    // Count distinct projects
    const resultProjects = db.exec(`SELECT COUNT(DISTINCT project_id) FROM memories`);
    assert.strictEqual(resultProjects[0].values[0][0], 2, 'Should have 2 distinct projects');
  });

  test('should search by LIKE pattern', () => {
    const embedding = createMockEmbedding(5);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    const contents = [
      'Implementing authentication with JWT tokens',
      'Setting up database migrations',
      'JWT token refresh mechanism',
      'User interface design patterns',
    ];

    contents.forEach((content, i) => {
      db.run(
        `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [content, `hash-search-${i}`, embeddingBuffer, 'search-project', 'session-search', new Date().toISOString()]
      );
    });

    // Search for JWT
    const result = db.exec(`SELECT content FROM memories WHERE LOWER(content) LIKE ?`, ['%jwt%']);
    assert.strictEqual(result[0].values.length, 2, 'Should find 2 memories containing JWT');
  });

  test('should get statistics correctly', () => {
    const embedding = createMockEmbedding(6);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Insert memories with different timestamps
    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Oldest', 'hash-old', embeddingBuffer, 'stats-project', 'session-1', yesterday.toISOString()]
    );

    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Newest', 'hash-new', embeddingBuffer, 'stats-project', 'session-2', now.toISOString()]
    );

    // Get stats
    const countResult = db.exec(`SELECT COUNT(*) FROM memories`);
    const oldestResult = db.exec(`SELECT MIN(timestamp) FROM memories`);
    const newestResult = db.exec(`SELECT MAX(timestamp) FROM memories`);
    const sessionsResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories`);

    assert.strictEqual(countResult[0].values[0][0], 2, 'Should have 2 memories');
    assert.strictEqual(sessionsResult[0].values[0][0], 2, 'Should have 2 distinct sessions');
    assert.ok(oldestResult[0].values[0][0] <= newestResult[0].values[0][0], 'Oldest should be before newest');
  });

  test('should handle null project_id', () => {
    const embedding = createMockEmbedding(7);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    // Insert global memory (null project_id)
    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Global memory', 'hash-global', embeddingBuffer, null, 'session-global', new Date().toISOString()]
    );

    // Query global memories
    const result = db.exec(`SELECT content FROM memories WHERE project_id IS NULL`);
    assert.strictEqual(result[0].values.length, 1, 'Should find 1 global memory');
    assert.strictEqual(result[0].values[0][0], 'Global memory');
  });

  test('should delete all memories for a project', () => {
    const embedding = createMockEmbedding(8);
    const embeddingBuffer = Buffer.from(embedding.buffer);

    // Insert memories for target project
    for (let i = 0; i < 5; i++) {
      db.run(
        `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`Content ${i}`, `hash-del-proj-${i}`, embeddingBuffer, 'to-delete', 'session-x', new Date().toISOString()]
      );
    }

    // Insert memory for other project (should not be deleted)
    db.run(
      `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Keep me', 'hash-keep', embeddingBuffer, 'keep-project', 'session-y', new Date().toISOString()]
    );

    // Delete project memories
    db.run(`DELETE FROM memories WHERE project_id = ?`, ['to-delete']);

    // Verify
    const countResult = db.exec(`SELECT COUNT(*) FROM memories`);
    assert.strictEqual(countResult[0].values[0][0], 1, 'Should have 1 remaining memory');

    const remainingResult = db.exec(`SELECT project_id FROM memories`);
    assert.strictEqual(remainingResult[0].values[0][0], 'keep-project', 'Remaining should be keep-project');
  });
});

describe('Cosine Similarity', () => {
  test('should compute cosine similarity correctly', () => {
    // Same vectors should have similarity = 1
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);

    const similarity = cosineSimilarity(a, b);
    assert.ok(Math.abs(similarity - 1.0) < 0.0001, 'Same vectors should have similarity ~1');
  });

  test('should return 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);

    const similarity = cosineSimilarity(a, b);
    assert.ok(Math.abs(similarity) < 0.0001, 'Orthogonal vectors should have similarity ~0');
  });

  test('should return -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);

    const similarity = cosineSimilarity(a, b);
    assert.ok(Math.abs(similarity + 1.0) < 0.0001, 'Opposite vectors should have similarity ~-1');
  });
});

// Utility: cosine similarity implementation for tests
function cosineSimilarity(a, b) {
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
