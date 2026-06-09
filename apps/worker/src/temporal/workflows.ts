/**
 * Main Temporal workflow — 6-phase Android pentest pipeline.
 *
 * Phase 1: Static Analysis (sequential)
 * Phase 2: Reconnaissance (sequential)
 * Phase 3: Vulnerability Analysis (5 parallel agents)
 * Phase 4: Exploitation (5 parallel, conditional — pipelined with Phase 3)
 * Phase 5: Reporting (sequential)
 * Phase 6: Cleanup
 */

import { proxyActivities, setHandler, defineQuery } from '@temporalio/workflow';

import type { AgentName } from '../types/agents.js';
import { VULN_EXPLOIT_PAIRS } from '../types/agents.js';
import type { AgentMetrics } from '../types/metrics.js';
import type {
  ActivityInput,
  AgentProgress,
  PipelineInput,
  PipelineProgress,
  PipelineSummary,
  VulnExploitPipelineResult,
} from './shared.js';
import { PROGRESS_QUERY, RETRY_CONFIGS } from './shared.js';

// === Activity Stubs ===

interface PipelineActivities {
  runStaticAnalysis(input: ActivityInput): Promise<AgentMetrics>;
  runRecon(input: ActivityInput): Promise<AgentMetrics>;
  runVulnAnalysis(input: ActivityInput, vulnType: string): Promise<AgentMetrics>;
  runExploitation(input: ActivityInput, vulnType: string): Promise<AgentMetrics>;
  checkExploitationQueue(input: ActivityInput, vulnType: string): Promise<boolean>;
  runReport(input: ActivityInput): Promise<AgentMetrics>;
  cleanupEmulator(input: ActivityInput): Promise<void>;
}

const getRetryConfig = (input: PipelineInput) => {
  if (input.pipelineTestingMode) return RETRY_CONFIGS.testing;
  if (input.pipelineConfig?.retry_preset === 'subscription') return RETRY_CONFIGS.subscription;
  return RETRY_CONFIGS.production;
};

// === Progress Query ===

const getProgress = defineQuery<PipelineProgress>(PROGRESS_QUERY);

// === Concurrency Limiter ===

async function runWithConcurrencyLimit(
  thunks: Array<() => Promise<VulnExploitPipelineResult>>,
  limit: number,
): Promise<PromiseSettledResult<VulnExploitPipelineResult>[]> {
  const results: PromiseSettledResult<VulnExploitPipelineResult>[] = [];
  const inFlight = new Set<Promise<void>>();

  for (const thunk of thunks) {
    const p = (async () => {
      try {
        const result = await thunk();
        results.push({ status: 'fulfilled', value: result });
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
      }
    })();

    inFlight.add(p);
    p.finally(() => inFlight.delete(p));

    if (inFlight.size >= limit) {
      await Promise.race(inFlight);
    }
  }

  await Promise.allSettled([...inFlight]);
  return results;
}

// === Main Workflow ===

