/**
 * Cortex Setup Module Tests
 * Tests statusline configuration behavior during setup
 */

import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import the actual production functions from compiled output
import { configureClaudeStatusline, buildCortexStatuslineCommand } from '../dist/index.js';

// Test data directory - isolated from production
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-setup-test-' + Date.now());
const TEST_CLAUDE_DIR = path.join(TEST_DATA_DIR, '.claude');
const TEST_CLAUDE_SETTINGS_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json');

describe('Statusline Configuration', () => {
  before(() => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean settings file between tests
    if (fs.existsSync(TEST_CLAUDE_SETTINGS_PATH)) {
      fs.unlinkSync(TEST_CLAUDE_SETTINGS_PATH);
    }
  });

  test('configures statusline when no existing statusline exists', () => {
    // Given: Empty settings file
    const existingSettings = { someOtherSetting: true };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is configured
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(pluginRoot)
    });
    // Other settings are preserved
    assert.strictEqual(savedSettings.someOtherSetting, true);
  });

  test('configures statusline when settings file does not exist', () => {
    // Given: No settings file exists
    assert.ok(!fs.existsSync(TEST_CLAUDE_SETTINGS_PATH));

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is configured
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(pluginRoot)
    });
  });

  test('skips statusline configuration when different statusline already exists', () => {
    // Given: Settings file with a different statusline
    const existingStatusline = {
      type: 'command',
      command: 'my-custom-statusline --fancy'
    };
    const existingSettings = {
      someOtherSetting: true,
      statusLine: existingStatusline
    };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is NOT overwritten
    assert.strictEqual(result.configured, false);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.existingCommand, 'my-custom-statusline --fancy');

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, existingStatusline);
    // Other settings are preserved
    assert.strictEqual(savedSettings.someOtherSetting, true);
  });

  test('updates statusline when existing statusline is already Cortex', () => {
    // Given: Settings file with Cortex statusline (possibly outdated path)
    const oldPluginRoot = '/old/path/to/cortex';
    const existingSettings = {
      statusLine: {
        type: 'command',
        command: buildCortexStatuslineCommand(oldPluginRoot)
      }
    };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called with new path
    const newPluginRoot = '/new/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, newPluginRoot);

    // Then: Statusline is updated (not skipped)
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(newPluginRoot)
    });
  });

  test('force flag overrides existing statusline', () => {
    // Given: Settings file with a different statusline
    const existingStatusline = {
      type: 'command',
      command: 'my-custom-statusline --fancy'
    };
    const existingSettings = { statusLine: existingStatusline };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called with force=true
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot, { force: true });

    // Then: Statusline IS overwritten
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(pluginRoot)
    });
  });

  test('handles corrupted settings file gracefully', () => {
    // Given: Invalid JSON in settings file
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, 'not valid json {{{', 'utf8');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is configured (fresh start)
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(pluginRoot)
    });
  });

  test('detects Cortex statusline by index.js statusline pattern', () => {
    // Given: Settings file with Cortex statusline using different node path
    const existingSettings = {
      statusLine: {
        type: 'command',
        command: '/usr/local/bin/node /some/other/path/cortex/dist/index.js statusline'
      }
    };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is updated (recognized as Cortex)
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);
  });

  test('preserves existing settings when skipping statusline', () => {
    // Given: Settings file with various settings and a different statusline
    const existingSettings = {
      model: 'opus',
      statusLine: {
        type: 'command',
        command: 'my-custom-statusline'
      },
      permissions: { allow: ['read'] }
    };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called (and skips)
    const pluginRoot = '/path/to/cortex';
    configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: All settings are preserved exactly
    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings, existingSettings);
  });

  test('creates parent directories if they do not exist', () => {
    // Given: A path where parent directories do not exist
    const nestedPath = path.join(TEST_DATA_DIR, 'nested', 'deep', '.claude', 'settings.json');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(nestedPath, pluginRoot);

    // Then: Statusline is configured and directories are created
    assert.strictEqual(result.configured, true);
    assert.ok(fs.existsSync(nestedPath));
  });

  test('configures statusline when statusLine object exists but has no command', () => {
    // Given: Settings file with empty statusLine object
    const existingSettings = {
      someOtherSetting: true,
      statusLine: {}
    };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is configured (empty statusLine object is treated as no statusline)
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(pluginRoot)
    });
  });

  test('configures statusline when statusLine has type but no command', () => {
    // Given: Settings file with statusLine that has type but no command
    const existingSettings = {
      statusLine: {
        type: 'command'
        // no command property
      }
    };
    fs.writeFileSync(TEST_CLAUDE_SETTINGS_PATH, JSON.stringify(existingSettings), 'utf8');

    // When: configureClaudeStatusline is called
    const pluginRoot = '/path/to/cortex';
    const result = configureClaudeStatusline(TEST_CLAUDE_SETTINGS_PATH, pluginRoot);

    // Then: Statusline is configured (missing command is treated as no statusline)
    assert.strictEqual(result.configured, true);
    assert.strictEqual(result.skipped, false);

    const savedSettings = JSON.parse(fs.readFileSync(TEST_CLAUDE_SETTINGS_PATH, 'utf8'));
    assert.deepStrictEqual(savedSettings.statusLine, {
      type: 'command',
      command: buildCortexStatuslineCommand(pluginRoot)
    });
  });
});
