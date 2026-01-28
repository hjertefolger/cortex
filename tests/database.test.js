/**
 * Cortex Database Module Tests
 * Tests CRUD operations, deduplication, search, and statistics
 * Updated for Bun + bun:sqlite
 */

import { describe, test, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  initDb, 
  closeDb, 
  insertMemory, 
  getMemory, 
  deleteMemory, 
  getStats, 
  searchByKeyword, 
  deleteProjectMemories 
} from '../src/database.ts';

// Test data directory - isolated from production
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-test-' + Date.now());
process.env.CORTEX_DATA_DIR = TEST_DATA_DIR;

// Mock embeddings (768-dimensional vectors)
function createMockEmbedding(seed = 0) {
  const embedding = new Float32Array(768);
  for (let i = 0; i < 768; i++) {
    embedding[i] = Math.sin(seed + i * 0.1);
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < 768; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < 768; i++) {
    embedding[i] /= norm;
  }
  return embedding;
}

describe('Database Module', () => {
  let db;

  beforeAll(async () => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Ensure fresh start
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

  test('should create empty database', () => {
    const stats = getStats(db);
    expect(stats.fragmentCount).toBe(0);
  });

  test('should insert memory correctly', () => {
    const embedding = createMockEmbedding(1);
    
    const { id, isDuplicate } = insertMemory(db, {
        content: 'Test content 1',
        embedding,
        projectId: 'test-project',
        sourceSession: 'session-1',
        timestamp: new Date()
    });

    expect(isDuplicate).toBe(false);
    expect(id).toBeGreaterThan(0);

    const stats = getStats(db);
    expect(stats.fragmentCount).toBe(1);
  });

  test('should prevent duplicate content_hash', () => {
    const embedding = createMockEmbedding(1);
    const content = 'Content 1';

    // First insert
    insertMemory(db, {
        content,
        embedding,
        projectId: 'project-1',
        sourceSession: 'session-1',
        timestamp: new Date()
    });

    // Second insert with same content
    const result = insertMemory(db, {
        content, // Same content -> same hash
        embedding,
        projectId: 'project-1',
        sourceSession: 'session-1',
        timestamp: new Date()
    });

    expect(result.isDuplicate).toBe(true);
    
    const stats = getStats(db);
    expect(stats.fragmentCount).toBe(1);
  });

  test('should retrieve memory by id', () => {
    const embedding = createMockEmbedding(2);
    
    const { id } = insertMemory(db, {
        content: 'Retrievable content',
        embedding,
        projectId: 'project-test',
        sourceSession: 'session-test',
        timestamp: new Date()
    });

    const memory = getMemory(db, id);
    expect(memory).not.toBeNull();
    expect(memory.content).toBe('Retrievable content');
    expect(memory.projectId).toBe('project-test');
  });

  test('should delete memory by id', () => {
    const embedding = createMockEmbedding(3);
    
    const { id } = insertMemory(db, {
        content: 'To be deleted',
        embedding,
        projectId: 'project-del',
        sourceSession: 'session-del',
        timestamp: new Date()
    });

    expect(getStats(db).fragmentCount).toBe(1);

    const deleted = deleteMemory(db, id);
    expect(deleted).toBe(true);
    expect(getStats(db).fragmentCount).toBe(0);
  });

  test('should count memories per project', () => {
    const embedding = createMockEmbedding(4);

    // Insert memories for different projects
    for (let i = 0; i < 3; i++) {
        insertMemory(db, {
            content: `Content A-${i}`,
            embedding,
            projectId: 'project-a',
            sourceSession: `session-${i}`,
            timestamp: new Date()
        });
    }

    for (let i = 0; i < 2; i++) {
        insertMemory(db, {
            content: `Content B-${i}`,
            embedding,
            projectId: 'project-b',
            sourceSession: `session-${i}`,
            timestamp: new Date()
        });
    }
    
    // Check global stats
    const stats = getStats(db);
    expect(stats.fragmentCount).toBe(5);
    expect(stats.projectCount).toBe(2);
    
    // We can also check specific project stats via getProjectStats if we export it or use getStats logic
    // For now, global stats confirm insertion.
  });

  test('should search by keyword', () => {
    const embedding = createMockEmbedding(5);
    const contents = [
      'Implementing authentication with JWT tokens',
      'Setting up database migrations',
      'JWT token refresh mechanism',
      'User interface design patterns',
    ];

    contents.forEach((content, i) => {
        insertMemory(db, {
            content,
            embedding,
            projectId: 'search-project',
            sourceSession: 'session-search',
            timestamp: new Date()
        });
    });

    // Search for JWT
    const results = searchByKeyword(db, 'JWT', 'search-project');
    expect(results.length).toBe(2);
    expect(results[0].content).toContain('JWT');
  });

  test('should handle null project_id', () => {
    const embedding = createMockEmbedding(7);
    
    insertMemory(db, {
        content: 'Global memory',
        embedding,
        projectId: null,
        sourceSession: 'session-global',
        timestamp: new Date()
    });

    const memory = getMemory(db, 1);
    expect(memory.projectId).toBeNull();
  });

  test('should delete all memories for a project', () => {
    const embedding = createMockEmbedding(8);
    
    insertMemory(db, {
        content: 'To delete',
        embedding,
        projectId: 'to-delete',
        sourceSession: 'session-x',
        timestamp: new Date()
    });
    
    insertMemory(db, {
        content: 'Keep me',
        embedding,
        projectId: 'keep-project',
        sourceSession: 'session-y',
        timestamp: new Date()
    });

    deleteProjectMemories(db, 'to-delete');
    
    const stats = getStats(db);
    expect(stats.fragmentCount).toBe(1);
    
    const remaining = getMemory(db, 2); // ID 2 is likely the second one
    expect(remaining.projectId).toBe('keep-project');
  });

});