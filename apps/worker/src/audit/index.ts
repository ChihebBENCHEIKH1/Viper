/**
 * Audit session management — tracks per-agent execution metadata.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentName } from '../types/agents.js';
import type { AgentMetrics } from '../types/metrics.js';
import { LogStream } from './log-stream.js';
import { WorkflowLogger } from './workflow-logger.js';

interface SessionData {
  sessionId: string;
  apkPath: string;
  sourcePath?: string;
  workflowId?: string;
  completedAgents: AgentName[];
  metrics: Record<string, AgentMetrics>;
  startedAt: string;
}

export class AuditSession {
  private readonly workspaceDir: string;
  private readonly sessionPath: string;
  private readonly agentsDir: string;
  readonly workflowLogger: WorkflowLogger;
  private sessionData: SessionData;

  constructor(workspaceDir: string, sessionId: string, apkPath: string, sourcePath?: string) {
    this.workspaceDir = workspaceDir;
    this.sessionPath = join(workspaceDir, 'session.json');
    this.agentsDir = join(workspaceDir, 'agents');
    this.workflowLogger = new WorkflowLogger(workspaceDir);

    mkdirSync(this.agentsDir, { recursive: true });

    // Load existing session or create new
    if (existsSync(this.sessionPath)) {
      this.sessionData = JSON.parse(readFileSync(this.sessionPath, 'utf-8')) as SessionData;
    } else {
      this.sessionData = {
        sessionId,
        apkPath,
        ...(sourcePath && { sourcePath }),
        completedAgents: [],
        metrics: {},
        startedAt: new Date().toISOString(),
      };
      this.save();
    }
  }

  get completedAgents(): readonly AgentName[] {
    return this.sessionData.completedAgents;
  }

  setWorkflowId(workflowId: string): void {
    this.sessionData.workflowId = workflowId;
    this.save();
  }

  startAgent(agentName: AgentName, prompt: string): LogStream {
    this.workflowLogger.logAgentStart(agentName, agentName);
    const agentLog = new LogStream(join(this.agentsDir, `${agentName}.log`));
    agentLog.appendJson({ type: 'start', timestamp: new Date().toISOString(), prompt: prompt.slice(0, 500) });
    return agentLog;
  }

  endAgent(agentName: AgentName, metrics: AgentMetrics): void {
    this.sessionData.metrics[agentName] = metrics;
    if (metrics.success) {
      this.sessionData.completedAgents.push(agentName);
    }
    this.workflowLogger.logAgentEnd(agentName, metrics.durationMs, metrics.costUsd, metrics.turns, metrics.success);
    this.save();
  }

  private save(): void {
    writeFileSync(this.sessionPath, JSON.stringify(this.sessionData, null, 2));
  }
}

export { WorkflowLogger } from './workflow-logger.js';
export { LogStream } from './log-stream.js';
