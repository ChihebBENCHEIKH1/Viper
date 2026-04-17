/**
 * Shared types, interfaces, and query definitions for Temporal workflows.
 */

import type { AgentName } from '../types/agents.js';
import type { AgentMetrics } from '../types/metrics.js';

// === Pipeline Input ===

export interface PipelineInput {
  readonly apkPath: string;
  readonly sourcePath?: string;
  readonly sessionId?: string;
  readonly configPath?: string;
  readonly outputPath?: string;
  readonly pipelineTestingMode?: boolean;
  readonly emulatorHost?: string;
  readonly emulatorPort?: number;
  readonly pipelineConfig?: {
    readonly retry_preset?: 'default' | 'subscription';
  };
}

// === Activity Input ===

export interface ActivityInput {
  readonly apkPath: string;
  readonly sourcePath?: string;
  readonly sessionId: string;
  readonly configPath?: string;
  readonly pipelineTestingMode: boolean;
  readonly emulatorHost: string;
  readonly emulatorPort: number;
  readonly workspaceDir: string;
  readonly decompiledDir: string;
}

// === Pipeline Progress ===

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AgentProgress {
  readonly name: AgentName;
  readonly displayName: string;
  readonly status: AgentStatus;
  readonly metrics?: AgentMetrics;
}

export interface PipelineProgress {
  readonly phase: string;
  readonly agents: readonly AgentProgress[];
  readonly startedAt: string;
  readonly completedAgents: readonly AgentName[];
}

// === Pipeline Summary ===

export interface VulnExploitPipelineResult {
  readonly vulnType: string;
  readonly vulnResult: AgentMetrics;
  readonly exploitResult?: AgentMetrics;
}

export interface PipelineSummary {
  readonly success: boolean;
  readonly completedAgents: readonly AgentName[];
  readonly failedAgents: readonly AgentName[];
  readonly metrics: readonly AgentMetrics[];
  readonly totalDurationMs: number;
  readonly totalCostUsd: number;
}

// === Exploitation Decision ===

export interface ExploitationDecision {
  readonly shouldExploit: boolean;
  readonly vulnerabilityCount: number;
  readonly vulnType: string;
}

// === Retry Configurations ===

export const RETRY_CONFIGS = {
  testing: {
    initialInterval: '10s',
    maximumInterval: '30s',
    maximumAttempts: 5,
  },
  production: {
    initialInterval: '5m',
    maximumInterval: '30m',
    maximumAttempts: 50,
  },
  subscription: {
    initialInterval: '5m',
    maximumInterval: '6h',
    maximumAttempts: 100,
  },
} as const;

// === Query Definitions ===

export const PROGRESS_QUERY = 'getProgress';
