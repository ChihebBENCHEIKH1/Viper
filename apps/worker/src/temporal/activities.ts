/**
 * Temporal activity wrappers — thin layer over business logic services.
 *
 * Activities handle:
 * - Heartbeat loop (for long-running agents)
 * - Error classification (retryable vs permanent)
 * - Container lifecycle (get-or-create per workflow)
 */

import { heartbeat } from '@temporalio/activity';

import type { AgentName } from '../types/agents.js';
import type { AgentMetrics } from '../types/metrics.js';
import type { ActivityInput } from './shared.js';
import { getOrCreateContainer, type SessionMetadata } from '../services/container.js';
import { classifyErrorForTemporal } from '../services/error-handling.js';
import { ApplicationFailure } from '@temporalio/common';

function buildSessionMetadata(input: ActivityInput): SessionMetadata {
  return {
    sessionId: input.sessionId,
    apkPath: input.apkPath,
    ...(input.sourcePath && { sourcePath: input.sourcePath }),
    workspaceDir: input.workspaceDir,
    decompiledDir: input.decompiledDir,
  };
}

function wrapActivity(fn: () => Promise<AgentMetrics>): Promise<AgentMetrics> {
  return fn().catch((error: unknown) => {
    const classification = classifyErrorForTemporal(error);
    throw ApplicationFailure.create({
      message: error instanceof Error ? error.message : String(error),
      type: classification.type,
      nonRetryable: !classification.retryable,
    });
  });
}

// === Console Logger (Temporal-compatible) ===

const createLogger = (agentName: string) => ({
  info: (msg: string) => console.log(`[${agentName}] ${msg}`),
  warn: (msg: string) => console.warn(`[${agentName}] WARN: ${msg}`),
  error: (msg: string) => console.error(`[${agentName}] ERROR: ${msg}`),
});

// === Activity Implementations ===

export async function runStaticAnalysis(input: ActivityInput): Promise<AgentMetrics> {
  return wrapActivity(async () => {
    const metadata = buildSessionMetadata(input);
    const container = getOrCreateContainer(input.sessionId, metadata);
    const logger = createLogger('static-analysis');

    return container.agentExecution.executeOrThrow(
      {
        agentName: 'static-analysis',
        apkPath: input.apkPath,
        ...(input.sourcePath && { sourcePath: input.sourcePath }),
        ...(input.configPath && { configPath: input.configPath }),
        pipelineTestingMode: input.pipelineTestingMode,
        emulatorHost: input.emulatorHost,
        emulatorPort: input.emulatorPort,
        workspaceDir: input.workspaceDir,
        decompiledDir: input.decompiledDir,
      },
      logger,
    );
  });
}

export async function runRecon(input: ActivityInput): Promise<AgentMetrics> {
  return wrapActivity(async () => {
    const metadata = buildSessionMetadata(input);
    const container = getOrCreateContainer(input.sessionId, metadata);
    const logger = createLogger('recon');

    return container.agentExecution.executeOrThrow(
      {
        agentName: 'recon',
        apkPath: input.apkPath,
        ...(input.sourcePath && { sourcePath: input.sourcePath }),
        ...(input.configPath && { configPath: input.configPath }),
        pipelineTestingMode: input.pipelineTestingMode,
        emulatorHost: input.emulatorHost,
        emulatorPort: input.emulatorPort,
        workspaceDir: input.workspaceDir,
        decompiledDir: input.decompiledDir,
      },
      logger,
    );
  });
}

export async function runVulnAnalysis(input: ActivityInput, vulnType: string): Promise<AgentMetrics> {
  const agentName = `${vulnType}-vuln` as AgentName;
  return wrapActivity(async () => {
    const metadata = buildSessionMetadata(input);
    const container = getOrCreateContainer(input.sessionId, metadata);
    const logger = createLogger(agentName);

    return container.agentExecution.executeOrThrow(
      {
        agentName,
        apkPath: input.apkPath,
        ...(input.sourcePath && { sourcePath: input.sourcePath }),
        ...(input.configPath && { configPath: input.configPath }),
        pipelineTestingMode: input.pipelineTestingMode,
        emulatorHost: input.emulatorHost,
        emulatorPort: input.emulatorPort,
        workspaceDir: input.workspaceDir,
        decompiledDir: input.decompiledDir,
      },
      logger,
    );
  });
}

export async function runExploitation(input: ActivityInput, vulnType: string): Promise<AgentMetrics> {
  const agentName = `${vulnType}-exploit` as AgentName;
  return wrapActivity(async () => {
    const metadata = buildSessionMetadata(input);
    const container = getOrCreateContainer(input.sessionId, metadata);
    const logger = createLogger(agentName);

    return container.agentExecution.executeOrThrow(
      {
        agentName,
        apkPath: input.apkPath,
        ...(input.sourcePath && { sourcePath: input.sourcePath }),
        ...(input.configPath && { configPath: input.configPath }),
        pipelineTestingMode: input.pipelineTestingMode,
        emulatorHost: input.emulatorHost,
        emulatorPort: input.emulatorPort,
        workspaceDir: input.workspaceDir,
        decompiledDir: input.decompiledDir,
      },
      logger,
    );
  });
}

export async function checkExploitationQueue(input: ActivityInput, vulnType: string): Promise<boolean> {
  const metadata = buildSessionMetadata(input);
  const container = getOrCreateContainer(input.sessionId, metadata);
  const decision = container.exploitationChecker.check(input.workspaceDir, vulnType);
  return decision.shouldExploit;
}

export async function runReport(input: ActivityInput): Promise<AgentMetrics> {
  return wrapActivity(async () => {
    const metadata = buildSessionMetadata(input);
    const container = getOrCreateContainer(input.sessionId, metadata);
    const logger = createLogger('report');

    return container.agentExecution.executeOrThrow(
      {
        agentName: 'report',
        apkPath: input.apkPath,
        ...(input.sourcePath && { sourcePath: input.sourcePath }),
        ...(input.configPath && { configPath: input.configPath }),
        pipelineTestingMode: input.pipelineTestingMode,
        emulatorHost: input.emulatorHost,
        emulatorPort: input.emulatorPort,
        workspaceDir: input.workspaceDir,
        decompiledDir: input.decompiledDir,
      },
      logger,
    );
  });
}

export async function cleanupEmulator(input: ActivityInput): Promise<void> {
  console.log(`[cleanup] Emulator cleanup for session ${input.sessionId}`);
  // TODO: Stop emulator container, archive mitmproxy logs
}
