/**
 * Start command — launch a pentest scan against an Android APK.
 *
 * Supports two device modes:
 *   emulator: Spins up Docker Android emulator (default)
 *   usb:      Uses a real phone connected via USB/ADB
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import type { ParsedStartArgs } from '../index.js';
import { detectPlatform } from '../platform.js';
import { displaySplash } from '../splash.js';
import {
  ensureInfra,
  ensureEmulator,
  spawnWorker,
  setupFridaOnEmulator,
} from '../docker.js';

export interface StartOptions extends ParsedStartArgs {
  version: string;
}

/**
 * Detect a connected iOS device via libimobiledevice (Linux/macOS). Dynamic iOS
 * testing requires a jailbroken device reachable over usbmuxd.
 */
function checkIosDevice(): { udid: string; name: string } {
  try {
    const out = execSync('idevice_id -l', { encoding: 'utf-8' }).trim();
    const udid = out.split('\n').map((l) => l.trim()).filter(Boolean)[0];
    if (!udid) {
      console.error('ERROR: No iOS device detected. Connect a jailbroken device and trust this host.');
      console.error('  (libimobiledevice / usbmuxd must be running.)');
      process.exit(1);
    }
    let name = 'iOS device';
    try {
      name = execSync(`ideviceinfo -u ${udid} -k DeviceName`, { encoding: 'utf-8' }).trim() || name;
    } catch {
      /* DeviceName is best-effort */
    }
    return { udid, name };
  } catch {
    console.error('ERROR: libimobiledevice not found. Install it (idevice_id / ideviceinstaller) for iOS USB testing.');
    process.exit(1);
  }
}

function checkUsbDevice(): { serial: string; model: string; rooted: boolean } {
  try {
    const devices = execSync('adb devices -l', { encoding: 'utf-8' });
    const lines = devices.trim().split('\n').slice(1).filter((l) => l.includes('device'));

    if (lines.length === 0) {
      console.error('ERROR: No USB device connected. Enable USB debugging and reconnect.');
      console.error('  Settings → Developer Options → USB Debugging → ON');
      process.exit(1);
    }

    const serial = lines[0]?.split(/\s+/)[0] || 'unknown';
    const model = execSync(`adb -s ${serial} shell getprop ro.product.model`, {
      encoding: 'utf-8',
    }).trim();

    // Check root
    let rooted = false;
    try {
      const su = execSync(`adb -s ${serial} shell su -c id`, { encoding: 'utf-8', timeout: 5000 });
      rooted = su.includes('uid=0');
    } catch {
      rooted = false;
    }

    return { serial, model, rooted };
  } catch {
    console.error('ERROR: ADB not found. Install Android platform-tools.');
    process.exit(1);
  }
}

