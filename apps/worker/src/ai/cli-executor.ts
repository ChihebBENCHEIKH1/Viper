/**
 * Claude CLI subprocess execution backend.
 *
 * Spawns `claude` CLI with --output-format stream-json and reads
 * JSON lines from stdout. This is the PRIMARY execution backend for Viper,
 * matching Shannon's architecture.
 *
 * Advantages over SDK:
 * - No API key management needed (uses `claude login` auth)
 * - Works with Claude Code's native permission system
 * - MCP server configs passed via --mcp-config flag
 * - Same behavior as running Claude Code interactively
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ViperError, ErrorCode } from '../types/errors.js';
import { matchesBillingTextPattern } from '../utils/billing-detection.js';
import type { ModelTier } from '../types/agents.js';

const CLAUDE_CLI = process.env['CLAUDE_CLI_PATH'] || 'claude';

export interface CliExecutorOptions {
  model: string;
  maxTurns: number;
  cwd: string;
  env: Record<string, string>;
  modelTier: ModelTier;
  mcpConfigPath?: string | undefined;
}

export interface CliMessageLoopResult {
  turnCount: number;
  result: string | null;
  apiErrorDetected: boolean;
  cost: number;
  model?: string | undefined;
  structuredOutput?: unknown;
}

export type MessageCallback = (message: Record<string, unknown>) => Promise<void>;

/**
 * Execute a prompt via the Claude CLI subprocess.
 *
 * Spawns: claude --model <model> --max-turns <n> --verbose --output-format stream-json
 *         --dangerously-skip-permissions -p
 *
 * Writes the prompt to stdin, reads JSON-line messages from stdout.
 */
export async function executeViaCli(
  prompt: string,
  options: CliExecutorOptions,
  onMessage?: MessageCallback,
): Promise<CliMessageLoopResult> {
  const args = buildCliArgs(options);

  // Build child environment — passthrough current env + custom vars
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...options.env,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };

  const child = spawn(CLAUDE_CLI, args, {
    cwd: options.cwd,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Track spawn errors
  let spawnError: Error | null = null;
  child.on('error', (err) => {
    spawnError = err;
  });

  // Write prompt to stdin
  const writeOk = child.stdin.write(prompt);
  if (!writeOk) {
    await new Promise<void>((resolve) => child.stdin.once('drain', resolve));
  }
  child.stdin.end();

  // State tracking
  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let cost = 0;
  let model: string | undefined;
  let structuredOutput: unknown;
  let stderrChunks = '';

  // Capture stderr
  child.stderr.on('data', (chunk: Buffer) => {
    stderrChunks += chunk.toString();
  });
  child.stderr.on('error', () => {});

  // Read JSON lines from stdout
  const rl = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  rl.on('error', () => {});

  for await (const line of rl) {
    if (!line.trim()) continue;

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Forward to callback for progress tracking
    if (onMessage) {
      await onMessage(message);
    }

    const type = message['type'] as string | undefined;

    // Count turns on assistant messages
    if (type === 'assistant') {
      turnCount++;
    }

    // Capture result from final message
    if (type === 'result') {
      result = (message['result'] as string) ?? null;
      cost = (message['total_cost_usd'] as number) ?? 0;
      model = message['model'] as string | undefined;

      if (message['is_error'] === true) {
        apiErrorDetected = true;
      }

      // Check for billing patterns in result text
      if (result && matchesBillingTextPattern(result)) {
        apiErrorDetected = true;
      }

      if (message['structured_output'] !== undefined) {
        structuredOutput = message['structured_output'];
      }
    }
  }

  rl.close();

  // Wait for process exit
  const exitCode = await new Promise<number>((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
    } else {
      child.on('close', (code) => resolve(code ?? 1));
    }
  });

  // Handle spawn failure
  if (spawnError) {
    const err = spawnError as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new ViperError(
        `Claude CLI not found at '${CLAUDE_CLI}'. Install Claude Code CLI or set CLAUDE_CLI_PATH.`,
        'agent', false, { exitCode: -1 }, ErrorCode.AGENT_EXECUTION_FAILED,
      );
    }
    throw new ViperError(
      `Failed to spawn Claude CLI: ${err.message}`,
      'network', true, { exitCode: -1 },
    );
  }

  // Handle non-zero exit without result
  if (exitCode !== 0 && !result) {
    const errorMsg = stderrChunks.trim() || `Claude CLI exited with code ${exitCode}`;
    throw classifyCliError(errorMsg, exitCode);
  }

  return {
    turnCount,
    result,
    apiErrorDetected,
    cost,
    model,
    ...(structuredOutput !== undefined && { structuredOutput }),
  };
}

function buildCliArgs(options: CliExecutorOptions): string[] {
  const args = [
    '--model', options.model,
    '--max-turns', String(options.maxTurns),
    '--verbose',
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
  ];

  // Attach MCP config if provided (for Frida, Appium, Android-MCP servers)
  if (options.mcpConfigPath) {
    args.push('--mcp-config', options.mcpConfigPath);
  }

  // -p flag means read prompt from stdin
  args.push('-p');

  return args;
}

function classifyCliError(errorMsg: string, exitCode: number): ViperError {
  const lower = errorMsg.toLowerCase();

  if (lower.includes('spending cap') || lower.includes('rate limit') || lower.includes('usage limit')) {
    return new ViperError(
      `Claude CLI billing limit: ${errorMsg.slice(0, 200)}`,
      'billing', true, { exitCode }, ErrorCode.SPENDING_CAP_REACHED,
    );
  }

  if (lower.includes('not logged in') || lower.includes('authentication') || lower.includes('unauthorized')) {
    return new ViperError(
      `Claude CLI auth error: ${errorMsg.slice(0, 200)}. Run 'claude login' to authenticate.`,
      'agent', false, { exitCode }, ErrorCode.AGENT_EXECUTION_FAILED,
    );
  }

  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused')) {
    return new ViperError(
      `Claude CLI network error: ${errorMsg.slice(0, 200)}`,
      'network', true, { exitCode },
    );
  }

  return new ViperError(
    `Claude CLI failed (exit ${exitCode}): ${errorMsg.slice(0, 200)}`,
    'network', true, { exitCode },
  );
}
