/**
 * Claude execution backend — dual mode: CLI (default) or SDK.
 *
 * CLI mode (default): Spawns `claude` CLI subprocess with --output-format stream-json.
 *   - No API key management needed (uses `claude login` auth)
 *   - MCP configs passed via --mcp-config flag
 *   - Same as Shannon's forked project
 *
 * SDK mode: Uses @anthropic-ai/claude-agent-sdk directly.
 *   - Requires ANTHROPIC_API_KEY env var
 *   - Set VIPER_USE_SDK=1 to enable
 *
 * Both backends produce the same ClaudePromptResult interface.
 */

import { join } from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';

import type { ActivityLogger } from '../services/agent-execution.js';
import { ViperError, ErrorCode } from '../types/errors.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import { formatTimestamp } from '../utils/formatting.js';
import { Timer } from '../utils/metrics.js';
import { resolveModel } from './models.js';
import type { ModelTier, AgentPhase } from '../types/agents.js';
import { createMcpConfigFile } from './mcp-config.js';
import type { Platform } from '../types/platform.js';
import { executeViaCli, type CliMessageLoopResult } from './cli-executor.js';

// === Types ===

export interface ClaudePromptResult {
  result: string | null;
  success: boolean;
  duration: number;
  turns: number;
  cost: number;
  model?: string | undefined;
  apiErrorDetected: boolean;
  error?: string | undefined;
  retryable?: boolean | undefined;
  structuredOutput?: unknown;
}

// === Output Validation ===

