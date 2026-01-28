
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Set env var BEFORE importing if top-level code used it, 
// but config.ts uses it lazily so we can set it here or in before()
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-autosave-test-' + Date.now());
process.env.CORTEX_DATA_DIR = TEST_DATA_DIR;

// Import from the built bundle which now exports these helpers
import { shouldAutoSave, markAutoSaved, resetAutoSaveState, loadAutoSaveState } from '../dist/index.js';

describe('Autosave Logic', () => {
    const transcriptPath = '/tmp/test-transcript.json';

    before(() => {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    });

    after(() => {
        if (fs.existsSync(TEST_DATA_DIR)) {
            fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        // Clear any state file
        const statePath = path.join(TEST_DATA_DIR, 'auto-save-state.json');
        if (fs.existsSync(statePath)) {
            fs.unlinkSync(statePath);
        }
        resetAutoSaveState();
    });

    test('should trigger save on first significant context usage (new session)', () => {
        // Default Step is 5%
        // If we jump straight to 10%, it should save
        const result = shouldAutoSave(10, transcriptPath);
        assert.strictEqual(result, true, 'Should save at 10% for new session');
    });

    test('should NOT trigger save for insignificant context usage (new session)', () => {
        // If we are at 2% (below 5% step), should not save yet?
        // Actually logic is: return currentContext >= step
        const result = shouldAutoSave(2, transcriptPath);
        assert.strictEqual(result, false, 'Should not save at 2% (below 5% step)');
    });

    test('should trigger save when step threshold is crossed', () => {
        // 1. Initial State: Saved at 10%
        markAutoSaved(transcriptPath, 10, 50);

        // 2. Current is 12% (+2%), should NOT save
        assert.strictEqual(shouldAutoSave(12, transcriptPath), false, 'Should not save at +2%');

        // 3. Current is 14% (+4%), should NOT save
        assert.strictEqual(shouldAutoSave(14, transcriptPath), false, 'Should not save at +4%');

        // 4. Current is 15% (+5%), SHOULD save
        assert.strictEqual(shouldAutoSave(15, transcriptPath), true, 'Should save at +5%');
    });

    test('should trigger save when jumping multiple steps', () => {
        // 1. Initial State: Saved at 10%
        markAutoSaved(transcriptPath, 10, 50);

        // 2. Sudden jump to 25% (+15%)
        assert.strictEqual(shouldAutoSave(25, transcriptPath), true, 'Should save at +15%');
    });

    test('should interact correctly with state persistence', () => {
        // 1. Mark saved at 20%
        markAutoSaved(transcriptPath, 20, 100);

        // 2. Verify state on disk
        const state = loadAutoSaveState();
        assert.strictEqual(state.lastSaveContext, 20);
        assert.strictEqual(state.transcriptPath, transcriptPath);

        // 3. Check logic against loaded state
        // 20% -> 24% (diff 4) -> No
        assert.strictEqual(shouldAutoSave(24, transcriptPath), false);
        // 20% -> 25% (diff 5) -> Yes
        assert.strictEqual(shouldAutoSave(25, transcriptPath), true);
    });

    test('should reset state for new transcript path', () => {
        // 1. Old session saved at 50%
        markAutoSaved('/tmp/old-transcript.json', 50, 100);

        // 2. New session starts at 10%
        // shouldAutoSave checks: state.transcriptPath !== newPath
        // So it treats it as fresh session. 10% >= 5% step -> True
        const result = shouldAutoSave(10, transcriptPath);
        assert.strictEqual(result, true, 'Should treat new path as new session and save');
    });
});
