/**
 * Cortex Analytics Module
 * Tracks session patterns and provides insights for Cortex usage
 */

import * as fs from 'fs';
import { getAnalyticsPath, ensureDataDir } from './config.js';
import type { AnalyticsData, SessionMetrics, AnalyticsSummary, SessionSavePoint } from './types.js';

// ============================================================================
// Constants
// ============================================================================

const ANALYTICS_VERSION = 1;
const MAX_SESSIONS_TO_KEEP = 100;

// ============================================================================
// Analytics File Operations
// ============================================================================

/**
 * Load analytics data from disk
 */
export function getAnalytics(): AnalyticsData {
  const analyticsPath = getAnalyticsPath();

  if (!fs.existsSync(analyticsPath)) {
    return createEmptyAnalytics();
  }

  try {
    const content = fs.readFileSync(analyticsPath, 'utf8');
    const data = JSON.parse(content) as AnalyticsData;

    // Version migration if needed
    if (data.version !== ANALYTICS_VERSION) {
      return migrateAnalytics(data);
    }

    return data;
  } catch {
    return createEmptyAnalytics();
  }
}

/**
 * Save analytics data to disk
 */
export function saveAnalytics(data: AnalyticsData): void {
  ensureDataDir();
  const analyticsPath = getAnalyticsPath();

  // Prune old sessions if needed
  if (data.sessions.length > MAX_SESSIONS_TO_KEEP) {
    data.sessions = data.sessions.slice(-MAX_SESSIONS_TO_KEEP);
  }

  fs.writeFileSync(analyticsPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Create empty analytics data structure
 */
function createEmptyAnalytics(): AnalyticsData {
  return {
    version: ANALYTICS_VERSION,
    sessions: [],
    currentSession: null,
  };
}

/**
 * Migrate old analytics format to current version
 */
function migrateAnalytics(oldData: AnalyticsData): AnalyticsData {
  // For now, just create fresh if version mismatch
  return createEmptyAnalytics();
}

// ============================================================================
// Session Tracking
// ============================================================================

/**
 * Start tracking a new session
 */
export function startSession(projectId: string | null): SessionMetrics {
  const analytics = getAnalytics();

  // End any existing session
  if (analytics.currentSession) {
    endSession();
  }

  const session: SessionMetrics = {
    sessionId: generateSessionId(),
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
  saveAnalytics(analytics);

  return session;
}

/**
 * End the current session and archive it
 */
export function endSession(): SessionMetrics | null {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return null;
  }

  const session = analytics.currentSession;
  session.endTime = new Date().toISOString();

  // Add to sessions list
  analytics.sessions.push(session);
  analytics.currentSession = null;

  saveAnalytics(analytics);

  return session;
}

/**
 * Get the current session (or create one if none exists)
 */
export function getCurrentSession(projectId: string | null): SessionMetrics {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return startSession(projectId);
  }

  return analytics.currentSession;
}

/**
 * Update the current session's context percentage
 */
export function updateContextPercent(percent: number): void {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return;
  }

  if (percent > analytics.currentSession.peakContextPercent) {
    analytics.currentSession.peakContextPercent = percent;
    saveAnalytics(analytics);
  }
}

/**
 * Record a save point in the current session
 */
export function recordSavePoint(contextPercent: number, fragmentsSaved: number): void {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return;
  }

  const savePoint: SessionSavePoint = {
    timestamp: new Date().toISOString(),
    contextPercent,
    fragmentsSaved,
  };

  analytics.currentSession.savePoints.push(savePoint);
  analytics.currentSession.fragmentsCreated += fragmentsSaved;
  saveAnalytics(analytics);
}

/**
 * Record a context clear in the current session
 */
export function recordClear(): void {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return;
  }

  analytics.currentSession.clearCount++;
  saveAnalytics(analytics);
}

/**
 * Record a recall query in the current session
 */
export function recordRecall(): void {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return;
  }

  analytics.currentSession.recallCount++;
  saveAnalytics(analytics);
}

/**
 * Record that restoration context was used
 */
export function recordRestorationUsed(): void {
  const analytics = getAnalytics();

  if (!analytics.currentSession) {
    return;
  }

  analytics.currentSession.restorationUsed = true;
  saveAnalytics(analytics);
}

// ============================================================================
// Analytics Summary
// ============================================================================

/**
 * Get analytics summary
 */
export function getAnalyticsSummary(): AnalyticsSummary {
  const analytics = getAnalytics();
  const sessions = analytics.sessions;

  // Calculate this week's stats
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeekSessions = sessions.filter((s) => new Date(s.startTime) >= oneWeekAgo);

  // Calculate average context at save
  const allSavePoints = sessions.flatMap((s) => s.savePoints);
  const avgContextAtSave = allSavePoints.length > 0
    ? allSavePoints.reduce((sum, sp) => sum + sp.contextPercent, 0) / allSavePoints.length
    : 0;

  // Count sessions that used smart compaction (save + clear)
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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Get recent sessions for a project
 */
export function getRecentProjectSessions(projectId: string | null, limit: number = 5): SessionMetrics[] {
  const analytics = getAnalytics();

  return analytics.sessions
    .filter((s) => s.projectId === projectId)
    .slice(-limit);
}
