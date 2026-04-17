/**
 * Status command — show running Viper containers.
 */

import { execSync } from 'node:child_process';

export function status(): void {
  try {
    const output = execSync('docker ps --filter "name=viper-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', {
      encoding: 'utf-8',
    });
    if (output.trim()) {
      console.log('\nRunning Viper containers:\n');
      console.log(output);
    } else {
      console.log('No Viper containers running.');
    }
  } catch {
    console.error('Failed to query Docker. Is Docker running?');
  }
}
