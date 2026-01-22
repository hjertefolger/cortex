/**
 * Cortex MCP Server
 * Exposes Cortex tools via the Model Context Protocol (stdio-based)
 */

import * as readline from 'readline';
import { initDb, getStats, getProjectStats, getMemory, deleteMemory, storeManualMemory, saveDb, searchByVector, searchByKeyword } from './database.js';
import { loadConfig, getDataDir, getCurrentSession, getMostRecentSession } from './config.js';
import { hybridSearch } from './search.js';
import { archiveSession } from './archive.js';
import { embedQuery } from './embeddings.js';
import { getProjectId } from './stdin.js';
import { getAnalytics, getAnalyticsSummary } from './analytics.js';
import type { Database as SqlJsDatabase } from 'sql.js';

// ============================================================================
// MCP Protocol Types
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
  {
    name: 'cortex_recall',
    description: 'Search Cortex memory for relevant past context. Use when referencing past work or needing historical context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant memories',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
        includeAllProjects: {
          type: 'boolean',
          description: 'Search across all projects instead of just the current one',
        },
        projectId: {
          type: 'string',
          description: 'Specific project ID to search within',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'cortex_remember',
    description: 'Save a specific insight, decision, or fact to memory. Use for important information worth preserving during the conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to remember (decision, insight, fact, etc.)',
        },
        context: {
          type: 'string',
          description: 'Optional context about why this is important',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to associate with this memory',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'cortex_save',
    description: 'Archive the current session to Cortex memory. Use before clearing context or when context is high. Transcript path is auto-detected from current session.',
    inputSchema: {
      type: 'object',
      properties: {
        transcriptPath: {
          type: 'string',
          description: 'Path to the transcript file (optional - auto-detected from current session)',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to associate with the memories',
        },
        global: {
          type: 'boolean',
          description: 'Save as global memories (not project-specific)',
        },
      },
    },
  },
  {
    name: 'cortex_archive',
    description: 'Archive the current session to Cortex memory (alias for cortex_save). Transcript path is auto-detected from current session.',
    inputSchema: {
      type: 'object',
      properties: {
        transcriptPath: {
          type: 'string',
          description: 'Path to the transcript file (optional - auto-detected from current session)',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to associate with the memories',
        },
        global: {
          type: 'boolean',
          description: 'Save as global memories (not project-specific)',
        },
      },
    },
  },
  {
    name: 'cortex_stats',
    description: 'Get Cortex memory statistics including fragment count, project count, and database size.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Get stats for a specific project',
        },
      },
    },
  },
  {
    name: 'cortex_restore',
    description: 'Get restoration context from recent session. Use after context clear to restore continuity.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to get restoration context for',
        },
        messageCount: {
          type: 'number',
          description: 'Number of recent memories to include (default: 5)',
        },
      },
    },
  },
  {
    name: 'cortex_delete',
    description: 'Delete a specific memory fragment by ID. Requires confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: {
          type: 'number',
          description: 'The ID of the memory to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Set to true to confirm deletion',
        },
      },
      required: ['memoryId'],
    },
  },
  {
    name: 'cortex_forget_project',
    description: 'Delete all memories for a specific project. Requires confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to delete all memories for',
        },
        confirm: {
          type: 'boolean',
          description: 'Set to true to confirm deletion',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'cortex_analytics',
    description: 'Get session analytics and insights about Cortex usage patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          description: 'Include detailed session-by-session metrics',
        },
      },
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleRecall(
  db: SqlJsDatabase,
  params: { query: string; limit?: number; includeAllProjects?: boolean; projectId?: string }
): Promise<unknown> {
  const { query, limit = 5, includeAllProjects = false, projectId } = params;

  const results = await hybridSearch(db, query, {
    projectScope: !includeAllProjects,
    projectId,
    includeAllProjects,
    limit,
  });

  return {
    results: results.map((r) => ({
      id: r.id,
      content: r.content,
      score: Math.round(r.score * 100) / 100,
      source: r.source,
      timestamp: r.timestamp.toISOString(),
      projectId: r.projectId,
    })),
    count: results.length,
    query,
  };
}

async function handleRemember(
  db: SqlJsDatabase,
  params: { content: string; context?: string; projectId?: string }
): Promise<unknown> {
  const { content, context, projectId } = params;

  if (!content || content.trim().length === 0) {
    return {
      success: false,
      error: 'Content is required',
    };
  }

  // Generate embedding for the content
  const textToEmbed = context ? `${content} ${context}` : content;
  const embedding = await embedQuery(textToEmbed);

  // Store the memory
  const result = storeManualMemory(db, content, embedding, projectId || null, context);

  if (result.isDuplicate) {
    return {
      success: true,
      isDuplicate: true,
      id: result.id,
      message: 'This content already exists in memory',
    };
  }

  // Persist to disk
  saveDb(db);

  return {
    success: true,
    id: result.id,
    message: `Remembered: "${content.length > 50 ? content.substring(0, 50) + '...' : content}"`,
    projectId: projectId || null,
  };
}

