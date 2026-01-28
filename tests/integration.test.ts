/**
 * Cortex Integration Tests
 * End-to-end workflow tests verifying full functionality
 * Updated for Bun + bun:sqlite
 */

import { describe, test, beforeAll, afterAll, beforeEach, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from 'bun:sqlite';
import { 
    initDb, 
    closeDb, 
    insertMemory, 
    getStats, 
    deleteProjectMemories,
    searchByVector,
    searchByKeyword,
    hashContent
} from '../src/database.ts';

// ============================================================================ 
// Test Setup
// ============================================================================ 

const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-integration-test-' + Date.now());
process.env.CORTEX_DATA_DIR = TEST_DATA_DIR;

// ============================================================================ 
// Mock Utilities
// ============================================================================ 

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
    if (norm > 0) {
        for (let i = 0; i < dim; i++) {
            embedding[i] /= norm;
        }
    }
    return embedding;
}

// ============================================================================ 
// Integration Tests
// ============================================================================ 

describe('Integration Tests', () => {
    let db: Database;

    beforeAll(async () => {
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }
    });

    afterAll(() => {
        closeDb();
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

    describe('Full Archive → Search → Recall Workflow', () => {
        test('should store and retrieve memories by vector similarity', () => {
            const baseEmbedding = createMockEmbedding();

            const memories = [
                { content: 'Implementing JWT authentication', embedding: baseEmbedding },
                { content: 'Database schema design', embedding: createMockEmbedding() },
                { content: 'API endpoint routing', embedding: createMockEmbedding() },
            ];

            for (const mem of memories) {
                insertMemory(db, {
                    content: mem.content,
                    embedding: mem.embedding,
                    projectId: 'test-project',
                    sourceSession: 'session-1',
                    timestamp: new Date()
                });
            }

            const results = searchByVector(db, baseEmbedding, 'test-project', 5);

            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].content).toBe('Implementing JWT authentication');
            expect(results[0].score).toBeGreaterThan(0.9);
        });

        test('should store and retrieve memories by keyword search', () => {
            const memories = [
                'Implementing JWT authentication system with refresh tokens',
                'Database migration strategy using Prisma ORM',
                'React component optimization with useMemo hooks',
            ];

            for (const content of memories) {
                insertMemory(db, {
                    content,
                    embedding: createMockEmbedding(),
                    projectId: 'test-project',
                    sourceSession: 'session-1',
                    timestamp: new Date()
                });
            }

            const results = searchByKeyword(db, 'JWT authentication', 'test-project', 5);

            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].content).toContain('JWT');
        });

        test('should retrieve stats accurately after operations', () => {
            let stats = getStats(db);
            expect(stats.fragmentCount).toBe(0);

            insertMemory(db, { content: 'Memory 1', embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: 'Memory 2', embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: 'Memory 3', embedding: createMockEmbedding(), projectId: 'project-b', sourceSession: 's2', timestamp: new Date() });

            stats = getStats(db);
            expect(stats.fragmentCount).toBe(3);
            expect(stats.projectCount).toBe(2);
        });
    });

    describe('Search Quality & Relevance', () => {
        test('should prioritize exact semantic matches over partial keyword matches', () => {
            const memories = [
                { content: 'How to configure TypeScript in a Node.js project properly' },
                { content: 'Node.js event loop explanation and setTimeout' },
                { content: 'Python script for data analysis with pandas' }
            ];

            const targetEmbedding = createMockEmbedding();
            const closeEmbedding = new Float32Array(targetEmbedding);
            closeEmbedding[0] += 0.01; // Closer than random

            insertMemory(db, { content: memories[0].content, embedding: closeEmbedding, projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: memories[1].content, embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: memories[2].content, embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });

            const results = searchByVector(db, targetEmbedding, 'project-a', 5);

            expect(results[0].content).toBe(memories[0].content);
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });

        test('should rank semantically relevant results above keyword-only noise', () => {
            const relevantContent = 'Releasing the application to the production server environment';
            const noiseContent = 'The deploy_script variable is set to true';

            const queryEmb = createMockEmbedding();
            const relevantEmb = new Float32Array(queryEmb);
            relevantEmb[0] += 0.01;

            insertMemory(db, { content: relevantContent, embedding: relevantEmb, projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: noiseContent, embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });

            const results = searchByVector(db, queryEmb, 'project-a', 5);

            expect(results[0].content).toBe(relevantContent);
            expect(results[0].score).toBeGreaterThan(0.9);
        });
    });

    describe('Cross-Project Learning', () => {
        test('should search across all projects by default (shared knowledge brain)', () => {
            insertMemory(db, { content: 'Authentication approach using JWT tokens', embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: 'JWT refresh token strategy', embedding: createMockEmbedding(), projectId: 'project-b', sourceSession: 's2', timestamp: new Date() });

            // searchByKeyword with undefined projectId searches everything
            const results = searchByKeyword(db, 'JWT', undefined, 10);

            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        test('should allow optional project filtering when needed', () => {
            insertMemory(db, { content: 'Learning A from project-a', embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: 'Learning B from project-b', embedding: createMockEmbedding(), projectId: 'project-b', sourceSession: 's2', timestamp: new Date() });

            const resultsA = searchByKeyword(db, 'Learning', 'project-a', 10);

            expect(resultsA.length).toBe(1);
            expect(resultsA[0].content).toContain('project-a');
        });

        test('should share global memories across all contexts', () => {
            insertMemory(db, { content: 'Global best practice: env vars', embedding: createMockEmbedding(), projectId: null, sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: 'Project-specific: Postgres', embedding: createMockEmbedding(), projectId: 'specific', sourceSession: 's2', timestamp: new Date() });

            const globalResults = searchByKeyword(db, 'env vars', undefined, 10);
            expect(globalResults.length).toBe(1);
        });

        test('should delete project memories with forget_project', () => {
            insertMemory(db, { content: 'Keep A', embedding: createMockEmbedding(), projectId: 'project-a', sourceSession: 's1', timestamp: new Date() });
            insertMemory(db, { content: 'Delete B', embedding: createMockEmbedding(), projectId: 'project-b', sourceSession: 's2', timestamp: new Date() });

            const deleted = deleteProjectMemories(db, 'project-b');
            expect(deleted).toBe(1);

            const remaining = searchByKeyword(db, 'Delete', undefined, 10);
            expect(remaining.length).toBe(0);
        });
    });

    describe('Deduplication', () => {
        test('should prevent duplicate content', () => {
            const content = 'Unique content test';
            const embedding = createMockEmbedding();

            const first = insertMemory(db, { content, embedding, projectId: 'p1', sourceSession: 's1', timestamp: new Date() });
            const second = insertMemory(db, { content, embedding, projectId: 'p1', sourceSession: 's2', timestamp: new Date() });

            expect(first.isDuplicate).toBe(false);
            expect(second.isDuplicate).toBe(true);
            expect(first.id).toBe(second.id);

            expect(getStats(db).fragmentCount).toBe(1);
        });

        test('should detect near-duplicate content with whitespace', () => {
            const content1 = 'Content space ';
            const content2 = 'Content space';

            const first = insertMemory(db, { content: content1, embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's1', timestamp: new Date() });
            const second = insertMemory(db, { content: content2, embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's1', timestamp: new Date() });

            expect(first.isDuplicate).toBe(false);
            expect(second.isDuplicate).toBe(true);
        });
    });

    describe('Session Management', () => {
        test('should track memories by session', () => {
            insertMemory(db, { content: 'S1 M1', embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's001', timestamp: new Date() });
            insertMemory(db, { content: 'S1 M2', embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's001', timestamp: new Date() });
            insertMemory(db, { content: 'S2 M1', embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's002', timestamp: new Date() });

            const stats = getStats(db);
            expect(stats.sessionCount).toBe(2);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty database gracefully', () => {
            const vectorResults = searchByVector(db, createMockEmbedding(), 'any', 5);
            const keywordResults = searchByKeyword(db, 'any', 'any', 5);
            expect(vectorResults).toEqual([]);
            expect(keywordResults).toEqual([]);
        });

        test('should handle very long content', () => {
            const longContent = 'A'.repeat(5000);
            const { id } = insertMemory(db, { content: longContent, embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's1', timestamp: new Date() });
            expect(id).toBeGreaterThan(0);
        });

        test('should handle special characters', () => {
            const content = 'Special characters: ` ~ ! @ # $ % ^ & * ( ) _ + - = { } | [ ] \ : " ; \'\' < > ? , . /';
            const { id } = insertMemory(db, { content, embedding: createMockEmbedding(), projectId: 'p1', sourceSession: 's1', timestamp: new Date() });
            expect(id).toBeGreaterThan(0);
        });
    });
});