/**
 * Combined Temporal worker + client entry point.
 *
 * 1. Creates a Temporal worker with a per-invocation task queue
 * 2. Submits the pentest pipeline workflow
 * 3. Waits for workflow completion
 * 4. Prints summary and exits
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import { Client, Connection } from '@temporalio/client';
import { randomUUID } from 'node:crypto';

import type { PipelineInput, PipelineSummary } from './shared.js';
import * as activities from './activities.js';

async function main(): Promise<void> {
  // === Read Configuration from Environment ===
  const apkPath = process.env['VIPER_APK_PATH'];
  if (!apkPath) {
    console.error('ERROR: VIPER_APK_PATH environment variable is required');
    process.exit(1);
  }

  const sourcePath = process.env['VIPER_SOURCE_PATH'];
  const configPath = process.env['VIPER_CONFIG_PATH'];
  const outputPath = process.env['VIPER_OUTPUT_PATH'];
  const sessionId = process.env['VIPER_SESSION_ID'] || randomUUID();
  const pipelineTestingMode = process.env['VIPER_PIPELINE_TESTING'] === '1';
  const emulatorHost = process.env['VIPER_EMULATOR_HOST'] || 'viper-emulator';
  const emulatorPort = Number.parseInt(process.env['VIPER_EMULATOR_PORT'] || '5555', 10);

  const temporalAddress = process.env['TEMPORAL_ADDRESS'] || 'viper-temporal:7233';
  const taskQueue = `viper-${sessionId}`;

  console.log(`\n  Viper Worker — Session: ${sessionId}`);
  console.log(`  APK: ${apkPath}`);
  console.log(`  Task Queue: ${taskQueue}`);
  console.log(`  Temporal: ${temporalAddress}\n`);

  // === Start Worker ===
  const nativeConnection = await NativeConnection.connect({ address: temporalAddress });
  const worker = await Worker.create({
    connection: nativeConnection,
    taskQueue,
    activities,
    workflowsPath: new URL('./workflows.js', import.meta.url).pathname,
  });

  // === Submit Workflow ===
  const clientConnection = await Connection.connect({ address: temporalAddress });
  const client = new Client({ connection: clientConnection });

  const pipelineInput: PipelineInput = {
    apkPath,
    ...(sourcePath && { sourcePath }),
    sessionId,
    ...(configPath && { configPath }),
    ...(outputPath && { outputPath }),
    ...(pipelineTestingMode && { pipelineTestingMode }),
    emulatorHost,
    emulatorPort,
    ...(pipelineTestingMode && { pipelineConfig: { retry_preset: 'default' as const } }),
  };

  const workflowId = `viper-pipeline-${sessionId}`;

  const handle = await client.workflow.start('pentestPipelineWorkflow', {
    args: [pipelineInput],
    taskQueue,
    workflowId,
    workflowExecutionTimeout: '6h',
  });

  console.log(`  Workflow started: ${workflowId}`);
  console.log(`  Monitor: http://localhost:8233/namespaces/default/workflows/${workflowId}\n`);

  // === Wait for Completion ===
  // Run worker and wait for workflow result concurrently
  const workerPromise = worker.run();
  const resultPromise = handle.result() as Promise<PipelineSummary>;

  try {
    const summary = await resultPromise;

    console.log('\n  === Pipeline Complete ===');
    console.log(`  Success: ${summary.success}`);
    console.log(`  Completed: ${summary.completedAgents.length} agents`);
    console.log(`  Failed: ${summary.failedAgents.length} agents`);
    console.log(`  Duration: ${(summary.totalDurationMs / 1000 / 60).toFixed(1)} minutes`);
    console.log(`  Cost: $${summary.totalCostUsd.toFixed(2)}`);

    if (summary.failedAgents.length > 0) {
      console.log(`  Failed agents: ${summary.failedAgents.join(', ')}`);
    }
  } finally {
    worker.shutdown();
    await workerPromise;
    await nativeConnection.close();
    await clientConnection.close();
  }
}

main().catch((error) => {
  console.error('Worker failed:', error);
  process.exit(1);
});
