
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readStdinWithResult, getContextPercent, getProjectId, formatDuration } from '../dist/index.js';

describe('Stdin Module', () => {
    describe('readStdinWithResult', () => {
        let originalStdin;

        beforeEach(() => {
            originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
        });

        afterEach(() => {
            if (originalStdin) {
                Object.defineProperty(process, 'stdin', originalStdin);
            }
        });

        it('should return error if stdin is TTY', async () => {
            const stdinMock = {
                isTTY: true,
                setEncoding: () => { },
                [Symbol.asyncIterator]: async function* () { }
            };
            Object.defineProperty(process, 'stdin', { value: stdinMock, configurable: true });

            const result = await readStdinWithResult();
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error.type, 'tty');
        });

        it('should return error if stdin is empty', async () => {
            const stdinMock = {
                isTTY: false,
                setEncoding: () => { },
                [Symbol.asyncIterator]: async function* () {
                    yield '   ';
                }
            };
            Object.defineProperty(process, 'stdin', { value: stdinMock, configurable: true });

            const result = await readStdinWithResult();
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error.type, 'empty');
        });

        it('should parse valid JSON', async () => {
            const data = {
                context_window: {
                    current_usage: {
                        input_tokens: 100
                    }
                }
            };
            const stdinMock = {
                isTTY: false,
                setEncoding: () => { },
                [Symbol.asyncIterator]: async function* () {
                    yield JSON.stringify(data);
                }
            };
            Object.defineProperty(process, 'stdin', { value: stdinMock, configurable: true });

            const result = await readStdinWithResult();
            assert.strictEqual(result.success, true);
            assert.deepStrictEqual(result.data, data);
        });

        it('should handle split chunks', async () => {
            const data = { test: 123 };
            const json = JSON.stringify(data);
            const part1 = json.substring(0, 5);
            const part2 = json.substring(5);

            const stdinMock = {
                isTTY: false,
                setEncoding: () => { },
                [Symbol.asyncIterator]: async function* () {
                    yield part1;
                    yield part2;
                }
            };
            Object.defineProperty(process, 'stdin', { value: stdinMock, configurable: true });

            const result = await readStdinWithResult();
            assert.strictEqual(result.success, true);
            assert.deepStrictEqual(result.data, data);
        });

        it('should return error on invalid JSON', async () => {
            const stdinMock = {
                isTTY: false,
                setEncoding: () => { },
                [Symbol.asyncIterator]: async function* () {
                    yield '{ invalid json ';
                }
            };
            Object.defineProperty(process, 'stdin', { value: stdinMock, configurable: true });

            const result = await readStdinWithResult();
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error.type, 'parse_error');
        });
    });

    describe('getContextPercent', () => {
        it('should use native percentage if available', () => {
            const data = {
                context_window: {
                    used_percentage: 45.6,
                    current_usage: { input_tokens: 100 },
                    context_window_size: 1000
                }
            };
            assert.strictEqual(getContextPercent(data), 46);
        });

        it('should clamp native percentage', () => {
            const data = {
                context_window: {
                    used_percentage: 105,
                }
            };
            assert.strictEqual(getContextPercent(data), 100);
        });

        it('should fallback to manual calculation', () => {
            const data = {
                context_window: {
                    context_window_size: 1000,
                    current_usage: {
                        input_tokens: 250,
                        cache_creation_input_tokens: 250,
                        cache_read_input_tokens: 0
                    }
                }
            };
            assert.strictEqual(getContextPercent(data), 50);
        });

        it('should return 0 if no size info', () => {
            const data = { context_window: {} };
            assert.strictEqual(getContextPercent(data), 0);
        });
    });

    describe('getProjectId', () => {
        it('should extract project id from path', () => {
            assert.strictEqual(getProjectId('/Users/dev/project-alpha'), 'project-alpha');
        });

        it('should handle windows paths', () => {
            assert.strictEqual(getProjectId('C:\\Users\\dev\\project-beta'), 'project-beta');
        });

        it('should return unknown for empty path', () => {
            assert.strictEqual(getProjectId(undefined), 'unknown');
        });

        it('should return unknown for root path', () => {
            assert.strictEqual(getProjectId('/'), 'unknown');
        });
    });

    describe('formatDuration', () => {
        it('should format just now', () => {
            const date = new Date();
            assert.strictEqual(formatDuration(date), 'now');
        });

        it('should format minutes ago', () => {
            const date = new Date(Date.now() - 5 * 60000); // 5 mins ago
            assert.strictEqual(formatDuration(date), '5m ago');
        });

        it('should format hours ago', () => {
            const date = new Date(Date.now() - 2 * 3600000); // 2 hours ago
            assert.strictEqual(formatDuration(date), '2h ago');
        });

        it('should format days ago', () => {
            const date = new Date(Date.now() - 3 * 86400000); // 3 days ago
            assert.strictEqual(formatDuration(date), '3d ago');
        });

        it('should format date string for old dates', () => {
            const date = new Date(Date.now() - 10 * 86400000); // 10 days ago
            // The implementation uses toLocaleDateString(), so output depends on locale.
            // We just check it's not a relative time string.
            const result = formatDuration(date);
            assert.ok(!result.includes('ago'));
            assert.ok(!result.includes('now'));
        });
    });
});
