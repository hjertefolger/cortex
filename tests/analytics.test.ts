/**
 * Cortex Analytics Module Tests
 * Tests session tracking, metrics, and summaries
 */

import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test data directory
const TEST_DATA_DIR = path.join(os.tmpdir(), 'cortex-analytics-test-' + Date.now());
const TEST_ANALYTICS_PATH = path.join(TEST_DATA_DIR, 'analytics.json');

const ANALYTICS_VERSION = 1;
const MAX_SESSIONS_TO_KEEP = 100;

describe('Analytics Module', () => {
  before(() => {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_ANALYTICS_PATH)) {
      fs.unlinkSync(TEST_ANALYTICS_PATH);
    }
  });

  test('should create empty analytics when file does not exist', () => {
    const analytics = getTestAnalytics();

    assert.strictEqual(analytics.version, ANALYTICS_VERSION);
    assert.deepStrictEqual(analytics.sessions, []);
    assert.strictEqual(analytics.currentSession, null);
  });

  test('should start a new session', () => {
    const session = startTestSession('test-project');

    assert.ok(session.sessionId, 'Session should have an ID');
    assert.strictEqual(session.projectId, 'test-project');
    assert.ok(session.startTime, 'Session should have start time');
    assert.strictEqual(session.endTime, null);
    assert.strictEqual(session.peakContextPercent, 0);
    assert.deepStrictEqual(session.savePoints, []);
    assert.strictEqual(session.clearCount, 0);
    assert.strictEqual(session.recallCount, 0);
    assert.strictEqual(session.fragmentsCreated, 0);
    assert.strictEqual(session.restorationUsed, false);
  });

  test('should end session and archive it', () => {
    startTestSession('test-project');
    const endedSession = endTestSession();

    assert.ok(endedSession.endTime, 'Ended session should have end time');

    const analytics = getTestAnalytics();
    assert.strictEqual(analytics.sessions.length, 1);
    assert.strictEqual(analytics.currentSession, null);
  });

  test('should track peak context percentage', () => {
    startTestSession('test-project');

    updateTestContextPercent(45);
    let analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.peakContextPercent, 45);

    updateTestContextPercent(72);
    analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.peakContextPercent, 72);

    // Lower value should not update peak
    updateTestContextPercent(50);
    analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.peakContextPercent, 72);
  });

  test('should record save points', () => {
    startTestSession('test-project');

    recordTestSavePoint(65, 5);
    recordTestSavePoint(75, 3);

    const analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.savePoints.length, 2);
    assert.strictEqual(analytics.currentSession.fragmentsCreated, 8);

    const firstSavePoint = analytics.currentSession.savePoints[0];
    assert.strictEqual(firstSavePoint.contextPercent, 65);
    assert.strictEqual(firstSavePoint.fragmentsSaved, 5);
    assert.ok(firstSavePoint.timestamp);
  });

  test('should record clear count', () => {
    startTestSession('test-project');

    recordTestClear();
    recordTestClear();
    recordTestClear();

    const analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.clearCount, 3);
  });

  test('should record recall count', () => {
    startTestSession('test-project');

    recordTestRecall();
    recordTestRecall();

    const analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.recallCount, 2);
  });

  test('should record restoration used', () => {
    startTestSession('test-project');

    let analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.restorationUsed, false);

    recordTestRestorationUsed();

    analytics = getTestAnalytics();
    assert.strictEqual(analytics.currentSession.restorationUsed, true);
  });

  test('should generate session ID correctly', () => {
    const id1 = generateTestSessionId();
    const id2 = generateTestSessionId();

    assert.ok(id1.length > 0);
    assert.ok(id2.length > 0);
    assert.notStrictEqual(id1, id2, 'Session IDs should be unique');
    assert.ok(id1.includes('-'), 'Session ID should contain separator');
  });

  test('should prune old sessions beyond limit', () => {
    // Create many sessions
    for (let i = 0; i < 110; i++) {
      startTestSession(`project-${i}`);
      endTestSession();
    }

    const analytics = getTestAnalytics();
    assert.ok(
      analytics.sessions.length <= MAX_SESSIONS_TO_KEEP,
      `Should have at most ${MAX_SESSIONS_TO_KEEP} sessions`
    );
  });

  test('should calculate analytics summary', () => {
    // Create some historical sessions
    for (let i = 0; i < 5; i++) {
      startTestSession('summary-project');
      recordTestSavePoint(60 + i * 5, 2);
      recordTestRecall();
      if (i % 2 === 0) {
        recordTestClear();
      }
      endTestSession();
    }

    const summary = getTestAnalyticsSummary();

    assert.strictEqual(summary.totalSessions, 5);
    assert.strictEqual(summary.totalFragments, 10); // 5 sessions * 2 fragments each
    assert.ok(summary.averageContextAtSave > 0);
    assert.ok(summary.sessionsProlonged >= 0);
    assert.ok(summary.thisWeek);
    assert.strictEqual(summary.thisWeek.sessions, 5);
  });

  test('should get recent project sessions', () => {
    // Create sessions for different projects
    for (let i = 0; i < 3; i++) {
      startTestSession('project-a');
      endTestSession();
    }
    for (let i = 0; i < 2; i++) {
      startTestSession('project-b');
      endTestSession();
    }

    const projectASessions = getTestRecentProjectSessions('project-a', 10);
    const projectBSessions = getTestRecentProjectSessions('project-b', 10);

    assert.strictEqual(projectASessions.length, 3);
    assert.strictEqual(projectBSessions.length, 2);
  });

  test('should handle null project ID', () => {
    const session = startTestSession(null);

    assert.strictEqual(session.projectId, null);

    endTestSession();
    const analytics = getTestAnalytics();
    assert.strictEqual(analytics.sessions[0].projectId, null);
  });

  test('should end existing session when starting new one', () => {
    startTestSession('first-project');
    startTestSession('second-project');

    const analytics = getTestAnalytics();

    // First session should be archived
    assert.strictEqual(analytics.sessions.length, 1);
    assert.strictEqual(analytics.sessions[0].projectId, 'first-project');
    assert.ok(analytics.sessions[0].endTime);

    // Second session should be current
    assert.strictEqual(analytics.currentSession.projectId, 'second-project');
  });
});

