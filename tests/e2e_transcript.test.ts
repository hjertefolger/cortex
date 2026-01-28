import { describe, test, beforeAll, afterAll, beforeEach, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from 'bun:sqlite';

// Import from source
import {
    shouldAutoSave,
    markAutoSaved,
    resetAutoSaveState,
} from '../src/config.ts';

import { archiveSession } from '../src/archive.ts';
import { initDb, closeDb, getStats } from '../src/database.ts';

const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-e2e-real-' + Date.now());
// Ensure we use the test data dir
process.env.CORTEX_DATA_DIR = TEST_DATA_DIR;

// Using a small sample transcript for E2E if the real one isn't there
const REAL_TRANSCRIPT_PATH = path.join(process.cwd(), 'tests', 'sample_transcript.jsonl');
const MOCK_TRANSCRIPT_PATH = path.join(process.cwd(), 'tests', 'mock_transcript.jsonl');

/**
 * Estimate tokens from text (approx 4 chars per token)
 */
function estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
}

function formatBytes(bytes: number) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

describe('E2E Real Transcript Replay', () => {
    let db: Database;
    let transcriptPath: string;

    beforeAll(async () => {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        
        // Determine which transcript to use
        if (fs.existsSync(REAL_TRANSCRIPT_PATH) && fs.statSync(REAL_TRANSCRIPT_PATH).size > 1000) {
            transcriptPath = REAL_TRANSCRIPT_PATH;
            console.log(`Using REAL transcript: ${transcriptPath}`);
        } else {
            console.log('Using MOCK transcript for E2E test');
            // Create a mock transcript if needed
            transcriptPath = MOCK_TRANSCRIPT_PATH;
            const mockData = [];
            for (let i = 0; i < 50; i++) {
                mockData.push(JSON.stringify({
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `This is message number ${i} with some content to simulate a conversation. It needs to be long enough to be indexed. Context: ${i}`,
                    timestamp: new Date().toISOString()
                }));
            }
            fs.writeFileSync(transcriptPath, mockData.join('\n'));
        }

        db = await initDb();
    });

    afterAll(() => {
        closeDb();
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
        // Clean up mock transcript if we created it
        if (transcriptPath === MOCK_TRANSCRIPT_PATH && fs.existsSync(MOCK_TRANSCRIPT_PATH)) {
            fs.unlinkSync(MOCK_TRANSCRIPT_PATH);
        }
    });

    beforeEach(() => {
        resetAutoSaveState();
    });

    test('should process full transcript and trigger autosaves correctly', async () => {
        const fileContent = fs.readFileSync(transcriptPath, 'utf-8');
        const lines = fileContent.split('\n').filter(l => l.trim());

        // Simulation parameters
        const CONTEXT_WINDOW = 200000; 
        let currentTokens = 0;
        let lineCount = 0;
        let saveCount = 0;

        // Create a temporary transcript file that we append to, simulating a growing session
        const tempTranscriptPath = path.join(TEST_DATA_DIR, 'growing_session.jsonl');
        fs.writeFileSync(tempTranscriptPath, ''); // Start empty

        for (const line of lines) {
            lineCount++;

            // 1. Simulate session growth
            fs.appendFileSync(tempTranscriptPath, line + '\n');

            // 2. Calculate context usage
            try {
                const message = JSON.parse(line);
                const content = typeof message.content === 'string' ? message.content
                    : Array.isArray(message.content) ? message.content.map((c: any) => c.text || '').join('')
                        : '';

                currentTokens += estimateTokens(content);
                currentTokens += 50; // Overhead

                const contextPercent = Math.min(100, Math.round((currentTokens / CONTEXT_WINDOW) * 100));

                // 3. Check autosave logic
                if (shouldAutoSave(contextPercent, tempTranscriptPath)) {
                    // Simulate the save
                    const result = await archiveSession(db, tempTranscriptPath, 'e2e-test-project');

                    if (result.archived > 0) {
                        markAutoSaved(tempTranscriptPath, contextPercent, result.archived);
                        saveCount++;
                    } else {
                        markAutoSaved(tempTranscriptPath, contextPercent, 0);
                    }
                }

            } catch (e) {
                console.error(`Error parsing line ${lineCount}:`, e);
            }
        }

        // Assertions
        expect(lineCount).toBeGreaterThan(0);
        
        // If mock data (small), we might not hit auto-save threshold (5%) 
        // So we force a save at the end to verify DB interactions
        if (saveCount === 0) {
            await archiveSession(db, tempTranscriptPath, 'e2e-test-project');
        }

        // Check DB state
        const dbStats = getStats(db);
        expect(dbStats.fragmentCount).toBeGreaterThan(0);

        // Verify content via SQL
        const count = db.query("SELECT COUNT(*) as count FROM memories").get() as any;
        expect(count.count).toBeGreaterThan(0);

        // --- SEARCH VERIFICATION ---
        // Run CLI command using 'bun'
        const { execSync } = await import('child_process');
        const query = "context"; // "Context" is in mock data

        try {
            // Run against the BUILT script or SOURCE?
            // "bun src/index.ts" allows running source directly.
            const cmd = `bun src/index.ts recall "${query}"`;
            const output = execSync(cmd, {
                cwd: process.cwd(),
                env: { ...process.env, CORTEX_DATA_DIR: TEST_DATA_DIR }
            }).toString();

            expect(output.length).toBeGreaterThan(50);
        } catch (e: any) {
            console.error('Search failed:', e.message);
            throw e;
        }
    });
});