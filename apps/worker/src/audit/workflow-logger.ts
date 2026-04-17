/**
 * Human-readable unified workflow logger.
 * Writes to workspaces/{sessionId}/workflow.log
 */

import { LogStream } from './log-stream.js';

export class WorkflowLogger {
  private readonly stream: LogStream;

  constructor(workspaceDir: string) {
    this.stream = new LogStream(`${workspaceDir}/workflow.log`);
  }

  logPhaseStart(phase: string): void {
    this.write(phase, 'PHASE_START', `Starting phase: ${phase}`);
  }

  logAgentStart(agentName: string, displayName: string): void {
    this.write(agentName, 'AGENT_START', `Starting: ${displayName}`);
  }

  logAgentEnd(agentName: string, durationMs: number, costUsd: number, turns: number, success: boolean): void {
    const durationSec = (durationMs / 1000).toFixed(1);
    const status = success ? 'SUCCESS' : 'FAILED';
    this.write(agentName, 'AGENT_END', `${status} duration=${durationSec}s, cost=$${costUsd.toFixed(2)}, turns=${turns}`);
  }

  logError(agentName: string, message: string): void {
    this.write(agentName, 'ERROR', message);
  }

  logInfo(agentName: string, message: string): void {
    this.write(agentName, 'INFO', message);
  }

  private write(context: string, level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.stream.append(`[${timestamp}] [${context}] [${level}] ${message}`);
  }
}
