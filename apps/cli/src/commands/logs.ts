/**
 * Logs command — tail a workspace's workflow log.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export function logs(workspaceId: string): void {
  const workspacesDir = process.env['VIPER_WORKSPACES_DIR'] || join(process.cwd(), 'workspaces');
  const logPath = join(workspacesDir, workspaceId, 'workflow.log');

  if (!existsSync(logPath)) {
    console.error(`Workflow log not found: ${logPath}`);
    console.error(`Available workspaces: run "viper workspaces" to list`);
    process.exit(1);
  }

  try {
    execSync(`tail -f "${logPath}"`, { stdio: 'inherit' });
  } catch {
    // User interrupted with Ctrl+C
  }
}