async function handleSave(
  db: SqlJsDatabase,
  params: { transcriptPath?: string; projectId?: string; global?: boolean }
): Promise<unknown> {
  let { transcriptPath, projectId } = params;
  const { global = false } = params;

  // If transcriptPath not provided, try to auto-detect
  if (!transcriptPath) {
    // Try by projectId first
    if (projectId) {
      const currentSession = getCurrentSession(projectId);
      if (currentSession) {
        transcriptPath = currentSession.transcriptPath;
      }
    }

    // If still no transcript, try most recent session
    if (!transcriptPath) {
      const recentSession = getMostRecentSession();
      if (recentSession) {
        transcriptPath = recentSession.transcriptPath;
        projectId = projectId || recentSession.projectId;
      }
    }

    // If still nothing, error
    if (!transcriptPath) {
      return {
        success: false,
        error: 'No active session found. Start a new Claude Code session first.',
      };
    }
  }

  const effectiveProjectId = global ? null : projectId || null;

  const result = await archiveSession(db, transcriptPath, effectiveProjectId);

  return {
    success: true,
    archived: result.archived,
    skipped: result.skipped,
    duplicates: result.duplicates,
    projectId: effectiveProjectId,
    transcriptPath,
  };
}

async function handleStats(
  db: SqlJsDatabase,
  params: { projectId?: string }
): Promise<unknown> {
  const stats = getStats(db);

  const result: Record<string, unknown> = {
    totalFragments: stats.fragmentCount,
    totalProjects: stats.projectCount,
    totalSessions: stats.sessionCount,
    dbSizeBytes: stats.dbSizeBytes,
    oldestMemory: stats.oldestTimestamp?.toISOString() || null,
    newestMemory: stats.newestTimestamp?.toISOString() || null,
    dataDir: getDataDir(),
  };

  if (params.projectId) {
    const projectStats = getProjectStats(db, params.projectId);
    result.project = {
      id: params.projectId,
      fragments: projectStats.fragmentCount,
      sessions: projectStats.sessionCount,
      lastArchive: projectStats.lastArchive?.toISOString() || null,
    };
  }

  return result;
}

async function handleRestore(
  db: SqlJsDatabase,
  params: { projectId?: string; messageCount?: number }
): Promise<unknown> {
  const { projectId, messageCount = 5 } = params;
  const config = loadConfig();

  // Get recent memories for the project
  const queryEmbedding = await embedQuery('recent work context summary');
  const results = searchByVector(db, queryEmbedding, projectId, messageCount);

  if (results.length === 0) {
    return {
      hasContent: false,
      summary: null,
      fragments: [],
    };
  }

  // Build restoration summary
  const fragments = results.map((r) => ({
    id: r.id,
    content: r.content.length > 300 ? r.content.substring(0, 300) + '...' : r.content,
    timestamp: r.timestamp.toISOString(),
  }));

  // Estimate token usage (rough: ~4 chars per token)
  const totalChars = fragments.reduce((sum, f) => sum + f.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);

  return {
    hasContent: true,
    summary: `Found ${fragments.length} recent memories from ${projectId || 'global'} context.`,
    fragments,
    estimatedTokens,
    withinBudget: estimatedTokens <= config.restoration.tokenBudget,
  };
}

async function handleDelete(
  db: SqlJsDatabase,
  params: { memoryId: number; confirm?: boolean }
): Promise<unknown> {
  const { memoryId, confirm = false } = params;

  // Get the memory first
  const memory = getMemory(db, memoryId);

  if (!memory) {
    return {
      error: 'Memory not found',
      memoryId,
    };
  }

  if (!confirm) {
    // Return confirmation request
    return {
      status: 'confirmation_required',
      action: 'delete',
      memoryId,
      preview: memory.content.length > 200 ? memory.content.substring(0, 200) + '...' : memory.content,
      projectId: memory.projectId,
      timestamp: memory.timestamp.toISOString(),
      message: 'Call cortex_delete with confirm: true to delete this memory.',
    };
  }

  // Perform deletion
  const deleted = deleteMemory(db, memoryId);
  if (deleted) {
    saveDb(db);
  }

  return {
    success: deleted,
    memoryId,
    message: deleted ? 'Memory deleted successfully.' : 'Failed to delete memory.',
  };
}

async function handleForgetProject(
  db: SqlJsDatabase,
  params: { projectId: string; confirm?: boolean }
): Promise<unknown> {
  const { projectId, confirm = false } = params;

  // Get project stats first
  const projectStats = getProjectStats(db, projectId);

  if (projectStats.fragmentCount === 0) {
    return {
      error: 'No memories found for this project',
      projectId,
    };
  }

  if (!confirm) {
    return {
      status: 'confirmation_required',
      action: 'forget_project',
      projectId,
      fragmentCount: projectStats.fragmentCount,
      sessionCount: projectStats.sessionCount,
      message: `This will delete ${projectStats.fragmentCount} memories from ${projectId}. Call cortex_forget_project with confirm: true to proceed.`,
    };
  }

  // Import the sql.js database to run delete
  const result = db.exec(`DELETE FROM memories WHERE project_id = ?`, [projectId]);
  const deletedCount = db.getRowsModified();
  saveDb(db);

  return {
    success: true,
    projectId,
    deletedCount,
    message: `Deleted ${deletedCount} memories from ${projectId}.`,
  };
}

