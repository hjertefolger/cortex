/**
 * Cortex Archive Module Tests
 * Tests transcript parsing, content filtering, chunking, and insights extraction
 */

import { test, describe, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-archive-test-' + Date.now());

// ============================================================================
// Content Filtering Implementation (mirroring archive.ts)
// ============================================================================

const EXCLUDED_PATTERNS = [
    /^(ok|okay|done|yes|no|sure|thanks|thank you|got it|understood|alright)\.?$/i,
    /^(hello|hi|hey|bye|goodbye)\.?$/i,
    /^y(es)?$/i,
    /^n(o)?$/i,
    /^\d+$/,
    /^[.!?]+$/,
];

const VALUABLE_PATTERNS = [
    /decision:\s*/i,
    /we (decided|chose|agreed)/i,
    /architecture|design pattern/i,
    /bug|issue|error|fix/i,
    /implemented|created|added/i,
    /configuration|setting/i,
    /api|endpoint|route/i,
    /database|schema|migration/i,
    /function\s+\w+/i,
    /class\s+\w+/i,
    /should|must|need to/i,
    /however|although|while/i,
];

function shouldExclude(content) {
    const trimmed = content.trim();

    if (trimmed.length < 20) {
        return EXCLUDED_PATTERNS.some(p => p.test(trimmed));
    }

    return false;
}

function getContentValue(content) {
    const trimmed = content.trim();

    if (trimmed.length < 30) return 0;

    let score = 0;
    for (const pattern of VALUABLE_PATTERNS) {
        if (pattern.test(trimmed)) {
            score++;
        }
    }

    if (score >= 3) return 2; // High value
    if (score >= 1) return 1; // Standard value
    if (trimmed.length > 100) return 1; // Longer content is likely valuable

    return 0;
}

function isValuable(content) {
    return getContentValue(content) > 0;
}

// ============================================================================
// Chunking Implementation (mirroring archive.ts)
// ============================================================================

const OPTIMAL_CHUNK_SIZE = 400;
const MAX_CHUNK_SIZE = 600;
const MIN_CHUNK_SIZE = 50;

function extractChunks(content, role = 'assistant') {
    const chunks = [];
    const trimmed = content.trim();

    if (!trimmed || shouldExclude(trimmed)) {
        return [];
    }

    // Split by paragraphs/sections
    const paragraphs = trimmed.split(/\n\n+/);

    let currentChunk = '';

    for (const para of paragraphs) {
        const cleanPara = para.trim();

        if (!cleanPara || shouldExclude(cleanPara)) {
            continue;
        }

        // If adding this paragraph would exceed max chunk size, save current and start new
        if (currentChunk && (currentChunk.length + cleanPara.length + 2) > MAX_CHUNK_SIZE) {
            if (currentChunk.length >= MIN_CHUNK_SIZE) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = cleanPara;
        } else {
            currentChunk = currentChunk ? currentChunk + '\n\n' + cleanPara : cleanPara;
        }

        // If current chunk is at optimal size, save it
        if (currentChunk.length >= OPTIMAL_CHUNK_SIZE) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
    }

    // Don't forget the last chunk
    if (currentChunk && currentChunk.length >= MIN_CHUNK_SIZE) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

// ============================================================================
// Session Insights Extraction (mirroring archive.ts)
// ============================================================================

const DECISION_PATTERNS = [
    /(?:decided to|chose to|will use|going with)\s+(.{20,150})/gi,
    /decision:?\s*(.{20,150})/gi,
    /(?:we'll|let's|I'll)\s+(.{20,100})/gi,
];

const OUTCOME_PATTERNS = [
    /(?:completed|finished|implemented|fixed|resolved)\s+(.{20,150})/gi,
    /(?:now works|working now|is ready|done with)\s+(.{10,100})/gi,
    /successfully\s+(.{20,100})/gi,
];

const BLOCKER_PATTERNS = [
    /(?:blocked by|stuck on|can't|cannot|unable to)\s+(.{20,150})/gi,
    /(?:error|issue|problem|bug)(?::|was|is)\s+(.{20,150})/gi,
];

function extractSessionInsights(messages) {
    const decisions = new Set();
    const outcomes = new Set();
    const blockers = new Set();

    for (const msg of messages) {
        const content = msg.content;

        // Extract decisions
        for (const pattern of DECISION_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const extracted = match[1].trim().replace(/[.!,]$/, '');
                if (extracted.length >= 20) {
                    decisions.add(extracted);
                }
            }
        }

        // Extract outcomes
        for (const pattern of OUTCOME_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const extracted = match[1].trim().replace(/[.!,]$/, '');
                if (extracted.length >= 10) {
                    outcomes.add(extracted);
                }
            }
        }

        // Extract blockers
        for (const pattern of BLOCKER_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const extracted = match[1].trim().replace(/[.!,]$/, '');
                if (extracted.length >= 20) {
                    blockers.add(extracted);
                }
            }
        }
    }

    // Create summary
    const summaryParts = [];
    if (decisions.size > 0) {
        summaryParts.push(`Decisions: ${Array.from(decisions).slice(0, 3).join('; ')}`);
    }
    if (outcomes.size > 0) {
        summaryParts.push(`Outcomes: ${Array.from(outcomes).slice(0, 3).join('; ')}`);
    }

    return {
        decisions: Array.from(decisions),
        outcomes: Array.from(outcomes),
        blockers: Array.from(blockers),
        summary: summaryParts.join('. ') || 'Session completed.',
    };
}

// ============================================================================
// JSONL Parsing (mirroring archive.ts)
// ============================================================================

function parseJsonlLine(line) {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
}

function extractTextContent(content) {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map(item => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && item.text) return item.text;
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }

    if (content && typeof content === 'object' && content.text) {
        return content.text;
    }

    return '';
}

