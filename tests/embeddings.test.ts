/**
 * Cortex Embeddings Module Tests
 * Tests embedding generation, batching, and model utilities
 * Uses mocks to avoid loading actual ML model during tests
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Mock Embedding Functions (simulate the module behavior)
// ============================================================================

const MOCK_MODEL_NAME = 'nomic-ai/nomic-embed-text-v1.5';
const MOCK_EMBEDDING_DIM = 768;
const PASSAGE_PREFIX = 'search_document: ';
const QUERY_PREFIX = 'search_query: ';

let mockEmbedderReady = false;

function mockInit() {
    mockEmbedderReady = true;
}

function mockReset() {
    mockEmbedderReady = false;
}

function isEmbedderReady() {
    return mockEmbedderReady;
}

function getEmbeddingDim() {
    return MOCK_EMBEDDING_DIM;
}

function getModelName() {
    return MOCK_MODEL_NAME;
}

// Generate deterministic mock embedding based on text hash
function generateMockEmbedding(text, dim = MOCK_EMBEDDING_DIM) {
    const embedding = new Float32Array(dim);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    for (let i = 0; i < dim; i++) {
        embedding[i] = Math.sin(hash + i * 0.1);
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

function embedPassage(text) {
    if (!mockEmbedderReady) throw new Error('Embedder not initialized');
    return generateMockEmbedding(PASSAGE_PREFIX + text);
}

function embedPassages(texts) {
    if (!mockEmbedderReady) throw new Error('Embedder not initialized');
    return texts.map(t => generateMockEmbedding(PASSAGE_PREFIX + t));
}

function embedQuery(text) {
    if (!mockEmbedderReady) throw new Error('Embedder not initialized');
    return generateMockEmbedding(QUERY_PREFIX + text);
}

function embedBatch(texts, options = {}) {
    if (!mockEmbedderReady) throw new Error('Embedder not initialized');

    const { batchSize = 32, onProgress, isQuery = false } = options;
    const prefix = isQuery ? QUERY_PREFIX : PASSAGE_PREFIX;
    const results = [];

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        for (const text of batch) {
            results.push(generateMockEmbedding(prefix + text));
        }
        if (onProgress) {
            onProgress(Math.min(i + batchSize, texts.length), texts.length);
        }
    }

    return results;
}

// ============================================================================
// Tests
// ============================================================================

describe('Embeddings Module', () => {
    beforeEach(() => {
        mockInit();
    });

    afterEach(() => {
        mockReset();
    });

    describe('Initialization', () => {
        test('should report embedder not ready before init', () => {
            mockReset();
            assert.strictEqual(isEmbedderReady(), false);
        });

        test('should report embedder ready after init', () => {
            assert.strictEqual(isEmbedderReady(), true);
        });

        test('should return correct embedding dimension', () => {
            assert.strictEqual(getEmbeddingDim(), 768);
        });

        test('should return correct model name', () => {
            assert.strictEqual(getModelName(), 'nomic-ai/nomic-embed-text-v1.5');
        });
    });

    describe('Single Passage Embedding', () => {
        test('should generate embedding with correct dimensions', () => {
            const embedding = embedPassage('test content');

            assert.ok(embedding instanceof Float32Array);
            assert.strictEqual(embedding.length, 768);
        });

        test('should generate normalized embedding (unit vector)', () => {
            const embedding = embedPassage('test content');

            let norm = 0;
            for (let i = 0; i < embedding.length; i++) {
                norm += embedding[i] * embedding[i];
            }
            norm = Math.sqrt(norm);

            assert.ok(Math.abs(norm - 1.0) < 0.0001, `Norm should be 1.0, got ${norm}`);
        });

        test('should generate deterministic embeddings', () => {
            const embedding1 = embedPassage('same content');
            const embedding2 = embedPassage('same content');

            for (let i = 0; i < embedding1.length; i++) {
                assert.strictEqual(embedding1[i], embedding2[i]);
            }
        });

        test('should generate different embeddings for different content', () => {
            const embedding1 = embedPassage('content A');
            const embedding2 = embedPassage('content B');

            let same = true;
            for (let i = 0; i < embedding1.length; i++) {
                if (embedding1[i] !== embedding2[i]) {
                    same = false;
                    break;
                }
            }

            assert.strictEqual(same, false, 'Different content should produce different embeddings');
        });

        test('should throw if embedder not initialized', () => {
            mockReset();
            assert.throws(() => embedPassage('test'), /not initialized/);
        });
    });

    describe('Batch Passage Embedding', () => {
        test('should generate embeddings for multiple texts', () => {
            const texts = ['text 1', 'text 2', 'text 3'];
            const embeddings = embedPassages(texts);

            assert.strictEqual(embeddings.length, 3);
            embeddings.forEach(emb => {
                assert.ok(emb instanceof Float32Array);
                assert.strictEqual(emb.length, 768);
            });
        });

        test('should handle empty array', () => {
            const embeddings = embedPassages([]);
            assert.strictEqual(embeddings.length, 0);
        });

        test('should handle single item array', () => {
            const embeddings = embedPassages(['single']);
            assert.strictEqual(embeddings.length, 1);
            assert.strictEqual(embeddings[0].length, 768);
        });
    });

    describe('Query Embedding', () => {
        test('should generate query embedding with correct dimensions', () => {
            const embedding = embedQuery('search query');

            assert.ok(embedding instanceof Float32Array);
            assert.strictEqual(embedding.length, 768);
        });

        test('should generate different embedding for query vs passage with same text', () => {
            const queryEmb = embedQuery('test');
            const passageEmb = embedPassage('test');

            // Query and passage embeddings should differ due to prefixes
            let same = true;
            for (let i = 0; i < queryEmb.length; i++) {
                if (queryEmb[i] !== passageEmb[i]) {
                    same = false;
                    break;
                }
            }

            assert.strictEqual(same, false, 'Query and passage embeddings should differ');
        });
    });

    describe('Batch Embedding with Progress', () => {
        test('should embed batches and call progress callback', () => {
            const texts = Array.from({ length: 50 }, (_, i) => `text ${i}`);
            const progressCalls = [];

            embedBatch(texts, {
                batchSize: 10,
                onProgress: (completed, total) => {
                    progressCalls.push({ completed, total });
                },
            });

            assert.ok(progressCalls.length > 0, 'Progress callback should be called');
            assert.strictEqual(progressCalls[progressCalls.length - 1].completed, 50);
            assert.strictEqual(progressCalls[progressCalls.length - 1].total, 50);
        });

        test('should respect batch size', () => {
            const texts = Array.from({ length: 25 }, (_, i) => `text ${i}`);
            const progressCalls = [];

            embedBatch(texts, {
                batchSize: 5,
                onProgress: (completed, total) => {
                    progressCalls.push({ completed, total });
                },
            });

            // Should have 5 progress calls for 25 items with batch size 5
            assert.strictEqual(progressCalls.length, 5);
        });

        test('should use query prefix when isQuery is true', () => {
            const texts = ['query 1'];
            const results = embedBatch(texts, { isQuery: true });

            assert.strictEqual(results.length, 1);
            // The embedding should differ from passage embedding
            const passageEmb = embedPassage('query 1');

            let same = true;
            for (let i = 0; i < results[0].length; i++) {
                if (results[0][i] !== passageEmb[i]) {
                    same = false;
                    break;
                }
            }

            assert.strictEqual(same, false);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty string', () => {
            const embedding = embedPassage('');
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle very long text', () => {
            const longText = 'a'.repeat(10000);
            const embedding = embedPassage(longText);
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle special characters', () => {
            const specialText = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
            const embedding = embedPassage(specialText);
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle unicode characters', () => {
            const unicodeText = '你好世界 🌍 مرحبا بالعالم';
            const embedding = embedPassage(unicodeText);
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle newlines and tabs', () => {
            const whitespaceText = 'line1\nline2\tline3\r\nline4';
            const embedding = embedPassage(whitespaceText);
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle whitespace only', () => {
            const whitespace = '   \t\n   ';
            const embedding = embedPassage(whitespace);
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle JSON-like content', () => {
            const jsonText = '{"key": "value", "array": [1, 2, 3]}';
            const embedding = embedPassage(jsonText);
            assert.strictEqual(embedding.length, 768);
        });

        test('should handle code snippets', () => {
            const codeText = 'function foo() { return bar.baz(); }';
            const embedding = embedPassage(codeText);
            assert.strictEqual(embedding.length, 768);
        });
    });
});

describe('Cosine Similarity', () => {
    beforeEach(() => {
        mockInit();
    });

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

    test('should have high similarity for identical content', () => {
        const emb1 = embedPassage('identical content');
        const emb2 = embedPassage('identical content');

        const similarity = cosineSimilarity(emb1, emb2);
        assert.ok(Math.abs(similarity - 1.0) < 0.0001);
    });

    test('should have lower similarity for different content', () => {
        const emb1 = embedPassage('apples and oranges');
        const emb2 = embedPassage('cars and motorcycles');

        const similarity = cosineSimilarity(emb1, emb2);
        assert.ok(similarity < 0.99, `Similarity should be < 0.99, got ${similarity}`);
    });

    test('should work with normalized vectors', () => {
        const emb1 = embedPassage('test');
        const emb2 = embedPassage('test');

        // For normalized vectors, dot product = cosine similarity
        let dotProduct = 0;
        for (let i = 0; i < emb1.length; i++) {
            dotProduct += emb1[i] * emb2[i];
        }

        assert.ok(Math.abs(dotProduct - 1.0) < 0.0001);
    });
});