export async function start(options: StartOptions): Promise<void> {
  displaySplash(options.version);

  // 1. Validate artifact + resolve platform (.apk/.aab => android, .ipa => ios)
  const apkPath = resolve(options.apk);
  if (!existsSync(apkPath)) {
    console.error(`ERROR: Artifact not found: ${apkPath}`);
    process.exit(1);
  }
  let platform: 'android' | 'ios';
  try {
    platform = detectPlatform(apkPath, options.platform);
  } catch (e) {
    console.error(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const isUsb = options.deviceMode === 'usb';
  const deviceLabel = isUsb
    ? 'Real device (USB)'
    : platform === 'ios'
      ? 'None (static-only)'
      : 'Docker emulator';

  console.log(`  Artifact:   ${apkPath}`);
  console.log(`  Platform:   ${platform}`);
  if (options.source) console.log(`  Source:     ${resolve(options.source)}`);
  if (options.config) console.log(`  Config:     ${resolve(options.config)}`);
  console.log(`  Device:     ${deviceLabel}`);
  console.log(`  Mode:       ${options.pipelineTesting ? 'Pipeline Testing' : 'Production'}`);
  console.log();

  // === iOS Flow (static-only by default; dynamic requires a jailbroken device) ===
  if (platform === 'ios') {
    const sessionId = options.workspace || `scan-${crypto.randomBytes(4).toString('hex')}`;

    console.log('  [1/3] Starting infrastructure...');
    await ensureInfra();

    let iosDevice: { udid: string; name: string } | undefined;
    if (isUsb) {
      console.log('  [2/3] Checking iOS device...');
      iosDevice = checkIosDevice();
      console.log(`  Found: ${iosDevice.name} (${iosDevice.udid})`);
      try {
        execSync(`ideviceinstaller -u ${iosDevice.udid} -i "${apkPath}"`, { stdio: 'inherit' });
      } catch {
        console.warn('  IPA install failed — may already be installed or device issue');
      }
    } else {
      console.log('  [2/3] iOS static analysis (no device — dynamic needs --device usb + jailbroken device)');
    }

    console.log('  [3/3] Spawning worker...\n');
    const worker = spawnWorker({
      apkPath,
      platform: 'ios',
      sessionId,
      version: options.version,
      pipelineTesting: options.pipelineTesting,
      ...(isUsb && iosDevice
        ? { emulatorHost: 'host.docker.internal', emulatorPort: 27042, deviceUdid: iosDevice.udid }
        : {}),
      ...(options.source && { sourcePath: resolve(options.source) }),
      ...(options.config && { configPath: resolve(options.config) }),
      ...(options.output && { outputPath: resolve(options.output) }),
    });

    console.log(`  Workspace: ${sessionId}`);
    console.log(`  Monitor:   http://localhost:8233`);
    console.log(`  Logs:      viper logs ${sessionId}`);
    console.log();

    worker.on('exit', (code) => {
      if (code === 0) {
        console.log('\n  Pipeline completed successfully.');
        console.log(`  Report: workspaces/${sessionId}/deliverables/executive_report.md`);
      } else {
        console.error(`\n  Pipeline failed (exit code ${code}).`);
        process.exit(code || 1);
      }
    });
    return;
  }

  if (isUsb) {
    // === USB Device Flow ===
    console.log('  [1/4] Checking USB device...');
    const device = checkUsbDevice();
    console.log(`  Found: ${device.model} (${device.serial})`);
    console.log(`  Rooted: ${device.rooted ? 'YES — full dynamic testing available' : 'NO — limited to static + backup + proxy'}`);
    if (!device.rooted) {
      console.log('  TIP: Root your device for full Frida instrumentation support.');
    }
    console.log();

    // 2. Start Temporal only (no emulator needed)
    console.log('  [2/4] Starting infrastructure...');
    await ensureInfra();

    // 3. Install APK on device
    console.log('  [3/4] Installing APK on device...');
    try {
      execSync(`adb -s ${device.serial} install -r "${apkPath}"`, { stdio: 'inherit' });
    } catch {
      console.warn('  APK install failed — may already be installed or device issue');
    }

    // 4. Spawn worker pointing at real device
    console.log('  [4/4] Spawning worker...\n');
    const sessionId = options.workspace || `scan-${crypto.randomBytes(4).toString('hex')}`;

    const worker = spawnWorker({
      apkPath,
      platform: 'android',
      sessionId,
      version: options.version,
      pipelineTesting: options.pipelineTesting,
      emulatorHost: 'host.docker.internal', // Worker in Docker → phone on host
      emulatorPort: 5037, // ADB server port on host
      ...(options.source && { sourcePath: resolve(options.source) }),
      ...(options.config && { configPath: resolve(options.config) }),
      ...(options.output && { outputPath: resolve(options.output) }),
    });

    console.log(`  Device:    ${device.model} (${device.serial})`);
    console.log(`  Workspace: ${sessionId}`);
    console.log(`  Monitor:   http://localhost:8233`);
    console.log(`  Logs:      viper logs ${sessionId}`);
    console.log();

    worker.on('exit', (code) => {
      if (code === 0) {
        console.log('\n  Pipeline completed successfully.');
        console.log(`  Report: workspaces/${sessionId}/deliverables/executive_report.md`);
      } else {
        console.error(`\n  Pipeline failed (exit code ${code}).`);
        process.exit(code || 1);
      }
    });
  } else {
    // === Emulator Flow (original) ===
    console.log('  [1/4] Starting infrastructure...');
    await ensureInfra();

    console.log('  [2/4] Starting Android emulator...');
    await ensureEmulator();

    console.log('  [3/4] Setting up Frida server...');
    setupFridaOnEmulator();

    console.log('  [4/4] Spawning worker...\n');
    const sessionId = options.workspace || `scan-${crypto.randomBytes(4).toString('hex')}`;

    const worker = spawnWorker({
      apkPath,
      platform: 'android',
      sessionId,
      version: options.version,
      pipelineTesting: options.pipelineTesting,
      ...(options.source && { sourcePath: resolve(options.source) }),
      ...(options.config && { configPath: resolve(options.config) }),
      ...(options.output && { outputPath: resolve(options.output) }),
    });

    console.log(`  Workspace: ${sessionId}`);
    console.log(`  Monitor:   http://localhost:8233`);
    console.log(`  Logs:      viper logs ${sessionId}`);
    console.log();

    worker.on('exit', (code) => {
      if (code === 0) {
        console.log('\n  Pipeline completed successfully.');
        console.log(`  Report: workspaces/${sessionId}/deliverables/executive_report.md`);
      } else {
        console.error(`\n  Pipeline failed (exit code ${code}).`);
        process.exit(code || 1);
      }
    });
  }
}