function getSessionId(transcriptPath) {
    const basename = path.basename(transcriptPath, '.jsonl');
    return basename.replace(/^session-/, '');
}

// ============================================================================
// Tests
// ============================================================================

describe('Archive Module', () => {
    before(() => {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    });

    after(() => {
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
    });

    describe('Content Filtering', () => {
        describe('shouldExclude', () => {
            test('should exclude simple acknowledgments', () => {
                assert.strictEqual(shouldExclude('ok'), true);
                assert.strictEqual(shouldExclude('Ok'), true);
                assert.strictEqual(shouldExclude('OK'), true);
                assert.strictEqual(shouldExclude('okay'), true);
                assert.strictEqual(shouldExclude('done'), true);
                assert.strictEqual(shouldExclude('yes'), true);
                assert.strictEqual(shouldExclude('no'), true);
                assert.strictEqual(shouldExclude('sure'), true);
                assert.strictEqual(shouldExclude('thanks'), true);
                assert.strictEqual(shouldExclude('thank you'), true);
            });

            test('should exclude greetings', () => {
                assert.strictEqual(shouldExclude('hello'), true);
                assert.strictEqual(shouldExclude('hi'), true);
                assert.strictEqual(shouldExclude('hey'), true);
                assert.strictEqual(shouldExclude('bye'), true);
            });

            test('should exclude just numbers', () => {
                assert.strictEqual(shouldExclude('123'), true);
                assert.strictEqual(shouldExclude('42'), true);
            });

            test('should exclude just punctuation', () => {
                assert.strictEqual(shouldExclude('...'), true);
                assert.strictEqual(shouldExclude('!'), true);
                assert.strictEqual(shouldExclude('???'), true);
            });

            test('should NOT exclude meaningful short content', () => {
                assert.strictEqual(shouldExclude('This is valuable'), false);
                assert.strictEqual(shouldExclude('Fix the bug now'), false);
            });

            test('should NOT exclude longer content', () => {
                const longContent = 'This is a longer piece of content that should not be excluded because it contains valuable information.';
                assert.strictEqual(shouldExclude(longContent), false);
            });

            test('should handle whitespace', () => {
                assert.strictEqual(shouldExclude('  ok  '), true);
                assert.strictEqual(shouldExclude('\tok\n'), true);
            });
        });

        describe('getContentValue', () => {
            test('should return 0 for short content', () => {
                assert.strictEqual(getContentValue('short'), 0);
                assert.strictEqual(getContentValue('tiny text'), 0);
            });

            test('should return 1 for content with valuable keywords', () => {
                const value = getContentValue('We implemented the new authentication system with JWT tokens.');
                assert.ok(value >= 1);
            });

            test('should return 2 for content with multiple valuable keywords', () => {
                const value = getContentValue('We decided to implement the database schema with a migration that fixes the bug.');
                assert.strictEqual(value, 2);
            });

            test('should return 1 for long content without keywords', () => {
                const longContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
                assert.strictEqual(getContentValue(longContent), 1);
            });

            test('should detect architectural content', () => {
                const value = getContentValue('The architecture design pattern uses a layered approach.');
                assert.ok(value >= 1);
            });

            test('should detect code-related content', () => {
                const value = getContentValue('The function processData handles the API endpoint routing.');
                assert.ok(value >= 1);
            });
        });

        describe('isValuable', () => {
            test('should return true for valuable content', () => {
                assert.strictEqual(isValuable('We decided to use PostgreSQL for the database.'), true);
            });

            test('should return false for non-valuable content', () => {
                assert.strictEqual(isValuable('ok'), false);
                assert.strictEqual(isValuable(''), false);
            });
        });
    });

    describe('Chunking', () => {
        test('should return empty array for empty content', () => {
            const chunks = extractChunks('');
            assert.deepStrictEqual(chunks, []);
        });

        test('should return empty array for excluded content', () => {
            const chunks = extractChunks('ok');
            assert.deepStrictEqual(chunks, []);
        });

        test('should extract single chunk for short content', () => {
            const content = 'This is a meaningful piece of content that describes an implementation decision about the database schema.';
            const chunks = extractChunks(content);

            assert.strictEqual(chunks.length, 1);
            assert.ok(chunks[0].includes('meaningful'));
        });

        test('should split long content into multiple chunks', () => {
            const longContent = Array(10).fill(
                'This is a paragraph of meaningful content about software development and architecture decisions.'
            ).join('\n\n');

            const chunks = extractChunks(longContent);

            assert.ok(chunks.length > 1, 'Should create multiple chunks');
        });

        test('should respect maximum chunk size', () => {
            const longContent = Array(10).fill(
                'This is a paragraph of meaningful content about software development.'
            ).join('\n\n');

            const chunks = extractChunks(longContent);

            for (const chunk of chunks) {
                assert.ok(chunk.length <= MAX_CHUNK_SIZE + 50, // Some tolerance for edge cases
                    `Chunk too long: ${chunk.length} chars`);
            }
        });

        test('should filter out excluded paragraphs', () => {
            const content = 'This is valuable content.\n\nok\n\nMore valuable content here.';
            const chunks = extractChunks(content);

            for (const chunk of chunks) {
                assert.ok(!chunk.match(/^ok$/m), 'Should not contain excluded content');
            }
        });

        test('should preserve paragraph structure', () => {
            const content = 'First paragraph with content.\n\nSecond paragraph with more content.';
            const chunks = extractChunks(content);

            // Should have coherent chunks
            assert.ok(chunks.length >= 1);
        });

        test('should handle code blocks', () => {
            const content = 'Here is some code:\n\n```javascript\nfunction test() {\n  return true;\n}\n```\n\nAnd explanation.';
            const chunks = extractChunks(content);

            assert.ok(chunks.length >= 1);
        });
    });

    describe('Session Insights Extraction', () => {
        test('should extract decisions', () => {
            const messages = [
                { content: 'We decided to use React for the frontend.' },
                { content: 'Going with PostgreSQL for the database.' },
            ];

            const insights = extractSessionInsights(messages);

            assert.ok(insights.decisions.length >= 1, 'Should find at least one decision');
        });

        test('should extract outcomes', () => {
            const messages = [
                { content: 'Successfully implemented the authentication system.' },
                { content: 'Fixed the login bug that was blocking users.' },
            ];

            const insights = extractSessionInsights(messages);

            assert.ok(insights.outcomes.length >= 1, 'Should find at least one outcome');
        });

        test('should extract blockers', () => {
            const messages = [
                { content: "We're stuck on the OAuth configuration issue." },
                { content: "Can't deploy because of the SSL certificate error." },
            ];

            const insights = extractSessionInsights(messages);

            assert.ok(insights.blockers.length >= 1, 'Should find at least one blocker');
        });

        test('should generate summary', () => {
            const messages = [
                { content: 'We decided to use TypeScript for type safety.' },
                { content: 'Successfully completed the API refactoring.' },
            ];

            const insights = extractSessionInsights(messages);

            assert.ok(insights.summary.length > 0, 'Should have a summary');
            assert.ok(insights.summary !== 'Session completed.', 'Should have meaningful summary');
        });

        test('should handle empty messages', () => {
            const insights = extractSessionInsights([]);

            assert.deepStrictEqual(insights.decisions, []);
            assert.deepStrictEqual(insights.outcomes, []);
            assert.deepStrictEqual(insights.blockers, []);
            assert.strictEqual(insights.summary, 'Session completed.');
        });

        test('should deduplicate similar extractions', () => {
            const messages = [
                { content: 'We decided to use React.' },
                { content: 'We decided to use React.' },
                { content: 'We decided to use React.' },
            ];

            const insights = extractSessionInsights(messages);

            // Using Set internally should deduplicate
            assert.ok(insights.decisions.length <= 1);
        });
    });

    describe('JSONL Parsing', () => {
        test('should parse valid JSON line', () => {
            const result = parseJsonlLine('{"role": "user", "content": "hello"}');

            assert.deepStrictEqual(result, { role: 'user', content: 'hello' });
        });

        test('should return null for invalid JSON', () => {
            const result = parseJsonlLine('not valid json {{{');

            assert.strictEqual(result, null);
        });

        test('should handle empty line', () => {
            const result = parseJsonlLine('');

            assert.strictEqual(result, null);
        });
    });

    describe('Text Content Extraction', () => {
        test('should extract string content', () => {
            const result = extractTextContent('simple string');

            assert.strictEqual(result, 'simple string');
        });

        test('should extract from array of strings', () => {
            const result = extractTextContent(['part 1', 'part 2']);

            assert.strictEqual(result, 'part 1\npart 2');
        });

        test('should extract from array of objects with text', () => {
            const result = extractTextContent([{ text: 'text 1' }, { text: 'text 2' }]);

            assert.strictEqual(result, 'text 1\ntext 2');
        });

        test('should extract from object with text property', () => {
            const result = extractTextContent({ text: 'object text' });

            assert.strictEqual(result, 'object text');
        });

        test('should return empty string for null/undefined', () => {
            assert.strictEqual(extractTextContent(null), '');
            assert.strictEqual(extractTextContent(undefined), '');
        });

        test('should handle mixed array content', () => {
            const result = extractTextContent(['string', { text: 'object' }, null, { other: 'ignored' }]);

            assert.ok(result.includes('string'));
            assert.ok(result.includes('object'));
        });
    });

    describe('Session ID Extraction', () => {
        test('should extract session ID from path', () => {
            const result = getSessionId('/path/to/session-abc123.jsonl');

            assert.strictEqual(result, 'abc123');
        });

        test('should handle path without session- prefix', () => {
            const result = getSessionId('/path/to/transcript.jsonl');

            assert.strictEqual(result, 'transcript');
        });

        test('should handle complex session IDs', () => {
            const result = getSessionId('/path/to/session-2024-01-15-abc123.jsonl');

            assert.strictEqual(result, '2024-01-15-abc123');
        });
    });

    describe('Edge Cases', () => {
        test('should handle very long single paragraph', () => {
            const veryLong = 'This is valuable content. '.repeat(100);
            const chunks = extractChunks(veryLong);

            // Long single paragraph stays as one chunk (splits by \n\n only)
            assert.ok(chunks.length >= 1, 'Should produce at least one chunk');
        });

        test('should handle content with only whitespace paragraphs', () => {
            const content = 'This is longer valuable content that meets min size.\n\n   \n\n\t\n\nMore valuable content here that also meets the minimum size.';
            const chunks = extractChunks(content);

            // Should filter out whitespace-only paragraphs and combine valid ones
            assert.ok(chunks.length >= 1, 'Should produce at least one chunk');
        });

        test('should handle unicode content', () => {
            const content = 'We decided to implement 国际化 internationalization support. The API endpoint handles 日本語 text.';
            const chunks = extractChunks(content);

            assert.ok(chunks.length >= 1);
            assert.ok(chunks[0].includes('国际化'));
        });

        test('should handle markdown content', () => {
            const content = `# Header

This is a **bold** statement about the _architecture_.

- Item 1
- Item 2

## Subheader

More content with \`inline code\` and decisions.`;

            const chunks = extractChunks(content);

            assert.ok(chunks.length >= 1);
        });

        test('should handle mixed valuable and non-valuable content', () => {
            const messages = [
                { content: 'ok' },
                { content: 'We decided to use microservices architecture for better scalability.' },
                { content: 'yes' },
                { content: 'Successfully implemented the payment gateway integration.' },
                { content: 'thanks' },
            ];

            const insights = extractSessionInsights(messages);

            assert.ok(insights.decisions.length >= 1 || insights.outcomes.length >= 1);
        });
    });
});
