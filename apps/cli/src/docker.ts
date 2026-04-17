/**
 * Docker orchestration — compose lifecycle, emulator management, worker spawning.
 *
 * Architecture:
 * - viper-temporal: Temporal server (persistent)
 * - viper-emulator: Android emulator with Frida + mitmproxy CA (per-scan)
 * - viper-worker-XXXX: Ephemeral worker per scan (JADX, APKTool, ADB, Node.js)
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { getMode } from './mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEV_IMAGE = 'viper-worker';
const NPX_IMAGE_REPO = 'viper/worker';

export function getWorkerImage(version: string): string {
  return getMode() === 'local' ? DEV_IMAGE : `${NPX_IMAGE_REPO}:${version}`;
}

function getComposeFile(): string {
  return getMode() === 'local'
    ? path.resolve('docker-compose.yml')
    : path.resolve(__dirname, '..', 'infra', 'compose.yml');
}

export function randomSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}

function runQuiet(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function runOutput(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

// === Health Checks ===

export function isTemporalReady(): boolean {
  const output = runOutput('docker', [
    'exec', 'viper-temporal', 'temporal', 'operator', 'cluster', 'health',
    '--address', 'localhost:7233',
  ]);
  return output.includes('SERVING');
}

export function isEmulatorReady(): boolean {
  const output = runOutput('docker', [
    'exec', 'viper-emulator', 'adb', 'shell', 'getprop', 'sys.boot_completed',
  ]);
  return output.trim() === '1';
}

// === Infrastructure Management ===

export async function ensureInfra(): Promise<void> {
  if (isTemporalReady()) return;

  const composeFile = getComposeFile();
  console.log('Starting Viper infrastructure...');
  execFileSync('docker', ['compose', '-f', composeFile, 'up', '-d'], { stdio: 'inherit' });

  // Wait for Temporal health
  for (let i = 0; i < 30; i++) {
    if (isTemporalReady()) {
      console.log('Temporal is ready.');
      return;
    }
    await sleep(2000);
  }
  throw new Error('Temporal failed to become ready within 60 seconds');
}

export async function ensureEmulator(apiLevel: number = 34): Promise<void> {
  if (isEmulatorReady()) return;

  const composeFile = getComposeFile();
  console.log(`Starting Android emulator (API ${apiLevel})...`);
  execFileSync('docker', [
    'compose', '-f', composeFile, '--profile', 'emulator', 'up', '-d',
  ], { stdio: 'inherit' });

  // Wait for emulator boot
  console.log('Waiting for emulator boot...');
  for (let i = 0; i < 60; i++) {
    if (isEmulatorReady()) {
      console.log('Emulator is ready.');
      return;
    }
    await sleep(3000);
  }
  throw new Error('Android emulator failed to boot within 3 minutes');
}

// === Worker Management ===

export interface WorkerOptions {
  apkPath: string;
  sourcePath?: string;
  configPath?: string;
  outputPath?: string;
  sessionId: string;
  version: string;
  pipelineTesting: boolean;
  emulatorHost?: string;
  emulatorPort?: number;
}

export function spawnWorker(options: WorkerOptions): ChildProcess {
  const image = getWorkerImage(options.version);
  const suffix = randomSuffix();
  const containerName = `viper-worker-${suffix}`;

  const dockerArgs: string[] = [
    'run', '--rm',
    '--name', containerName,
    '--network', 'viper-net',
    // Mount APK
    '-v', `${path.resolve(options.apkPath)}:/app/target.apk:ro`,
    // Environment
    '-e', `VIPER_APK_PATH=/app/target.apk`,
    '-e', `VIPER_SESSION_ID=${options.sessionId}`,
    '-e', `TEMPORAL_ADDRESS=viper-temporal:7233`,
    '-e', `VIPER_EMULATOR_HOST=${options.emulatorHost || 'viper-emulator'}`,
    '-e', `VIPER_EMULATOR_PORT=${String(options.emulatorPort || 5555)}`,
  ];

  // Mount source code if provided
  if (options.sourcePath) {
    dockerArgs.push('-v', `${path.resolve(options.sourcePath)}:/app/source:ro`);
    dockerArgs.push('-e', 'VIPER_SOURCE_PATH=/app/source');
  }

  // Mount config if provided
  if (options.configPath) {
    dockerArgs.push('-v', `${path.resolve(options.configPath)}:/app/config.yaml:ro`);
    dockerArgs.push('-e', 'VIPER_CONFIG_PATH=/app/config.yaml');
  }

  // Pipeline testing mode
  if (options.pipelineTesting) {
    dockerArgs.push('-e', 'VIPER_PIPELINE_TESTING=1');
  }

  // Passthrough API credentials
  const credentialVars = [
    'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK', 'AWS_REGION', 'CLAUDE_CODE_USE_VERTEX',
  ];
  for (const varName of credentialVars) {
    const val = process.env[varName];
    if (val) dockerArgs.push('-e', `${varName}=${val}`);
  }

  // Shared memory for Chromium/Playwright
  dockerArgs.push('--shm-size', '2gb');

  // Linux host gateway
  if (process.platform === 'linux') {
    dockerArgs.push('--add-host', 'host.docker.internal:host-gateway');
  }

  dockerArgs.push(image);

  console.log(`Spawning worker: ${containerName}`);
  return spawn('docker', dockerArgs, { stdio: 'inherit' });
}

// === APK Extraction from Device ===

export function extractApkFromDevice(packageName: string, outputPath: string): string {
  console.log(`Extracting APK for ${packageName} from connected device...`);

  // Get APK path on device
  const apkDevicePath = runOutput('adb', ['shell', 'pm', 'path', packageName]);
  if (!apkDevicePath.startsWith('package:')) {
    throw new Error(`Package not found on device: ${packageName}`);
  }

  const devicePath = apkDevicePath.replace('package:', '').trim();
  const localPath = path.resolve(outputPath, `${packageName}.apk`);

  execFileSync('adb', ['pull', devicePath, localPath], { stdio: 'inherit' });
  console.log(`APK extracted to: ${localPath}`);
  return localPath;
}

// === Cleanup ===

export function stopWorkers(): void {
  const containers = runOutput('docker', [
    'ps', '-q', '--filter', 'name=viper-worker-',
  ]);
  if (containers) {
    for (const id of containers.split('\n').filter(Boolean)) {
      runQuiet('docker', ['stop', id]);
    }
  }
}

export function stopInfra(clean: boolean): void {
  const composeFile = getComposeFile();
  const args = ['compose', '-f', composeFile, 'down'];
  if (clean) args.push('-v');
  execFileSync('docker', args, { stdio: 'inherit' });
}

// === Install APK on Emulator ===

export function installApkOnEmulator(apkPath: string, emulatorHost: string = 'viper-emulator'): void {
  console.log('Installing APK on emulator...');
  execFileSync('docker', [
    'exec', emulatorHost, 'adb', 'install', '-r', apkPath,
  ], { stdio: 'inherit' });
  console.log('APK installed successfully.');
}

// === Push Frida Server to Emulator ===

export function setupFridaOnEmulator(emulatorHost: string = 'viper-emulator'): void {
  console.log('Setting up Frida server on emulator...');
  try {
    // Check if frida-server is already running
    const running = runOutput('docker', [
      'exec', emulatorHost, 'adb', 'shell', 'ps', '-A',
    ]);
    if (running.includes('frida-server')) {
      console.log('Frida server already running.');
      return;
    }

    // Start frida-server (pre-installed in emulator image)
    execFileSync('docker', [
      'exec', '-d', emulatorHost, 'adb', 'shell',
      '/data/local/tmp/frida-server', '-D',
    ], { stdio: 'pipe' });
    console.log('Frida server started.');
  } catch (error) {
    console.warn(`Frida setup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}
