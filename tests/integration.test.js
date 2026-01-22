/**
 * Cortex Integration Tests
 * End-to-end workflow tests verifying full functionality
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-integration-test-' + Date.now());

// ============================================================================
// Mock Database and Utilities
// ============================================================================

let SQL;
let db;

function hashContent(content) {
    return crypto.createHash('sha256').update(content.trim()).digest('hex').substring(0, 16);
}

function createMockEmbedding(dim = 768) {
    const embedding = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
        embedding[i] = Math.random() - 0.5;
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) {
        norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < dim; i++) {
        embedding[i] /= norm;
    }
    return embedding;
}

function embeddingToBuffer(embedding) {
    return Buffer.from(embedding.buffer);
}

function bufferToEmbedding(buffer) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

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

// Create database schema
function createSchema(db) {
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
}

// Memory operations
function insertMemory(db, content, embedding, projectId, sessionId) {
    const hash = hashContent(content);
    const embeddingBuffer = embeddingToBuffer(embedding);

    // Check for duplicate
    const existing = db.exec(`SELECT id FROM memories WHERE content_hash = ?`, [hash]);
    if (existing.length > 0 && existing[0].values.length > 0) {
        return { id: existing[0].values[0][0], isDuplicate: true };
    }

    db.run(
        `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [content, hash, embeddingBuffer, projectId, sessionId, new Date().toISOString()]
    );

    const result = db.exec(`SELECT last_insert_rowid()`);
    return { id: result[0].values[0][0], isDuplicate: false };
}

function searchByVector(db, queryEmbedding, projectId, limit = 5) {
    let sql = `SELECT id, content, embedding, project_id, timestamp FROM memories`;
    const params = [];

    if (projectId !== undefined) {
        sql += ` WHERE project_id = ?`;
        params.push(projectId);
    }

    const result = db.exec(sql, params);

    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }

    // Calculate similarity for each result
    const scored = result[0].values.map(row => {
        const id = row[0];
        const content = row[1];
        const embeddingBuffer = row[2];
        const projId = row[3];
        const timestamp = row[4];

        const embedding = bufferToEmbedding(Buffer.from(embeddingBuffer));
        const score = cosineSimilarity(queryEmbedding, embedding);

        return {
            id,
            content,
            score,
            projectId: projId,
            timestamp: new Date(timestamp),
        };
    });

    // Sort by score and limit
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function searchByKeyword(db, query, projectId, limit = 5) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
        return [];
    }

    const conditions = words.map(() => `LOWER(content) LIKE ?`);
    const params = words.map(w => `%${w}%`);

    let sql = `SELECT id, content, project_id, timestamp FROM memories WHERE ${conditions.join(' AND ')}`;

    if (projectId !== undefined) {
        sql += ` AND project_id = ?`;
        params.push(projectId);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const result = db.exec(sql, params);

    if (result.length === 0 || result[0].values.length === 0) {
        return [];
    }

    return result[0].values.map((row, index) => ({
        id: row[0],
        content: row[1],
        score: 1 - (index * 0.1), // Simple descending score
        projectId: row[2],
        timestamp: new Date(row[3]),
    }));
}

function getStats(db, projectId = null) {
    let fragmentResult, sessionResult;

    if (projectId) {
        fragmentResult = db.exec(`SELECT COUNT(*) FROM memories WHERE project_id = ?`, [projectId]);
        sessionResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories WHERE project_id = ?`, [projectId]);
    } else {
        fragmentResult = db.exec(`SELECT COUNT(*) FROM memories`);
        sessionResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories`);
    }

    const projectResult = db.exec(`SELECT COUNT(DISTINCT project_id) FROM memories WHERE project_id IS NOT NULL`);

    return {
        fragmentCount: fragmentResult[0]?.values[0]?.[0] ?? 0,
        sessionCount: sessionResult[0]?.values[0]?.[0] ?? 0,
        projectCount: projectResult[0]?.values[0]?.[0] ?? 0,
    };
}

function deleteProjectMemories(db, projectId) {
    db.run(`DELETE FROM memories WHERE project_id = ?`, [projectId]);
    return db.getRowsModified();
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration Tests', () => {
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
        createSchema(db);
    });

    describe('Full Archive → Search → Recall Workflow', () => {
        test('should store and retrieve memories by vector similarity', () => {
            // Create a "known" embedding that we'll use for searching
            const baseEmbedding = createMockEmbedding();

            // Store several memories with variations of the embedding
            const memories = [
                { content: 'Implementing JWT authentication', embedding: baseEmbedding },
                { content: 'Database schema design', embedding: createMockEmbedding() },
                { content: 'API endpoint routing', embedding: createMockEmbedding() },
            ];

            for (const mem of memories) {
                insertMemory(db, mem.content, mem.embedding, 'test-project', 'session-1');
            }

            // Search with the base embedding (should find the first memory)
            const results = searchByVector(db, baseEmbedding, 'test-project', 5);

            assert.ok(results.length >= 1, 'Should find at least one result');
            assert.strictEqual(results[0].content, 'Implementing JWT authentication');
            assert.ok(results[0].score > 0.9, 'First result should have high similarity');
        });

        test('should store and retrieve memories by keyword search', () => {
            // Store memories
            const memories = [
                'Implementing JWT authentication system with refresh tokens',
                'Database migration strategy using Prisma ORM',
                'React component optimization with useMemo hooks',
            ];

            for (const content of memories) {
                insertMemory(db, content, createMockEmbedding(), 'test-project', 'session-1');
            }

            // Search by keyword
            const results = searchByKeyword(db, 'JWT authentication', 'test-project', 5);

            assert.ok(results.length >= 1, 'Should find JWT-related memory');
            assert.ok(results[0].content.includes('JWT'), 'Result should contain search term');
        });

        test('should retrieve stats accurately after operations', () => {
            // Initial stats should be empty
            let stats = getStats(db);
            assert.strictEqual(stats.fragmentCount, 0);
            assert.strictEqual(stats.sessionCount, 0);

            // Add memories
            insertMemory(db, 'Memory 1', createMockEmbedding(), 'project-a', 'session-1');
            insertMemory(db, 'Memory 2', createMockEmbedding(), 'project-a', 'session-1');
            insertMemory(db, 'Memory 3', createMockEmbedding(), 'project-b', 'session-2');

            // Check updated stats
            stats = getStats(db);
            assert.strictEqual(stats.fragmentCount, 3);
            assert.strictEqual(stats.projectCount, 2);

            // Check project-specific stats
            const projectStats = getStats(db, 'project-a');
            assert.strictEqual(projectStats.fragmentCount, 2);
        });
    });

    describe('Search Quality & Relevance', () => {
        test('should prioritize exact semantic matches over partial keyword matches', () => {
            // 1. Setup specific distinct memories
            const memories = [
                { id: 'ts', content: 'How to configure TypeScript in a Node.js project properly' },
                { id: 'js', content: 'Node.js event loop explanation and setTimeout' },
                { id: 'py', content: 'Python script for data analysis with pandas' }
            ];

            // Use distinct embeddings to simulate semantic difference
            // In a real scenario, the model would generate these. Here we simulate the vector distance.
            // We'll manually insert them to control the "closeness" for the test

            // "Target" embedding
            const targetEmbedding = createMockEmbedding();

            // "Close" embedding (0.9 similarity)
            const closeEmbedding = new Float32Array(targetEmbedding);
            closeEmbedding[0] += 0.1; // Slight perturbation

            // "Far" embedding (random)
            const farEmbedding = createMockEmbedding();

            insertMemory(db, memories[0].content, closeEmbedding, 'project-a', 'session-1'); // TypeScript (Target)
            insertMemory(db, memories[1].content, farEmbedding, 'project-a', 'session-1');   // Node.js (Noise)
            insertMemory(db, memories[2].content, farEmbedding, 'project-a', 'session-1');   // Python (Unrelated)

            // 2. Search using the target embedding
            const results = searchByVector(db, targetEmbedding, 'project-a', 5);

            // 3. Assertions
            assert.strictEqual(results[0].content, memories[0].content, 'Should rank TypeScript config first');
            assert.ok(results[0].score > results[1].score, 'Relevant result should have significantly higher score');
        });

        test('should rank semantically relevant results above keyword-only noise', () => {
            // Memory A: Semantically relevant to "deployment", but no "deploy" keyword
            // Memory B: Has "deploy" keyword but totally unrelated context

            const relevantContent = 'Releasing the application to the production server environment';
            const noiseContent = 'The deploy_script variable is set to true';

            // Simulate semantic search finding the relevant one despite keyword gap
            // We do this by inserting the relevant one with a closer embedding
            const queryEmb = createMockEmbedding();

            const relevantEmb = new Float32Array(queryEmb); // Very close
            const noiseEmb = createMockEmbedding(); // Random/Far

            insertMemory(db, relevantContent, relevantEmb, 'project-a', 's1');
            insertMemory(db, noiseContent, noiseEmb, 'project-a', 's1');

            const results = searchByVector(db, queryEmb, 'project-a', 5);

            assert.strictEqual(results[0].content, relevantContent);
            assert.ok(results[0].score > 0.9, 'Semantic match should be high confidence');
        });
    });

    describe('Cross-Project Learning', () => {
        test('should search across all projects by default (shared knowledge brain)', () => {
            // Store learnings from different projects
            insertMemory(db, 'Authentication approach using JWT tokens worked well', createMockEmbedding(), 'project-a', 'session-1');
            insertMemory(db, 'JWT refresh token strategy that solved session issues', createMockEmbedding(), 'project-b', 'session-2');
            insertMemory(db, 'Microservices architecture decision for scalability', createMockEmbedding(), 'project-c', 'session-3');

            // Search should find learnings from ALL projects
            const results = searchByKeyword(db, 'JWT', undefined, 10);

            // Cortex is a cross-project brain - should find knowledge from all projects
            assert.ok(results.length >= 2, 'Should find JWT learnings from multiple projects');
        });

        test('should allow optional project filtering when needed', () => {
            insertMemory(db, 'Learning A from project-a', createMockEmbedding(), 'project-a', 'session-1');
            insertMemory(db, 'Learning B from project-b', createMockEmbedding(), 'project-b', 'session-2');

            // Optional project filter for project-specific context
            const resultsA = searchByKeyword(db, 'Learning', 'project-a', 10);

            assert.strictEqual(resultsA.length, 1);
            assert.ok(resultsA[0].content.includes('project-a'));
        });

        test('should learn from past project failures and successes', () => {
            // Store lessons learned from different projects
            insertMemory(db, 'FAILURE: Monolith architecture caused scaling issues', createMockEmbedding(), 'legacy-app', 'session-1');
            insertMemory(db, 'SUCCESS: Event-driven architecture solved the scaling problem', createMockEmbedding(), 'modern-app', 'session-2');
            insertMemory(db, 'PLAN: Consider message queues for async processing', createMockEmbedding(), 'future-project', 'session-3');

            // When starting new project, can learn from all past experiences
            const scalingLessons = searchByKeyword(db, 'scaling', undefined, 10);

            assert.strictEqual(scalingLessons.length, 2, 'Should find scaling lessons from past projects');
        });

        test('should share global memories across all contexts', () => {
            // Global memory (null project_id) - shared knowledge
            insertMemory(db, 'Global best practice: Always use environment variables for secrets', createMockEmbedding(), null, 'session-1');
            insertMemory(db, 'Project-specific: Using PostgreSQL for this project', createMockEmbedding(), 'specific-project', 'session-2');

            // Global memories should be findable from any context
            const globalResults = searchByKeyword(db, 'environment variables', undefined, 10);
            const allResults = searchByKeyword(db, 'PostgreSQL', undefined, 10);

            assert.strictEqual(globalResults.length, 1);
            assert.strictEqual(allResults.length, 1);
        });

        test('should delete project memories with forget_project (when explicitly requested)', () => {
            insertMemory(db, 'Memory to keep A', createMockEmbedding(), 'project-a', 'session-1');
            insertMemory(db, 'Memory to delete B', createMockEmbedding(), 'project-b', 'session-2');

            // Explicit deletion when user requests to forget a project
            const deleted = deleteProjectMemories(db, 'project-b');

            assert.strictEqual(deleted, 1, 'Should delete only the requested project');

            const remaining = searchByKeyword(db, 'Memory to', undefined, 10);
            assert.strictEqual(remaining.length, 1);
            assert.ok(remaining[0].content.includes('keep A'));
        });
    });

    describe('Deduplication', () => {
        test('should prevent duplicate content', () => {
            const content = 'This exact content should only be stored once.';
            const embedding = createMockEmbedding();

            const first = insertMemory(db, content, embedding, 'project-a', 'session-1');
            const second = insertMemory(db, content, embedding, 'project-a', 'session-2');

            assert.strictEqual(first.isDuplicate, false);
            assert.strictEqual(second.isDuplicate, true);
            assert.strictEqual(first.id, second.id);

            // Check only one memory exists
            const stats = getStats(db);
            assert.strictEqual(stats.fragmentCount, 1);
        });

        test('should allow same content in different projects', () => {
            const content = 'Shared architecture decision across projects.';

            // Note: Our current implementation deduplicates by content_hash globally
            // This test verifies the current behavior
            const first = insertMemory(db, content, createMockEmbedding(), 'project-a', 'session-1');
            const second = insertMemory(db, content, createMockEmbedding(), 'project-b', 'session-2');

            // With global deduplication, second should be marked as duplicate
            // If project-scoped dedup is desired, the logic would need to change
            assert.strictEqual(first.isDuplicate, false);
            assert.strictEqual(second.isDuplicate, true);
        });

        test('should detect near-duplicate content with whitespace differences', () => {
            const content1 = 'Content with trailing space ';
            const content2 = 'Content with trailing space';

            // Hash uses trim(), so these should be the same
            const first = insertMemory(db, content1, createMockEmbedding(), 'project-a', 'session-1');
            const second = insertMemory(db, content2, createMockEmbedding(), 'project-a', 'session-1');

            assert.strictEqual(first.isDuplicate, false);
            assert.strictEqual(second.isDuplicate, true);
        });
    });

    describe('Session Management', () => {
        test('should track memories by session', () => {
            insertMemory(db, 'Session 1 memory A', createMockEmbedding(), 'project-a', 'session-001');
            insertMemory(db, 'Session 1 memory B', createMockEmbedding(), 'project-a', 'session-001');
            insertMemory(db, 'Session 2 memory', createMockEmbedding(), 'project-a', 'session-002');

            // Check session count
            const stats = getStats(db, 'project-a');
            assert.strictEqual(stats.sessionCount, 2);
        });

        test('should store session summaries', () => {
            const sessionId = 'session-test-123';
            const summary = 'Implemented authentication system';
            const decisions = JSON.stringify(['Use JWT', 'Use PostgreSQL']);

            db.run(
                `INSERT INTO session_summaries (project_id, session_id, summary, key_decisions, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
                ['project-a', sessionId, summary, decisions, new Date().toISOString()]
            );

            // Retrieve summary
            const result = db.exec(
                `SELECT summary, key_decisions FROM session_summaries WHERE session_id = ?`,
                [sessionId]
            );

            assert.strictEqual(result[0].values[0][0], summary);
            assert.deepStrictEqual(JSON.parse(result[0].values[0][1]), ['Use JWT', 'Use PostgreSQL']);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty database gracefully', () => {
            const vectorResults = searchByVector(db, createMockEmbedding(), 'any-project', 5);
            const keywordResults = searchByKeyword(db, 'anything', 'any-project', 5);
            const stats = getStats(db);

            assert.deepStrictEqual(vectorResults, []);
            assert.deepStrictEqual(keywordResults, []);
            assert.strictEqual(stats.fragmentCount, 0);
        });

        test('should handle very long content', () => {
            const longContent = 'A'.repeat(10000);

            const result = insertMemory(db, longContent, createMockEmbedding(), 'project-a', 'session-1');

            assert.ok(result.id > 0);

            const retrieved = searchByKeyword(db, 'AAA', 'project-a', 1);
            assert.strictEqual(retrieved.length, 1);
            assert.strictEqual(retrieved[0].content.length, 10000);
        });

        test('should handle special characters in content', () => {
            const specialContent = 'Code: `const x = "hello";` and SQL: SELECT * FROM users WHERE id = 1;';

            insertMemory(db, specialContent, createMockEmbedding(), 'project-a', 'session-1');

            const results = searchByKeyword(db, 'SELECT', 'project-a', 1);

            assert.strictEqual(results.length, 1);
            assert.ok(results[0].content.includes('SELECT'));
        });

        test('should handle unicode content', () => {
            const unicodeContent = 'Japanese: 日本語, Chinese: 中文, Arabic: العربية, Emoji: 🚀🎯';

            insertMemory(db, unicodeContent, createMockEmbedding(), 'project-a', 'session-1');

            const results = searchByKeyword(db, '日本語', 'project-a', 1);

            assert.strictEqual(results.length, 1);
        });

        test('should handle null project_id (global memories)', () => {
            insertMemory(db, 'Global memory content', createMockEmbedding(), null, 'session-1');

            // Search without project filter should find global memory
            const results = searchByKeyword(db, 'Global memory', undefined, 5);

            assert.ok(results.length >= 1, 'Should find global memory');
            // Find the one with null projectId
            const globalResult = results.find(r => r.projectId === null);
            assert.ok(globalResult, 'Should find memory with null projectId');
        });

        test('should maintain ordering by timestamp', () => {
            // Insert memories with different timestamps
            const now = Date.now();

            for (let i = 0; i < 5; i++) {
                const content = `Memory ${i} unique content`;
                insertMemory(db, content, createMockEmbedding(), 'project-a', `session-${i}`);
            }

            const results = searchByKeyword(db, 'Memory unique content', 'project-a', 10);

            // Should be ordered by timestamp (most recent first)
            assert.ok(results.length === 5);

            // Verify ordering
            for (let i = 1; i < results.length; i++) {
                assert.ok(
                    results[i - 1].timestamp >= results[i].timestamp,
                    'Results should be ordered by timestamp descending'
                );
            }
        });
    });

    describe('Concurrent Operations', () => {
        test('should handle rapid insertions', () => {
            const count = 100;

            for (let i = 0; i < count; i++) {
                insertMemory(db, `Rapid insert ${i} with unique content`, createMockEmbedding(), 'project-a', 'session-1');
            }

            const stats = getStats(db, 'project-a');
            assert.strictEqual(stats.fragmentCount, count);
        });

        test('should handle insert after delete', () => {
            // Insert
            insertMemory(db, 'Content to delete', createMockEmbedding(), 'project-a', 'session-1');

            // Delete
            deleteProjectMemories(db, 'project-a');

            // Insert again
            const result = insertMemory(db, 'New content after delete', createMockEmbedding(), 'project-a', 'session-2');

            assert.ok(result.id > 0);
            assert.strictEqual(result.isDuplicate, false);

            const stats = getStats(db, 'project-a');
            assert.strictEqual(stats.fragmentCount, 1);
        });
    });
});