export async function pentestPipelineWorkflow(input: PipelineInput): Promise<PipelineSummary> {
  const retryConfig = getRetryConfig(input);

  const activities = proxyActivities<PipelineActivities>({
    startToCloseTimeout: '2h',
    // Agents run a single long-lived claude CLI call (often 10-20 min) without
    // emitting Temporal heartbeats. A 5m heartbeatTimeout therefore fired
    // mid-agent and retried the activity while the original kept running —
    // burning duplicate model spend with no progress. Until the activity sends
    // periodic heartbeat()s, keep this >= the longest expected agent runtime.
    heartbeatTimeout: '30m',
    retry: {
      initialInterval: retryConfig.initialInterval,
      maximumInterval: retryConfig.maximumInterval,
      maximumAttempts: retryConfig.maximumAttempts,
    },
  });

  // === State ===
  const completedAgents: AgentName[] = [];
  const failedAgents: AgentName[] = [];
  const allMetrics: AgentMetrics[] = [];
  const agentProgress: Map<AgentName, AgentProgress> = new Map();
  const startedAt = new Date().toISOString();
  let currentPhase = 'initializing';

  const sessionId = input.sessionId || crypto.randomUUID();
  const emulatorHost = input.emulatorHost || 'viper-emulator';
  const emulatorPort = input.emulatorPort || 5555;
  const workspaceDir = `workspaces/${sessionId}`;
  const decompiledDir = `${workspaceDir}/decompiled`;
  const artifactPath = input.artifactPath ?? input.apkPath;
  const platform = input.platform ?? 'android';

  const activityInput: ActivityInput = {
    apkPath: input.apkPath,
    artifactPath,
    platform,
    ...(input.sourcePath && { sourcePath: input.sourcePath }),
    sessionId,
    ...(input.configPath && { configPath: input.configPath }),
    pipelineTestingMode: input.pipelineTestingMode || false,
    emulatorHost,
    emulatorPort,
    workspaceDir,
    decompiledDir,
  };

  function updateAgent(name: AgentName, displayName: string, status: AgentProgress['status'], metrics?: AgentMetrics): void {
    agentProgress.set(name, { name, displayName, status, ...(metrics && { metrics }) });
  }

  // === Progress Query Handler ===
  setHandler(getProgress, () => ({
    phase: currentPhase,
    agents: [...agentProgress.values()],
    startedAt,
    completedAgents: [...completedAgents],
  }));

  const pipelineStart = Date.now();

  // === Phase 1: Static Analysis ===
  currentPhase = 'static-analysis';
  updateAgent('static-analysis', 'Static Analysis', 'running');

  try {
    const metrics = await activities.runStaticAnalysis(activityInput);
    completedAgents.push('static-analysis');
    allMetrics.push(metrics);
    updateAgent('static-analysis', 'Static Analysis', 'completed', metrics);
  } catch (error) {
    failedAgents.push('static-analysis');
    updateAgent('static-analysis', 'Static Analysis', 'failed');
    // Static analysis is critical — abort pipeline
    return buildSummary(false, completedAgents, failedAgents, allMetrics, pipelineStart);
  }

  // === Phase 2: Reconnaissance ===
  currentPhase = 'reconnaissance';
  updateAgent('recon', 'Reconnaissance', 'running');

  try {
    const metrics = await activities.runRecon(activityInput);
    completedAgents.push('recon');
    allMetrics.push(metrics);
    updateAgent('recon', 'Reconnaissance', 'completed', metrics);
  } catch (error) {
    failedAgents.push('recon');
    updateAgent('recon', 'Reconnaissance', 'failed');
    return buildSummary(false, completedAgents, failedAgents, allMetrics, pipelineStart);
  }

  // === Phase 3+4: Vulnerability Analysis + Exploitation (pipelined) ===
  currentPhase = 'vuln-exploit';

  const vulnExploitPipelines = VULN_EXPLOIT_PAIRS.map((pair) => {
    return async (): Promise<VulnExploitPipelineResult> => {
      // 1. Run vulnerability analysis
      updateAgent(pair.vulnAgent, `${pair.vulnType} Vuln Analysis`, 'running');
      const vulnMetrics = await activities.runVulnAnalysis(activityInput, pair.vulnType);
      completedAgents.push(pair.vulnAgent);
      allMetrics.push(vulnMetrics);
      updateAgent(pair.vulnAgent, `${pair.vulnType} Vuln Analysis`, 'completed', vulnMetrics);

      // 2. Check if exploitation is needed
      const shouldExploit = await activities.checkExploitationQueue(activityInput, pair.vulnType);

      if (!shouldExploit) {
        updateAgent(pair.exploitAgent, `${pair.vulnType} Exploitation`, 'skipped');
        return { vulnType: pair.vulnType, vulnResult: vulnMetrics };
      }

      // 3. Run exploitation
      updateAgent(pair.exploitAgent, `${pair.vulnType} Exploitation`, 'running');
      const exploitMetrics = await activities.runExploitation(activityInput, pair.vulnType);
      completedAgents.push(pair.exploitAgent);
      allMetrics.push(exploitMetrics);
      updateAgent(pair.exploitAgent, `${pair.vulnType} Exploitation`, 'completed', exploitMetrics);

      return { vulnType: pair.vulnType, vulnResult: vulnMetrics, exploitResult: exploitMetrics };
    };
  });

  const pipelineResults = await runWithConcurrencyLimit(vulnExploitPipelines, 5);

  // Track failures from vuln/exploit phase
  for (const result of pipelineResults) {
    if (result.status === 'rejected') {
      // Individual pipeline failures are not fatal — continue to reporting
    }
  }

  // === Phase 5: Reporting ===
  currentPhase = 'reporting';
  updateAgent('report', 'Executive Report', 'running');

  try {
    const metrics = await activities.runReport(activityInput);
    completedAgents.push('report');
    allMetrics.push(metrics);
    updateAgent('report', 'Executive Report', 'completed', metrics);
  } catch (error) {
    failedAgents.push('report');
    updateAgent('report', 'Executive Report', 'failed');
  }

  // === Phase 6: Cleanup ===
  currentPhase = 'cleanup';
  try {
    await activities.cleanupEmulator(activityInput);
  } catch {
    // Cleanup failures are non-fatal
  }

  currentPhase = 'complete';
  return buildSummary(failedAgents.length === 0, completedAgents, failedAgents, allMetrics, pipelineStart);
}

function buildSummary(
  success: boolean,
  completedAgents: readonly AgentName[],
  failedAgents: readonly AgentName[],
  metrics: readonly AgentMetrics[],
  pipelineStart: number,
): PipelineSummary {
  return {
    success,
    completedAgents,
    failedAgents,
    metrics,
    totalDurationMs: Date.now() - pipelineStart,
    totalCostUsd: metrics.reduce((sum, m) => sum + m.costUsd, 0),
  };
}
