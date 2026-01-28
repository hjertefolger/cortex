/**
 * Cortex MCP Tools Tests
 * Tests the tool helper functions with bun:sqlite
 */

import { describe, test, beforeAll, afterAll, beforeEach, afterEach, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Database } from 'bun:sqlite';
import { 
    initDb, 
    closeDb,
    insertMemory,
    getStats,
    getProjectStats,
    searchByKeyword,
    storeManualMemory,
    getMemory,
    deleteMemory,
    deleteProjectMemories
} from '../src/database.ts';

// Test data directory
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-tools-test-' + Date.now());
process.env.CORTEX_DATA_DIR = TEST_DATA_DIR;

// Mock embedding helper
function createMockEmbedding() {
  const embedding = new Float32Array(768);
  for (let i = 0; i < 768; i++) {
    embedding[i] = Math.random() - 0.5;
  }
  return embedding;
}

describe('MCP Tool Helpers (Integration)', () => {
  let db: Database;

  beforeAll(() => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    closeDb();
    if (fs.existsSync(path.join(TEST_DATA_DIR, 'memory.db'))) {
        fs.unlinkSync(path.join(TEST_DATA_DIR, 'memory.db'));
    }
    if (fs.existsSync(path.join(TEST_DATA_DIR, 'memory.db-shm'))) {
        fs.unlinkSync(path.join(TEST_DATA_DIR, 'memory.db-shm'));
    }
    if (fs.existsSync(path.join(TEST_DATA_DIR, 'memory.db-wal'))) {
        fs.unlinkSync(path.join(TEST_DATA_DIR, 'memory.db-wal'));
    }
    db = await initDb();
  });

  afterEach(() => {
    closeDb();
  });

  describe('cortex_stats (getStats)', () => {
    test('should return empty stats for new database', () => {
      const stats = getStats(db);
      expect(stats.fragmentCount).toBe(0);
      expect(stats.projectCount).toBe(0);
      expect(stats.sessionCount).toBe(0);
    });

    test('should return correct counts', () => {
      insertMemory(db, { content: 'M1', embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's1', timestamp: new Date() });
      insertMemory(db, { content: 'M2', embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's1', timestamp: new Date() });
      insertMemory(db, { content: 'M3', embedding: createMockEmbedding(), projectId: 'p2', sourceSession: 's2', timestamp: new Date() });

      const stats = getStats(db);
      expect(stats.fragmentCount).toBe(3);
      expect(stats.projectCount).toBe(2);
      expect(stats.sessionCount).toBe(2);
    });

    test('should return project-specific stats', () => {
      insertMemory(db, { content: 'A', embedding: createMockEmbedding(), projectId: 'px', sourceSession: 's1', timestamp: new Date() });
      insertMemory(db, { content: 'B', embedding: createMockEmbedding(), projectId: 'px', sourceSession: 's2', timestamp: new Date() });
      insertMemory(db, { content: 'C', embedding: createMockEmbedding(), projectId: 'py', sourceSession: 's3', timestamp: new Date() });

      const stats = getProjectStats(db, 'px');
      expect(stats.fragmentCount).toBe(2);
      expect(stats.sessionCount).toBe(2);
    });
  });

  describe('cortex_recall (searchByKeyword)', () => {
    beforeEach(() => {
      insertMemory(db, { content: 'Implementing JWT authentication', embedding: createMockEmbedding(), projectId: 'auth', sourceSession: 's1', timestamp: new Date() });
      insertMemory(db, { content: 'Database migration strategy', embedding: createMockEmbedding(), projectId: 'db', sourceSession: 's2', timestamp: new Date() });
      insertMemory(db, { content: 'User authentication flow', embedding: createMockEmbedding(), projectId: 'auth', sourceSession: 's3', timestamp: new Date() });
    });

    test('should find memories by keyword', () => {
      const results = searchByKeyword(db, 'authentication');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.content.toLowerCase().includes('authentication'))).toBe(true);
    });

    test('should filter by project', () => {
      const results = searchByKeyword(db, 'authentication', 'auth');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every(r => r.projectId === 'auth')).toBe(true);
    });

    test('should return empty for no matches', () => {
      const results = searchByKeyword(db, 'nonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('cortex_remember (storeManualMemory)', () => {
    test('should store a manual memory', () => {
      const result = storeManualMemory(db, 'Important decision', createMockEmbedding(), 'my-project');
      expect(result.id).toBeGreaterThan(0);
      expect(result.isDuplicate).toBe(false);
      
      const stats = getStats(db);
      expect(stats.fragmentCount).toBe(1);
    });

    test('should detect duplicate content', () => {
      const content = 'Duplicate test';
      const emb = createMockEmbedding();
      
      const first = storeManualMemory(db, content, emb, 'p1');
      const second = storeManualMemory(db, content, emb, 'p1');

      expect(first.isDuplicate).toBe(false);
      expect(second.isDuplicate).toBe(true);
      expect(first.id).toBe(second.id);
    });

    test('should store memory with context', () => {
      const result = storeManualMemory(db, 'Decision', createMockEmbedding(), 'p1', 'Meeting notes');
      const memory = getMemory(db, result.id);
      expect(memory.content).toContain('Decision');
      expect(memory.content).toContain('Context:');
    });
  });

  describe('cortex_delete (deleteMemory)', () => {
    test('should delete memory by id', () => {
      const { id } = insertMemory(db, { content: 'Delete me', embedding: createMockEmbedding(), projectId: 'del', sourceSession: 's', timestamp: new Date() });
      
      expect(getStats(db).fragmentCount).toBe(1);
      
      const deleted = deleteMemory(db, id);
      expect(deleted).toBe(true);
      expect(getStats(db).fragmentCount).toBe(0);
    });

    test('should return false for non-existent id', () => {
      const deleted = deleteMemory(db, 9999);
      expect(deleted).toBe(false);
    });
  });

  describe('cortex_forget_project (deleteProjectMemories)', () => {
    test('should delete all memories for a project', () => {
      // Insert memories for target project
      insertMemory(db, {
        content: 'Memory 1',
        embedding: createMockEmbedding(),
        projectId: 'target-project',
        sourceSession: 'session-1',
        timestamp: new Date()
      });
      insertMemory(db, {
        content: 'Memory 2',
        embedding: createMockEmbedding(),
        projectId: 'target-project',
        sourceSession: 'session-2',
        timestamp: new Date()
      });
      
      // Insert memory for another project
      insertMemory(db, {
        content: 'Memory 3',
        embedding: createMockEmbedding(),
        projectId: 'keep-project',
        sourceSession: 'session-3',
        timestamp: new Date()
      });

      // Verify initial state
      let stats = getStats(db);
      expect(stats.fragmentCount).toBe(3);

      // Perform deletion
      const deletedCount = deleteProjectMemories(db, 'target-project');

      // Verify deletion count
      expect(deletedCount).toBe(2);

      // Verify final state
      stats = getStats(db);
      expect(stats.fragmentCount).toBe(1);

      // Verify remaining memory is correct
      const rows = db.query('SELECT project_id FROM memories').all() as any[];
      expect(rows[0].project_id).toBe('keep-project');
    });

    test('should return 0 for non-existent project', () => {
      const deletedCount = deleteProjectMemories(db, 'non-existent-project');
      expect(deletedCount).toBe(0);
    });
  });
});
