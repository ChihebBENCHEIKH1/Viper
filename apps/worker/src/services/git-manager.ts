/**
 * Git checkpoint and rollback management.
 *
 * Provides crash-resilient git operations for the agent execution lifecycle:
 * - createGitCheckpoint: Commits workspace state before each attempt
 * - rollbackGitWorkspace: Two-phase reset (hard + clean) for retry preparation
 * - commitGitSuccess: Records successful agent completion
 *
 * Uses a GitSemaphore to serialize operations and prevent index.lock conflicts
 * during parallel agent execution.
 */

import { execSync } from 'node:child_process';
import type { ActivityLogger } from './agent-execution.js';

// === Git Semaphore ===

class GitSemaphore {
  private queue: Array<() => void> = [];
  private running = false;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  release(): void {
    this.running = false;
    this.process();
  }

  private process(): void {
    if (!this.running && this.queue.length > 0) {
      this.running = true;
      const resolve = this.queue.shift();
      resolve?.();
    }
  }
}

const gitSemaphore = new GitSemaphore();

// === Helpers ===

const GIT_LOCK_PATTERNS = ['index.lock', 'unable to lock', 'Another git process', 'fatal: Unable to create'];

function isGitLockError(msg: string): boolean {
  return GIT_LOCK_PATTERNS.some((p) => msg.includes(p));
}

function gitCommand(args: string, cwd: string): string {
  return execSync(`cd "${cwd}" && git ${args}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
}

export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    gitCommand('rev-parse --git-dir', dir);
    return true;
  } catch {
    return false;
  }
}

async function executeWithRetry(
  command: string,
  cwd: string,
  description: string,
  maxRetries: number = 5,
): Promise<string> {
  await gitSemaphore.acquire();
  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return gitCommand(command, cwd);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (isGitLockError(msg) && attempt < maxRetries) {
          const delay = 2 ** (attempt - 1) * 1000;
          console.warn(`Git lock conflict during ${description} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Git command failed after ${maxRetries} retries: ${description}`);
  } finally {
    gitSemaphore.release();
  }
}

function getChangedFiles(cwd: string): string[] {
  try {
    const status = gitCommand('status --porcelain', cwd);
    return status.split('\n').filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

// === Public API ===

export async function rollbackGitWorkspace(
  sourceDir: string,
  reason: string,
  logger: ActivityLogger,
): Promise<boolean> {
  if (!(await isGitRepository(sourceDir))) {
    logger.info('Skipping git rollback (not a git repository)');
    return true;
  }

  logger.info(`Rolling back workspace for ${reason}`);
  try {
    await executeWithRetry('reset --hard HEAD', sourceDir, 'hard reset');
    await executeWithRetry('clean -fd', sourceDir, 'clean untracked');
    logger.info('Rollback completed');
    return true;
  } catch (error) {
    logger.error(`Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function createGitCheckpoint(
  sourceDir: string,
  description: string,
  attempt: number,
  logger: ActivityLogger,
): Promise<boolean> {
  if (!(await isGitRepository(sourceDir))) {
    logger.info('Skipping git checkpoint (not a git repository)');
    return true;
  }

  logger.info(`Creating checkpoint: ${description} (attempt ${attempt})`);
  try {
    // On retries, clean workspace first
    if (attempt > 1) {
      await rollbackGitWorkspace(sourceDir, `${description} retry cleanup`, logger);
    }

    await executeWithRetry('add -A', sourceDir, 'staging');
    await executeWithRetry(
      `commit -m "Checkpoint: ${description} (attempt ${attempt})" --allow-empty`,
      sourceDir, 'checkpoint commit',
    );

    const changes = getChangedFiles(sourceDir);
    logger.info(changes.length > 0 ? `Checkpoint created with ${changes.length} changes` : 'Empty checkpoint created');
    return true;
  } catch (error) {
    logger.warn(`Checkpoint failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function commitGitSuccess(
  sourceDir: string,
  description: string,
  logger: ActivityLogger,
): Promise<boolean> {
  if (!(await isGitRepository(sourceDir))) return true;

  logger.info(`Committing success: ${description}`);
  try {
    await executeWithRetry('add -A', sourceDir, 'staging success');
    await executeWithRetry(
      `commit -m "${description}: completed successfully" --allow-empty`,
      sourceDir, 'success commit',
    );
    return true;
  } catch (error) {
    logger.warn(`Success commit failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function getGitCommitHash(sourceDir: string): Promise<string | null> {
  if (!(await isGitRepository(sourceDir))) return null;
  try {
    return gitCommand('rev-parse HEAD', sourceDir);
  } catch {
    return null;
  }
}