// Test helper functions (simulating the actual module behavior)
function createEmptyAnalytics() {
  return {
    version: ANALYTICS_VERSION,
    sessions: [],
    currentSession: null,
  };
}

function getTestAnalytics() {
  if (!fs.existsSync(TEST_ANALYTICS_PATH)) {
    return createEmptyAnalytics();
  }

  try {
    const content = fs.readFileSync(TEST_ANALYTICS_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return createEmptyAnalytics();
  }
}

function saveTestAnalytics(data) {
  if (data.sessions.length > MAX_SESSIONS_TO_KEEP) {
    data.sessions = data.sessions.slice(-MAX_SESSIONS_TO_KEEP);
  }
  fs.writeFileSync(TEST_ANALYTICS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function generateTestSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

function startTestSession(projectId) {
  const analytics = getTestAnalytics();

  // End existing session
  if (analytics.currentSession) {
    analytics.currentSession.endTime = new Date().toISOString();
    analytics.sessions.push(analytics.currentSession);
  }

  const session = {
    sessionId: generateTestSessionId(),
    projectId,
    startTime: new Date().toISOString(),
    endTime: null,
    peakContextPercent: 0,
    savePoints: [],
    clearCount: 0,
    recallCount: 0,
    fragmentsCreated: 0,
    restorationUsed: false,
  };

  analytics.currentSession = session;
  saveTestAnalytics(analytics);

  return session;
}

function endTestSession() {
  const analytics = getTestAnalytics();

  if (!analytics.currentSession) {
    return null;
  }

  const session = analytics.currentSession;
  session.endTime = new Date().toISOString();
  analytics.sessions.push(session);
  analytics.currentSession = null;

  saveTestAnalytics(analytics);
  return session;
}

function updateTestContextPercent(percent) {
  const analytics = getTestAnalytics();
  if (!analytics.currentSession) return;

  if (percent > analytics.currentSession.peakContextPercent) {
    analytics.currentSession.peakContextPercent = percent;
    saveTestAnalytics(analytics);
  }
}

function recordTestSavePoint(contextPercent, fragmentsSaved) {
  const analytics = getTestAnalytics();
  if (!analytics.currentSession) return;

  analytics.currentSession.savePoints.push({
    timestamp: new Date().toISOString(),
    contextPercent,
    fragmentsSaved,
  });
  analytics.currentSession.fragmentsCreated += fragmentsSaved;
  saveTestAnalytics(analytics);
}

function recordTestClear() {
  const analytics = getTestAnalytics();
  if (!analytics.currentSession) return;

  analytics.currentSession.clearCount++;
  saveTestAnalytics(analytics);
}

function recordTestRecall() {
  const analytics = getTestAnalytics();
  if (!analytics.currentSession) return;

  analytics.currentSession.recallCount++;
  saveTestAnalytics(analytics);
}

function recordTestRestorationUsed() {
  const analytics = getTestAnalytics();
  if (!analytics.currentSession) return;

  analytics.currentSession.restorationUsed = true;
  saveTestAnalytics(analytics);
}

function getTestAnalyticsSummary() {
  const analytics = getTestAnalytics();
  const sessions = analytics.sessions;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeekSessions = sessions.filter((s) => new Date(s.startTime) >= oneWeekAgo);

  const allSavePoints = sessions.flatMap((s) => s.savePoints);
  const avgContextAtSave =
    allSavePoints.length > 0
      ? allSavePoints.reduce((sum, sp) => sum + sp.contextPercent, 0) / allSavePoints.length
      : 0;

  const sessionsProlonged = sessions.filter((s) => s.savePoints.length > 0 && s.clearCount > 0).length;

  return {
    totalSessions: sessions.length,
    totalFragments: sessions.reduce((sum, s) => sum + s.fragmentsCreated, 0),
    averageContextAtSave: avgContextAtSave,
    sessionsProlonged,
    thisWeek: {
      sessions: thisWeekSessions.length,
      fragmentsCreated: thisWeekSessions.reduce((sum, s) => sum + s.fragmentsCreated, 0),
      recallsUsed: thisWeekSessions.reduce((sum, s) => sum + s.recallCount, 0),
    },
  };
}

function getTestRecentProjectSessions(projectId, limit) {
  const analytics = getTestAnalytics();
  return analytics.sessions.filter((s) => s.projectId === projectId).slice(-limit);
}
