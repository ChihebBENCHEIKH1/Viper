/**
 * Agent execution service — manages the full agent lifecycle.
 *
 * 10-step execution:
 * 1. Load config (conditional)
 * 2. Load prompt template
 * 3. Create git checkpoint
 * 4. Start audit logging
 * 5. Execute Claude SDK
 * 6. Spending cap check (defense-in-depth)
 * 7. Handle execution failure
 * 8. Write structured output (vuln agents)
 * 9. Validate deliverable
 * 10. Commit on success, rollback on failure
 */

import type { AgentName } from '../types/agents.js';
import type { AgentMetrics } from '../types/metrics.js';
import type { ViperError } from '../types/errors.js';
import { ErrorCode } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err, isErr } from '../types/result.js';
import { AGENTS, AGENT_VALIDATORS } from '../session-manager.js';
import type { ConfigLoaderService } from './config-loader.js';
import { distributeConfig } from './config-loader.js';
import { loadAndPreparePrompt } from './prompt-manager.js';
import { runClaudePrompt, validateAgentOutput } from '../ai/claude-executor.js';
import type { Platform } from '../types/platform.js';
import { createGitCheckpoint, commitGitSuccess, rollbackGitWorkspace } from './git-manager.js';

export interface AgentExecutionInput {
  readonly agentName: AgentName;
  readonly apkPath: string;
  readonly artifactPath: string;
  readonly platform: Platform;
  readonly sourcePath?: string;
  readonly configPath?: string;
  readonly pipelineTestingMode: boolean;
  readonly emulatorHost: string;
  readonly emulatorPort: number;
  readonly workspaceDir: string;
  readonly decompiledDir: string;
}

export interface AgentEndResult {
  readonly metrics: AgentMetrics;
  readonly deliverablePath: string;
}

/** Logger interface — decoupled from Temporal */
export interface ActivityLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class AgentExecutionService {
  private readonly configLoader: ConfigLoaderService;

  constructor(configLoader: ConfigLoaderService) {
    this.configLoader = configLoader;
  }

  async execute(
    input: AgentExecutionInput,
    logger: ActivityLogger,
    attempt: number = 1,
  ): Promise<Result<AgentEndResult, ViperError>> {
    const agent = AGENTS[input.agentName];
    const startTime = Date.now();

    logger.info(`Starting agent: ${agent.displayName} (attempt ${attempt})`);

    // 1. Load config
    const configResult = await this.configLoader.loadOptional(input.configPath);
    if (isErr(configResult)) return configResult;
    const config = distributeConfig(configResult.value);

    // 2. Load prompt template
    logger.info('Loading prompt template...');
    let prompt: string;
    try {
      prompt = await loadAndPreparePrompt(
        agent.promptTemplate,
        {
          apkPath: input.apkPath,
          artifactPath: input.artifactPath,
          platform: input.platform,
          ...(input.sourcePath && { sourcePath: input.sourcePath }),
          decompiledDir: input.decompiledDir,
          emulatorHost: input.emulatorHost,
          emulatorPort: input.emulatorPort,
        },
        config,
        input.pipelineTestingMode,
        logger,
      );
    } catch (error) {
      const { ViperError: VE } = await import('../types/errors.js');
      return err(new VE(
        `Failed to load prompt: ${error instanceof Error ? error.message : String(error)}`,
        'prompt', false, {}, ErrorCode.PROMPT_LOAD_FAILED,
      ));
    }

    // 3. Create git checkpoint
    await createGitCheckpoint(input.workspaceDir, agent.displayName, attempt, logger);

    // 4. Start audit logging
    logger.info(`Executing Claude agent (model: ${agent.modelTier}, phase: ${agent.phase})`);

    // 5. Execute Claude SDK
    const claudeResult = await runClaudePrompt(
      prompt,
      input.workspaceDir,
      input.agentName,
      logger,
      agent.modelTier,
      agent.phase,
      input.platform,
      input.emulatorHost,
      input.emulatorPort,
    );

    // 6-7. Handle execution failure
    if (!claudeResult.success) {
      await rollbackGitWorkspace(input.workspaceDir, 'agent execution failure', logger);

      const durationMs = Date.now() - startTime;
      return ok({
        metrics: {
          agentName: input.agentName,
          durationMs,
          costUsd: claudeResult.cost,
          turns: claudeResult.turns,
          success: false,
          ...(claudeResult.error && { errorMessage: claudeResult.error }),
        },
        deliverablePath: '',
      });
    }

    // 8-9. Validate deliverable
    const validated = await validateAgentOutput(
      claudeResult,
      input.agentName,
      input.workspaceDir,
      logger,
    );

    if (!validated && !claudeResult.apiErrorDetected) {
      logger.warn('Deliverable validation failed — agent output may be incomplete');
    }

    // 10. Commit on success
    await commitGitSuccess(input.workspaceDir, agent.displayName, logger);

    const durationMs = Date.now() - startTime;
    const metrics: AgentMetrics = {
      agentName: input.agentName,
      durationMs,
      costUsd: claudeResult.cost,
      turns: claudeResult.turns,
      success: true,
    };

    return ok({
      metrics,
      deliverablePath: `${input.workspaceDir}/${agent.deliverableFilename}`,
    });
  }

  /** Throwing variant for Temporal activities */
  async executeOrThrow(
    input: AgentExecutionInput,
    logger: ActivityLogger,
  ): Promise<AgentMetrics> {
    const result = await this.execute(input, logger);
    if (isErr(result)) {
      throw result.error;
    }
    return result.value.metrics;
  }
}

/** Re-export validateAgentOutput for use in claude-executor */
export { validateAgentOutput } from '../ai/claude-executor.js';