export async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string,
  logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void },
): Promise<boolean> {
  const { AGENT_VALIDATORS } = await import('../session-manager.js');

  logger.info(`Validating ${agentName} agent output`);

  if (!result.success || !result.result) {
    logger.error('Validation failed: Agent execution unsuccessful');
    return false;
  }

  const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;
  if (!validator) {
    logger.warn(`No validator for "${agentName}" — assuming success`);
    return true;
  }

  try {
    const valid = await validator(sourceDir);
    if (valid) {
      logger.info('Validation passed');
    } else {
      logger.error('Validation failed: Missing deliverable files');
    }
    return valid;
  } catch (error) {
    logger.error(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// === Error Logging ===

function writeErrorLog(err: Error, cwd: string, prompt: string, duration: number): void {
  try {
    const logDir = join(cwd, '.viper', 'deliverables');
    mkdirSync(logDir, { recursive: true });
    const errorLog = {
      timestamp: formatTimestamp(),
      error: { name: err.name, message: err.message, stack: err.stack },
      context: { cwd, prompt: prompt.slice(0, 200), duration },
    };
    appendFileSync(join(logDir, 'error.log'), `${JSON.stringify(errorLog)}\n`);
  } catch {
    // Best-effort
  }
}

// === CLI Backend (DEFAULT) ===

async function runViaCli(
  prompt: string,
  cwd: string,
  agentName: string,
  logger: ActivityLogger,
  modelTier: ModelTier,
  mcpConfigPath: string | undefined,
): Promise<ClaudePromptResult> {
  const timer = new Timer(`agent-${agentName}`);
  const model = resolveModel(modelTier);

  logger.info(`Running via Claude CLI: ${agentName} (model: ${model.modelId})`);

  // Build env for child process
  const childEnv: Record<string, string> = {};
  const passthroughVars = [
    'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
    'HOME', 'PATH',
  ];
  for (const name of passthroughVars) {
    const val = process.env[name];
    if (val) childEnv[name] = val;
  }

  let turnCount = 0;

  try {
    const cliResult: CliMessageLoopResult = await executeViaCli(
      prompt,
      {
        model: model.modelId,
        maxTurns: 10_000,
        cwd,
        env: childEnv,
        modelTier,
        ...(mcpConfigPath && { mcpConfigPath }),
      },
      async (message) => {
        const type = message['type'] as string | undefined;

        if (type === 'assistant') {
          turnCount++;
          // Log assistant output preview
          const content = message['message'] as { content?: unknown } | undefined;
          if (content?.content) {
            const text = typeof content.content === 'string'
              ? content.content
              : Array.isArray(content.content)
                ? (content.content as Array<{ text?: string }>).map((c) => c.text || '').join('')
                : '';
            if (text.trim()) {
              const preview = text.length > 150 ? `${text.slice(0, 150)}...` : text;
              logger.info(`[Turn ${turnCount}] ${preview}`);
            }
          }
        }

        if (type === 'tool_use') {
          const toolName = message['name'] as string | undefined;
          if (toolName) logger.info(`  Tool: ${toolName}`);
        }

        if (type === 'system' && message['subtype'] === 'init') {
          const initModel = message['model'] as string | undefined;
          if (initModel) logger.info(`Model: ${initModel}`);
        }
      },
    );

    // Spending cap defense-in-depth
    if (isSpendingCapBehavior(cliResult.turnCount, cliResult.cost, cliResult.result || '')) {
      throw new ViperError(
        `Spending cap likely reached (turns=${cliResult.turnCount}, cost=$0): ${cliResult.result?.slice(0, 100)}`,
        'billing', true, {}, ErrorCode.SPENDING_CAP_REACHED,
      );
    }

    const duration = timer.stop();
    logger.info(`Agent ${agentName} completed: ${cliResult.turnCount} turns, $${cliResult.cost.toFixed(2)}, ${(duration / 1000).toFixed(1)}s`);

    return {
      result: cliResult.result,
      success: true,
      duration,
      turns: cliResult.turnCount,
      cost: cliResult.cost,
      model: cliResult.model,
      apiErrorDetected: cliResult.apiErrorDetected,
      ...(cliResult.structuredOutput !== undefined && { structuredOutput: cliResult.structuredOutput }),
    };
  } catch (error) {
    const duration = timer.stop();
    const err = error instanceof Error ? error : new Error(String(error));
    writeErrorLog(err, cwd, prompt, duration);
    logger.error(`Agent ${agentName} failed: ${err.message}`);

    return {
      result: null,
      success: false,
      duration,
      turns: turnCount,
      cost: 0,
      apiErrorDetected: false,
      error: err.message,
      retryable: error instanceof ViperError ? error.retryable : true,
    };
  }
}

// === SDK Backend (optional, set VIPER_USE_SDK=1) ===

async function runViaSdk(
  prompt: string,
  cwd: string,
  agentName: string,
  logger: ActivityLogger,
  modelTier: ModelTier,
  mcpConfigPath: string | undefined,
): Promise<ClaudePromptResult> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const timer = new Timer(`agent-${agentName}`);
  const model = resolveModel(modelTier);

  logger.info(`Running via SDK: ${agentName} (model: ${model.modelId})`);

  const sdkEnv: Record<string, string> = {};
  for (const name of ['ANTHROPIC_API_KEY', 'HOME', 'PATH']) {
    const val = process.env[name];
    if (val) sdkEnv[name] = val;
  }

  const options = {
    model: model.modelId,
    maxTurns: 10_000,
    cwd,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    env: sdkEnv,
  };

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let totalCost = 0;
  let detectedModel: string | undefined;

  try {
    for await (const message of query({ prompt, options })) {
      const msg = message as { type?: string; result?: string; total_cost_usd?: number; model?: string; name?: string };

      if (msg.type === 'assistant') turnCount++;

      if (msg.type === 'tool_use' && msg.name) {
        logger.info(`  Tool: ${msg.name}`);
      }

      if (msg.type === 'result') {
        result = msg.result ?? null;
        totalCost = msg.total_cost_usd ?? 0;
        break;
      }

      if (msg.type === 'system' && msg.model) {
        detectedModel = msg.model;
      }
    }

    if (isSpendingCapBehavior(turnCount, totalCost, result || '')) {
      throw new ViperError(
        `Spending cap likely reached`,
        'billing', true, {}, ErrorCode.SPENDING_CAP_REACHED,
      );
    }

    const duration = timer.stop();
    logger.info(`Agent ${agentName} completed: ${turnCount} turns, $${totalCost.toFixed(2)}, ${(duration / 1000).toFixed(1)}s`);

    return {
      result, success: true, duration, turns: turnCount,
      cost: totalCost, model: detectedModel, apiErrorDetected,
    };
  } catch (error) {
    const duration = timer.stop();
    const err = error instanceof Error ? error : new Error(String(error));
    writeErrorLog(err, cwd, prompt, duration);
    logger.error(`Agent ${agentName} failed: ${err.message}`);

    return {
      result: null, success: false, duration, turns: turnCount,
      cost: totalCost, apiErrorDetected, error: err.message,
      retryable: error instanceof ViperError ? error.retryable : true,
    };
  }
}

// === Public API ===

/**
 * Run a prompt through Claude. Uses CLI backend by default (same as Shannon).
 * Set VIPER_USE_SDK=1 to use the Agent SDK directly instead.
 */
export async function runClaudePrompt(
  prompt: string,
  cwd: string,
  agentName: string,
  logger: ActivityLogger,
  modelTier: ModelTier = 'medium',
  phase: AgentPhase = 'vuln',
  platform: Platform = 'android',
  emulatorHost: string = 'viper-emulator',
  emulatorPort: number = 5555,
): Promise<ClaudePromptResult> {
  // Create MCP config for this agent (platform-aware: Android vs iOS servers)
  const mcpConfigPath = createMcpConfigFile(cwd, agentName, phase, platform, emulatorHost, emulatorPort);

  const useSdk = process.env['VIPER_USE_SDK'] === '1';

  if (useSdk) {
    return runViaSdk(prompt, cwd, agentName, logger, modelTier, mcpConfigPath);
  }

  return runViaCli(prompt, cwd, agentName, logger, modelTier, mcpConfigPath);
}
