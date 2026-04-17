/**
 * Cost and duration tracking types
 */

export interface AgentMetrics {
  readonly agentName: string;
  readonly durationMs: number;
  readonly costUsd: number;
  readonly turns: number;
  readonly success: boolean;
  readonly errorMessage?: string;
}

export interface PipelineMetrics {
  readonly totalDurationMs: number;
  readonly totalCostUsd: number;
  readonly agents: readonly AgentMetrics[];
  readonly completedAgents: number;
  readonly failedAgents: number;
}