async function handleAnalytics(params: { detailed?: boolean }): Promise<unknown> {
  const { detailed = false } = params;

  const analytics = getAnalytics();
  const summary = getAnalyticsSummary();

  const result: Record<string, unknown> = {
    summary: {
      totalSessions: summary.totalSessions,
      totalFragments: summary.totalFragments,
      averageContextAtSave: `${Math.round(summary.averageContextAtSave)}%`,
      sessionsProlonged: summary.sessionsProlonged,
    },
    thisWeek: summary.thisWeek,
    insights: generateInsights(summary),
    recommendations: generateRecommendations(summary),
  };

  if (detailed && analytics.sessions.length > 0) {
    result.recentSessions = analytics.sessions.slice(-10).map((s) => ({
      sessionId: s.sessionId,
      projectId: s.projectId,
      startTime: s.startTime,
      peakContext: `${s.peakContextPercent}%`,
      fragmentsCreated: s.fragmentsCreated,
      recallCount: s.recallCount,
    }));
  }

  return result;
}

function generateInsights(summary: { averageContextAtSave: number; sessionsProlonged: number; thisWeek: { recallsUsed: number } }): string[] {
  const insights: string[] = [];
  const config = loadConfig();

  if (summary.averageContextAtSave > 0) {
    const threshold = 70; // Heuristic threshold
    const diff = Math.abs(summary.averageContextAtSave - threshold);
    if (diff < 5) {
      insights.push(`Your average save happens at ${Math.round(summary.averageContextAtSave)}% - threshold is ${threshold}% (good match)`);
    } else if (summary.averageContextAtSave > threshold) {
      insights.push(`You typically save at ${Math.round(summary.averageContextAtSave)}% - consider lower context usage`);
    }
  }

  if (summary.sessionsProlonged > 0) {
    insights.push(`${summary.sessionsProlonged} sessions used smart compaction - avoided hitting 100% context`);
  }

  if (summary.thisWeek.recallsUsed > 5) {
    insights.push(`Active recall usage this week (${summary.thisWeek.recallsUsed} queries) - memories are being utilized`);
  }

  return insights;
}

function generateRecommendations(summary: { averageContextAtSave: number; sessionsProlonged: number }): string[] {
  const recommendations: string[] = [];
  const config = loadConfig();

  if (summary.averageContextAtSave > 85) {
    recommendations.push('Your context often gets very high before saving - consider using /save more frequently');
  }

  return recommendations;
}

// ============================================================================
// MCP Server
// ============================================================================

class MCPServer {
  private db: SqlJsDatabase | null = null;

  async initialize(): Promise<void> {
    this.db = await initDb();
  }

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id);

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return await this.handleToolCall(id, params as { name: string; arguments: Record<string, unknown> });

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private handleInitialize(id: string | number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'cortex-memory',
          version: '2.0.3',
        },
      },
    };
  }

  private handleToolsList(id: string | number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  private async handleToolCall(
    id: string | number,
    params: { name: string; arguments: Record<string, unknown> }
  ): Promise<MCPResponse> {
    if (!this.db) {
      this.db = await initDb();
    }

    const { name, arguments: args } = params;
    let result: unknown;

    switch (name) {
      case 'cortex_recall':
        result = await handleRecall(this.db, args as Parameters<typeof handleRecall>[1]);
        break;

      case 'cortex_remember':
        result = await handleRemember(this.db, args as Parameters<typeof handleRemember>[1]);
        break;

      case 'cortex_save':
      case 'cortex_archive':
        // Both names supported - cortex_archive is the canonical name, cortex_save is for backward compatibility
        result = await handleSave(this.db, args as Parameters<typeof handleSave>[1]);
        break;

      case 'cortex_stats':
        result = await handleStats(this.db, args as Parameters<typeof handleStats>[1]);
        break;

      case 'cortex_restore':
        result = await handleRestore(this.db, args as Parameters<typeof handleRestore>[1]);
        break;

      case 'cortex_delete':
        result = await handleDelete(this.db, args as Parameters<typeof handleDelete>[1]);
        break;

      case 'cortex_forget_project':
        result = await handleForgetProject(this.db, args as Parameters<typeof handleForgetProject>[1]);
        break;

      case 'cortex_analytics':
        result = await handleAnalytics(args as Parameters<typeof handleAnalytics>[0]);
        break;

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`,
          },
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      },
    };
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const server = new MCPServer();
  await server.initialize();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line) as MCPRequest;
      const response = await server.handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      const errorResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 0,
        error: {
          code: -32700,
          message: 'Parse error',
          data: error instanceof Error ? error.message : String(error),
        },
      };
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('MCP Server error:', error);
  process.exit(1);
});
