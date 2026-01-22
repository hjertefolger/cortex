
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// Import from the built bundle
import {
    shouldAutoSave,
    markAutoSaved,
    resetAutoSaveState,
    archiveSession, // We will test the full archive process
    initDb,
    closeDb,
    hybridSearch
} from '../dist/index.js';

const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-e2e-real-' + Date.now());
// Ensure we use the test data dir
process.env.CORTEX_DATA_DIR = TEST_DATA_DIR;

const TRANSCRIPT_PATH = path.join(process.cwd(), 'tests', 'sample_transcript.jsonl');

/**
 * Estimate tokens from text (approx 4 chars per token)
 */
function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}

describe('E2E Real Transcript Replay', async () => {
    let db;

    // Skip if transcript is missing or is the placeholder
    if (!fs.existsSync(TRANSCRIPT_PATH)) {
        console.log('⚠️ Skipping E2E test: tests/sample_transcript.jsonl not found');
        return;
    }

    const stats = fs.statSync(TRANSCRIPT_PATH);
    if (stats.size < 1000) {
        console.log(`⚠️ Skipping E2E test: tests/sample_transcript.jsonl appears to be a placeholder (${stats.size} bytes)`);
        return;
    }

    before(async () => {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        db = await initDb();
    });

    after(() => {
        closeDb();
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        resetAutoSaveState();
    });

    test('should process full transcript and trigger autosaves correctly', async (t) => {
        console.log(`\n📄 Processing real transcript: ${formatBytes(stats.size)}`);

        const fileStream = fs.createReadStream(TRANSCRIPT_PATH);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        // Simulation parameters
        const CONTEXT_WINDOW = 200000; // Assume 200k context window
        let currentTokens = 0;
        let lineCount = 0;
        let saveCount = 0;
        let lastSavePercent = 0;

        // Create a temporary transcript file that we append to, simulating a growing session
        const tempTranscriptPath = path.join(TEST_DATA_DIR, 'growing_session.jsonl');
        fs.writeFileSync(tempTranscriptPath, ''); // Start empty

        for await (const line of rl) {
            lineCount++;

            // 1. Simulate session growth
            fs.appendFileSync(tempTranscriptPath, line + '\n');

            // 2. Calculate context usage
            try {
                const message = JSON.parse(line);
                const content = typeof message.content === 'string' ? message.content
                    : Array.isArray(message.content) ? message.content.map(c => c.text || '').join('')
                        : '';

                currentTokens += estimateTokens(content);

                // Add overhead for message structure
                currentTokens += 50;

                const contextPercent = Math.min(100, Math.round((currentTokens / CONTEXT_WINDOW) * 100));

                // 3. Check autosave logic
                if (shouldAutoSave(contextPercent, tempTranscriptPath)) {
                    // Simulate the save
                    process.stdout.write(`\r   save triggered at ${contextPercent}% (Line ${lineCount})...`);

                    const result = await archiveSession(db, tempTranscriptPath, 'e2e-test-project');

                    if (result.archived > 0) {
                        markAutoSaved(tempTranscriptPath, contextPercent, result.archived);
                        saveCount++;
                        lastSavePercent = contextPercent;
                        process.stdout.write(` ✓ Saved ${result.archived} fragments\n`);
                    } else {
                        // Mark as saved even if 0 to prevent loops
                        markAutoSaved(tempTranscriptPath, contextPercent, 0);
                    }
                }

                // Periodic status update
                if (lineCount % 100 === 0) {
                    process.stdout.write(`\r   Processing line ${lineCount} (${contextPercent}% context)...`);
                }

            } catch (e) {
                console.error(`Error parsing line ${lineCount}:`, e.message);
            }
        }

        console.log(`\n\n✅ Replay complete!`);
        console.log(`- Total Lines: ${lineCount}`);
        console.log(`- Final Context: ${Math.round((currentTokens / CONTEXT_WINDOW) * 100)}%`);
        console.log(`- Autosaves Triggered: ${saveCount}`);

        assert.ok(saveCount > 0, 'Should have triggered at least one autosave for a real transcript');

        // Check DB state
        const dbStats = db.exec("SELECT COUNT(*) as count FROM memories")[0].values[0][0];
        const dbCharCount = db.exec("SELECT SUM(LENGTH(content)) as chars FROM memories")[0].values[0][0] || 0;

        console.log(`- Total Memories stored: ${dbStats}`);
        console.log(`- Total Content stored: ${formatBytes(dbCharCount)}`);

        assert.ok(dbStats > 0, 'Database should contain memories');

        // --- SEARCH VERIFICATION (Real Data Recall) ---
        console.log('\n--- SEARCH VERIFICATION (Real Data Recall) ---');
        // Import query embedding for test
        const { embedQuery } = await import('../dist/index.js').then(m => ({ embedQuery: m.embedQuery })).catch(() => ({ embedQuery: null }));
        // Note: hybridSearch needs embedding param or we rely on internal logic?
        // hybridSearch signature: (db, queryVector, projectId, limit, keywordQuery)

        // We need to generate embedding for the query.
        // We can't access `embedQuery` easily unless exported.
        // Let's check imports. src/index.ts DOES NOT EXPORT embedQuery!
        // It exports `hybridSearch`.

        // Wait, hybridSearch requires `queryVector`.
        // If I can't generate it (no embedQuery exported), I can't test hybridSearch fully.
        // I can test `searchByVector` if I mock the vector? No.

        // I MUST export `embedQuery` from index.ts or import it from src/embeddings.ts (but that's TS and this is JS test running against dist).

        // Solution: Import from `dist/index.js` IF it exports it?
        // Check 1178: NO embedQuery in exports.

        // FAST FIX: Use `exec` to run the CLI `recall` command?
        // "node dist/index.js recall 'Zod'"
        // This exercises everything end-to-end.

        // I'll do that instead of code integration. It's safer and tests the CLI entry point.

        const { execSync } = await import('child_process');

        const searchQueries = [
            "production readiness",
            "architecture",
            "error handling",
            "database schema"
        ];

        for (const query of searchQueries) {
            console.log(`\n🔎 Searching for: "${query}"`);
            // We need to pass the temporary DB path?
            // The CLI uses loadConfig() -> overrides?
            // The CLI logic for `recall` uses `initDb` which loads from `~/.cortex/memory.db`.
            // Our test DB is in `TEST_DATA_DIR`.
            // Cortex respects `process.env.CORTEX_DATA_DIR`.
            // We set it on line 21!

            try {
                const cmd = `node dist/index.js recall "${query}"`;
                const output = execSync(cmd, {
                    cwd: process.cwd(),
                    env: { ...process.env, CORTEX_DATA_DIR: TEST_DATA_DIR }
                }).toString();

                console.log(output.substring(0, 300) + '...');
                assert.ok(output.includes(query) || output.includes('Found'), 'Search should return results');
                // Basic check: Output shouldn't be empty
                assert.ok(output.length > 50, 'Search output should be substantial');
            } catch (e) {
                console.error('Search failed:', e.message);
                throw e;
            }
        }


        // Capture samples for analysis
        console.log('\n--- SAMPLE MEMORIES (Verification of Content & Readability) ---');
        const samples = db.exec("SELECT content FROM memories ORDER BY random() LIMIT 5")[0].values.map(v => v[0]);
        samples.forEach((s, i) => {
            console.log(`\n[Sample ${i + 1}]`);
            console.log(s.substring(0, 300) + (s.length > 300 ? '...' : ''));
        });
    });
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
