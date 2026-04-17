/**
 * Stop command — teardown all Viper containers.
 */

import { execSync } from 'node:child_process';

export function stop(clean: boolean): void {
  console.log(clean ? 'Stopping and cleaning all Viper containers...' : 'Stopping all Viper containers...');

  try {
    execSync('docker compose -f docker-compose.yml down' + (clean ? ' -v' : ''), {
      stdio: 'inherit',
    });
  } catch {
    console.error('Failed to stop containers. Is Docker running?');
  }
}
