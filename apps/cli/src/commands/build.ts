/**
 * Build command — build the worker Docker image locally.
 */

import { execSync } from 'node:child_process';

export function build(noCache: boolean): void {
  console.log('Building Viper worker image...');

  const cacheFlag = noCache ? ' --no-cache' : '';

  try {
    execSync(`docker build${cacheFlag} -t viper-worker .`, {
      stdio: 'inherit',
    });
    console.log('\nWorker image built successfully.');
  } catch {
    console.error('Failed to build worker image.');
    process.exit(1);
  }
}
