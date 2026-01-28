/**
 * Cortex Search Module Tests
 * Tests hybrid search, RRF fusion, recency decay, and result formatting
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// Mock Data and Utilities
// ============================================================================

// Sample search results for testing
function createMockResults(count, source = 'vector') {
    const results = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        results.push({
            id: i + 1,
            content: `Memory content ${i + 1}`,
            score: 1 - (i * 0.1), // Descending scores
            timestamp: new Date(now - i * 86400000), // Each day older
            projectId: i % 2 === 0 ? 'project-a' : 'project-b',
            source,
        });
    }

    return results;
}

// ============================================================================
// RRF (Reciprocal Rank Fusion) Implementation
// ============================================================================

const RRF_K = 60;
const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

function combineWithRRF(vectorResults, keywordResults) {
    const scores = new Map();

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

        const entry = scores.get(result.id);
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

        const entry = scores.get(result.id);
        entry.rrfScore += rrfScore;
        entry.sources.add('keyword');
    });

    // Convert to array
    return Array.from(scores.entries()).map(([id, data]) => {
        let source;
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
// Recency Decay Implementation
// ============================================================================

const RECENCY_HALF_LIFE_DAYS = 7;

function applyRecencyDecay(results) {
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
// Formatting Implementation
// ============================================================================

function formatTimeAgo(date) {
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

function formatSearchResults(results) {
    if (results.length === 0) {
        return 'No matching memories found.';
    }

    const lines = [];
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

// ============================================================================
// Tests
// ============================================================================

describe('RRF (Reciprocal Rank Fusion)', () => {
    test('should combine vector and keyword results', () => {
        const vectorResults = createMockResults(3, 'vector');
        const keywordResults = createMockResults(3, 'keyword');

        const combined = combineWithRRF(vectorResults, keywordResults);

        assert.ok(combined.length > 0, 'Should have combined results');
    });

    test('should assign higher score to results appearing in both', () => {
        const vectorResults = [
            { id: 1, content: 'shared result', score: 0.9, timestamp: new Date(), projectId: 'p1' },
            { id: 2, content: 'vector only', score: 0.8, timestamp: new Date(), projectId: 'p1' },
        ];
        const keywordResults = [
            { id: 1, content: 'shared result', score: 0.9, timestamp: new Date(), projectId: 'p1' },
            { id: 3, content: 'keyword only', score: 0.8, timestamp: new Date(), projectId: 'p1' },
        ];

        const combined = combineWithRRF(vectorResults, keywordResults);

        const sharedResult = combined.find(r => r.id === 1);
        const vectorOnlyResult = combined.find(r => r.id === 2);
        const keywordOnlyResult = combined.find(r => r.id === 3);

        assert.ok(sharedResult.score > vectorOnlyResult.score, 'Shared result should have higher score');
        assert.ok(sharedResult.score > keywordOnlyResult.score, 'Shared result should have higher score');
    });

    test('should mark source as hybrid when in both result sets', () => {
        const vectorResults = [
            { id: 1, content: 'shared', score: 0.9, timestamp: new Date(), projectId: 'p1' },
        ];
        const keywordResults = [
            { id: 1, content: 'shared', score: 0.9, timestamp: new Date(), projectId: 'p1' },
        ];

        const combined = combineWithRRF(vectorResults, keywordResults);

        assert.strictEqual(combined[0].source, 'hybrid');
    });

    test('should mark source as vector when only in vector results', () => {
        const vectorResults = [
            { id: 1, content: 'vector only', score: 0.9, timestamp: new Date(), projectId: 'p1' },
        ];
        const keywordResults = [];

        const combined = combineWithRRF(vectorResults, keywordResults);

        assert.strictEqual(combined[0].source, 'vector');
    });

    test('should mark source as keyword when only in keyword results', () => {
        const vectorResults = [];
        const keywordResults = [
            { id: 1, content: 'keyword only', score: 0.9, timestamp: new Date(), projectId: 'p1' },
        ];

        const combined = combineWithRRF(vectorResults, keywordResults);

        assert.strictEqual(combined[0].source, 'keyword');
    });

    test('should handle empty results', () => {
        const combined = combineWithRRF([], []);
        assert.strictEqual(combined.length, 0);
    });

    test('should apply rank-based scoring', () => {
        const vectorResults = [
            { id: 1, content: 'rank 0', score: 0.9, timestamp: new Date(), projectId: 'p1' },
            { id: 2, content: 'rank 1', score: 0.8, timestamp: new Date(), projectId: 'p1' },
        ];
        const keywordResults = [];

        const combined = combineWithRRF(vectorResults, keywordResults);

        const rank0 = combined.find(r => r.id === 1);
        const rank1 = combined.find(r => r.id === 2);

        assert.ok(rank0.score > rank1.score, 'Higher rank should have higher score');
    });

    test('should preserve content and metadata', () => {
        const timestamp = new Date('2024-01-15');
        const vectorResults = [
            { id: 42, content: 'specific content', score: 0.9, timestamp, projectId: 'my-project' },
        ];

        const combined = combineWithRRF(vectorResults, []);

        assert.strictEqual(combined[0].id, 42);
        assert.strictEqual(combined[0].content, 'specific content');
        assert.strictEqual(combined[0].projectId, 'my-project');
        assert.strictEqual(combined[0].timestamp.getTime(), timestamp.getTime());
    });
});

describe('Recency Decay', () => {
    test('should apply decay based on age', () => {
        const now = Date.now();
        const results = [
            { id: 1, score: 1.0, content: 'today', timestamp: new Date(now), projectId: 'p1', source: 'vector' },
            { id: 2, score: 1.0, content: 'week ago', timestamp: new Date(now - 7 * 86400000), projectId: 'p1', source: 'vector' },
        ];

        const decayed = applyRecencyDecay(results);

        assert.ok(decayed[0].score > decayed[1].score, 'Newer result should have higher score after decay');
    });

    test('should preserve relative ordering for same-age items', () => {
        const now = Date.now();
        const results = [
            { id: 1, score: 0.9, content: 'higher', timestamp: new Date(now), projectId: 'p1', source: 'vector' },
            { id: 2, score: 0.8, content: 'lower', timestamp: new Date(now), projectId: 'p1', source: 'vector' },
        ];

        const decayed = applyRecencyDecay(results);

        assert.ok(decayed[0].score > decayed[1].score, 'Original ordering should be preserved');
    });

    test('should not increase scores', () => {
        const now = Date.now();
        const results = [
            { id: 1, score: 1.0, content: 'test', timestamp: new Date(now), projectId: 'p1', source: 'vector' },
        ];

        const decayed = applyRecencyDecay(results);

        assert.ok(decayed[0].score <= 1.0, 'Score should not exceed original');
    });

    test('should handle very old timestamps', () => {
        const results = [
            { id: 1, score: 1.0, content: 'ancient', timestamp: new Date('2020-01-01'), projectId: 'p1', source: 'vector' },
        ];

        const decayed = applyRecencyDecay(results);

        assert.ok(decayed[0].score > 0, 'Score should remain positive');
        assert.ok(decayed[0].score < 1.0, 'Old items should have reduced score');
    });

    test('should apply correct half-life decay', () => {
        const now = Date.now();
        const halfLifeDays = 7;
        const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;

        const results = [
            { id: 1, score: 1.0, content: 'week old', timestamp: new Date(now - halfLifeMs), projectId: 'p1', source: 'vector' },
        ];

        const decayed = applyRecencyDecay(results);

        // After one half-life, the recency portion (30%) should be halved
        // New score = 1.0 * (0.7 + 0.3 * 0.5) = 1.0 * 0.85 = 0.85
        const expectedScore = 0.85;
        assert.ok(Math.abs(decayed[0].score - expectedScore) < 0.01,
            `Score should be ~${expectedScore}, got ${decayed[0].score}`);
    });
});

describe('Time Formatting', () => {
    test('should format just now', () => {
        const now = new Date();
        assert.strictEqual(formatTimeAgo(now), 'just now');
    });

    test('should format minutes ago', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60000);
        assert.strictEqual(formatTimeAgo(fiveMinAgo), '5m ago');
    });

    test('should format hours ago', () => {
        const threeHoursAgo = new Date(Date.now() - 3 * 3600000);
        assert.strictEqual(formatTimeAgo(threeHoursAgo), '3h ago');
    });

    test('should format days ago', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
        assert.strictEqual(formatTimeAgo(twoDaysAgo), '2d ago');
    });

    test('should format old dates as locale string', () => {
        const oldDate = new Date(Date.now() - 30 * 86400000); // 30 days ago
        const formatted = formatTimeAgo(oldDate);
        assert.ok(!formatted.includes('ago'), 'Should use date format for old items');
    });

    test('should handle edge case of 59 minutes', () => {
        const fiftyNineMin = new Date(Date.now() - 59 * 60000);
        assert.strictEqual(formatTimeAgo(fiftyNineMin), '59m ago');
    });

    test('should handle edge case of 23 hours', () => {
        const twentyThreeHours = new Date(Date.now() - 23 * 3600000);
        assert.strictEqual(formatTimeAgo(twentyThreeHours), '23h ago');
    });
});

describe('Search Results Formatting', () => {
    test('should format empty results', () => {
        const formatted = formatSearchResults([]);
        assert.strictEqual(formatted, 'No matching memories found.');
    });

    test('should include result count', () => {
        const results = createMockResults(3);
        const formatted = formatSearchResults(results);
        assert.ok(formatted.includes('Found 3 matching memories'));
    });

    test('should include score percentage', () => {
        const results = [
            { id: 1, score: 0.95, content: 'test', timestamp: new Date(), projectId: 'p1', source: 'vector' },
        ];
        const formatted = formatSearchResults(results);
        assert.ok(formatted.includes('95%'), 'Should include score as percentage');
    });

    test('should include project ID', () => {
        const results = [
            { id: 1, score: 0.9, content: 'test', timestamp: new Date(), projectId: 'my-project', source: 'vector' },
        ];
        const formatted = formatSearchResults(results);
        assert.ok(formatted.includes('[my-project]'));
    });

    test('should show global for null project', () => {
        const results = [
            { id: 1, score: 0.9, content: 'test', timestamp: new Date(), projectId: null, source: 'vector' },
        ];
        const formatted = formatSearchResults(results);
        assert.ok(formatted.includes('[global]'));
    });

    test('should use correct source icons', () => {
        const results = [
            { id: 1, score: 0.9, content: 'vector', timestamp: new Date(), projectId: 'p1', source: 'vector' },
            { id: 2, score: 0.8, content: 'keyword', timestamp: new Date(), projectId: 'p1', source: 'keyword' },
            { id: 3, score: 0.7, content: 'hybrid', timestamp: new Date(), projectId: 'p1', source: 'hybrid' },
        ];
        const formatted = formatSearchResults(results);

        assert.ok(formatted.includes('🎯'), 'Should have vector icon');
        assert.ok(formatted.includes('🔤'), 'Should have keyword icon');
        assert.ok(formatted.includes('⚡'), 'Should have hybrid icon');
    });

    test('should truncate long content', () => {
        const longContent = 'x'.repeat(300);
        const results = [
            { id: 1, score: 0.9, content: longContent, timestamp: new Date(), projectId: 'p1', source: 'vector' },
        ];
        const formatted = formatSearchResults(results);

        assert.ok(formatted.includes('...'), 'Should truncate with ellipsis');
        assert.ok(!formatted.includes('x'.repeat(250)), 'Should not include full content');
    });
});

describe('Edge Cases', () => {
    test('should handle results with same scores', () => {
        const now = new Date();
        const results = [
            { id: 1, score: 0.8, content: 'a', timestamp: now, projectId: 'p1', source: 'vector' },
            { id: 2, score: 0.8, content: 'b', timestamp: now, projectId: 'p1', source: 'vector' },
        ];

        const decayed = applyRecencyDecay(results);

        assert.strictEqual(decayed.length, 2);
        assert.strictEqual(decayed[0].score, decayed[1].score);
    });

    test('should handle duplicate IDs in RRF correctly', () => {
        const vectorResults = [
            { id: 1, content: 'content', score: 0.9, timestamp: new Date(), projectId: 'p1' },
        ];
        const keywordResults = [
            { id: 1, content: 'content', score: 0.9, timestamp: new Date(), projectId: 'p1' },
        ];

        const combined = combineWithRRF(vectorResults, keywordResults);

        // Should have only one entry with combined score
        assert.strictEqual(combined.length, 1);
        assert.strictEqual(combined[0].source, 'hybrid');
    });

    test('should handle single result', () => {
        const results = [
            { id: 1, score: 0.9, content: 'only one', timestamp: new Date(), projectId: 'p1', source: 'vector' },
        ];

        const formatted = formatSearchResults(results);

        assert.ok(formatted.includes('Found 1 matching memories'));
        assert.ok(formatted.includes('only one'));
    });

    test('should handle results with special characters in content', () => {
        const results = [
            { id: 1, score: 0.9, content: 'Code: `const x = 1;` <script>alert("xss")</script>', timestamp: new Date(), projectId: 'p1', source: 'vector' },
        ];

        const formatted = formatSearchResults(results);

        assert.ok(formatted.includes('const x = 1'));
    });
});
