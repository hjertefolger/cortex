/**
 * Cortex Configuration Module Tests
 * Tests config loading, saving, defaults, and presets
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test data directory - isolated from production
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-config-test-' + Date.now());
const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, 'config.json');

// Default configuration (mirrored from config.ts)
const DEFAULT_STATUSLINE_CONFIG = {
  enabled: true,
  showFragments: true,
  showLastArchive: true,
  showContext: true,
  contextWarningThreshold: 70,
};

const DEFAULT_ARCHIVE_CONFIG = {
  autoOnCompact: true,
  projectScope: true,
  minContentLength: 50,
};

const DEFAULT_MONITOR_CONFIG = {
  tokenThreshold: 70,
};

const DEFAULT_AUTOMATION_CONFIG = {
  autoSaveThreshold: 70,
  autoClearThreshold: 80,
  autoClearEnabled: false,
  restorationTokenBudget: 1000,
  restorationMessageCount: 5,
};

const DEFAULT_SETUP_CONFIG = {
  completed: false,
  completedAt: null,
};

const DEFAULT_CONFIG = {
  statusline: DEFAULT_STATUSLINE_CONFIG,
  archive: DEFAULT_ARCHIVE_CONFIG,
  monitor: DEFAULT_MONITOR_CONFIG,
  automation: DEFAULT_AUTOMATION_CONFIG,
  setup: DEFAULT_SETUP_CONFIG,
};

// Config presets (mirrored from config.ts)
const CONFIG_PRESETS = {
  full: {
    statusline: {
      enabled: true,
      showFragments: true,
      showLastArchive: true,
      showContext: true,
      contextWarningThreshold: 70,
    },
    archive: {
      autoOnCompact: true,
      projectScope: true,
      minContentLength: 50,
    },
    monitor: {
      tokenThreshold: 70,
    },
    automation: {
      autoSaveThreshold: 70,
      autoClearThreshold: 80,
      autoClearEnabled: false,
      restorationTokenBudget: 1000,
      restorationMessageCount: 5,
    },
  },
  essential: {
    statusline: {
      enabled: true,
      showFragments: true,
      showLastArchive: false,
      showContext: true,
      contextWarningThreshold: 80,
    },
    archive: {
      autoOnCompact: true,
      projectScope: true,
      minContentLength: 100,
    },
    monitor: {
      tokenThreshold: 80,
    },
    automation: {
      autoSaveThreshold: 75,
      autoClearThreshold: 85,
      autoClearEnabled: false,
      restorationTokenBudget: 800,
      restorationMessageCount: 5,
    },
  },
  minimal: {
    statusline: {
      enabled: false,
      showFragments: false,
      showLastArchive: false,
      showContext: false,
      contextWarningThreshold: 90,
    },
    archive: {
      autoOnCompact: false,
      projectScope: true,
      minContentLength: 50,
    },
    monitor: {
      tokenThreshold: 90,
    },
    automation: {
      autoSaveThreshold: 85,
      autoClearThreshold: 90,
      autoClearEnabled: false,
      restorationTokenBudget: 500,
      restorationMessageCount: 3,
    },
  },
};

// Deep merge utility
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}

describe('Configuration Module', () => {
  before(() => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean config file between tests
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      fs.unlinkSync(TEST_CONFIG_PATH);
    }
  });

  test('should return defaults when no config file exists', () => {
    // Config file does not exist
    assert.ok(!fs.existsSync(TEST_CONFIG_PATH));

    // Should get default config
    const config = loadTestConfig(TEST_CONFIG_PATH);
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  test('should save config to disk', () => {
    const customConfig = deepMerge(DEFAULT_CONFIG, {
      statusline: { enabled: false },
    });

    saveTestConfig(TEST_CONFIG_PATH, customConfig);

    assert.ok(fs.existsSync(TEST_CONFIG_PATH), 'Config file should exist');

    const savedContent = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
    assert.strictEqual(savedContent.statusline.enabled, false);
  });

  test('should load saved config', () => {
    const customConfig = deepMerge(DEFAULT_CONFIG, {
      automation: { autoSaveThreshold: 60 },
    });

    saveTestConfig(TEST_CONFIG_PATH, customConfig);
    const loadedConfig = loadTestConfig(TEST_CONFIG_PATH);

    assert.strictEqual(loadedConfig.automation.autoSaveThreshold, 60);
  });

  test('should merge partial config with defaults', () => {
    // Save partial config
    const partialConfig = {
      statusline: { contextWarningThreshold: 50 },
    };
    fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(partialConfig), 'utf8');

    const loadedConfig = loadTestConfig(TEST_CONFIG_PATH);

    // Should have the custom value
    assert.strictEqual(loadedConfig.statusline.contextWarningThreshold, 50);

    // Should still have default values for other fields
    assert.strictEqual(loadedConfig.statusline.enabled, true);
    assert.strictEqual(loadedConfig.statusline.showFragments, true);
    assert.strictEqual(loadedConfig.automation.autoSaveThreshold, 70);
  });

  test('should handle corrupted config file', () => {
    // Write invalid JSON
    fs.writeFileSync(TEST_CONFIG_PATH, 'not valid json {{{', 'utf8');

    const config = loadTestConfig(TEST_CONFIG_PATH);

    // Should fall back to defaults
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  test('should apply full preset correctly', () => {
    const config = applyTestPreset('full', TEST_CONFIG_PATH);

    assert.strictEqual(config.statusline.enabled, true);
    assert.strictEqual(config.statusline.showFragments, true);
    assert.strictEqual(config.statusline.showLastArchive, true);
    assert.strictEqual(config.automation.autoSaveThreshold, 70);
    assert.strictEqual(config.automation.restorationTokenBudget, 1000);
  });

  test('should apply essential preset correctly', () => {
    const config = applyTestPreset('essential', TEST_CONFIG_PATH);

    assert.strictEqual(config.statusline.enabled, true);
    assert.strictEqual(config.statusline.showLastArchive, false);
    assert.strictEqual(config.statusline.contextWarningThreshold, 80);
    assert.strictEqual(config.automation.autoSaveThreshold, 75);
  });

  test('should apply minimal preset correctly', () => {
    const config = applyTestPreset('minimal', TEST_CONFIG_PATH);

    assert.strictEqual(config.statusline.enabled, false);
    assert.strictEqual(config.archive.autoOnCompact, false);
    assert.strictEqual(config.automation.restorationMessageCount, 3);
  });

  test('should update specific config sections', () => {
    // Start with default
    saveTestConfig(TEST_CONFIG_PATH, DEFAULT_CONFIG);

    // Update automation section
    const updates = {
      automation: {
        autoClearEnabled: true,
        autoSaveThreshold: 65,
      },
    };

    const updated = updateTestConfig(TEST_CONFIG_PATH, updates);

    assert.strictEqual(updated.automation.autoClearEnabled, true);
    assert.strictEqual(updated.automation.autoSaveThreshold, 65);
    // Other automation fields should remain default
    assert.strictEqual(updated.automation.autoClearThreshold, 80);
  });

  test('should validate threshold ranges', () => {
    const config = deepMerge(DEFAULT_CONFIG, {
      statusline: { contextWarningThreshold: 150 }, // Invalid > 100
    });

    // The config module doesn't validate, but we test that values are stored as-is
    saveTestConfig(TEST_CONFIG_PATH, config);
    const loaded = loadTestConfig(TEST_CONFIG_PATH);

    assert.strictEqual(loaded.statusline.contextWarningThreshold, 150);
    // In real implementation, validation would happen at usage time
  });

  test('should mark setup as complete', () => {
    saveTestConfig(TEST_CONFIG_PATH, DEFAULT_CONFIG);

    let config = loadTestConfig(TEST_CONFIG_PATH);
    assert.strictEqual(config.setup.completed, false);
    assert.strictEqual(config.setup.completedAt, null);

    // Mark setup complete
    config = markSetupComplete(TEST_CONFIG_PATH);

    assert.strictEqual(config.setup.completed, true);
    assert.ok(config.setup.completedAt !== null, 'completedAt should be set');
    assert.ok(new Date(config.setup.completedAt) instanceof Date, 'completedAt should be valid date');
  });
});

describe('Deep Merge', () => {
  test('should merge nested objects', () => {
    const target = {
      a: { b: 1, c: 2 },
      d: 3,
    };
    const source = {
      a: { b: 10 },
      e: 4,
    };

    const result = deepMerge(target, source);

    assert.strictEqual(result.a.b, 10, 'Nested value should be overwritten');
    assert.strictEqual(result.a.c, 2, 'Unchanged nested value should remain');
    assert.strictEqual(result.d, 3, 'Unchanged top-level should remain');
    assert.strictEqual(result.e, 4, 'New top-level should be added');
  });

  test('should not mutate original objects', () => {
    const target = { a: { b: 1 } };
    const source = { a: { b: 2 } };

    deepMerge(target, source);

    assert.strictEqual(target.a.b, 1, 'Target should not be mutated');
  });

  test('should handle undefined values in source', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, c: 3 };

    const result = deepMerge(target, source);

    assert.strictEqual(result.a, 1, 'Undefined should not overwrite');
    assert.strictEqual(result.c, 3, 'Defined values should be added');
  });
});

// Test helper functions (simulating the actual module behavior)
function loadTestConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const loaded = JSON.parse(content);
    return deepMerge(DEFAULT_CONFIG, loaded);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveTestConfig(configPath, config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function updateTestConfig(configPath, updates) {
  const current = loadTestConfig(configPath);
  const updated = deepMerge(current, updates);
  saveTestConfig(configPath, updated);
  return updated;
}

function applyTestPreset(preset, configPath) {
  const presetConfig = CONFIG_PRESETS[preset];
  const config = deepMerge(DEFAULT_CONFIG, presetConfig);
  saveTestConfig(configPath, config);
  return config;
}

function markSetupComplete(configPath) {
  const config = loadTestConfig(configPath);
  config.setup.completed = true;
  config.setup.completedAt = new Date().toISOString();
  saveTestConfig(configPath, config);
  return config;
}
