/**
 * Android emulator lifecycle management.
 *
 * Handles:
 * - Emulator boot wait
 * - APK installation
 * - Proxy configuration
 * - Frida server setup
 * - Health checks
 * - Real device support via ADB
 */

import { execSync } from 'node:child_process';
import type { ActivityLogger } from './agent-execution.js';

export type DeviceMode = 'emulator' | 'real-device';

export interface DeviceInfo {
  readonly mode: DeviceMode;
  readonly serial: string;
  readonly model: string;
  readonly apiLevel: number;
  readonly rooted: boolean;
  readonly abiList: string;
}

function adbCommand(args: string, host?: string): string {
  const hostFlag = host ? `-H ${host}` : '';
  return execSync(`adb ${hostFlag} ${args}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
}

export class EmulatorManager {
  private readonly host: string;
  private readonly port: number;
  private readonly logger: ActivityLogger;

  constructor(host: string, port: number, logger: ActivityLogger) {
    this.host = host;
    this.port = port;
    this.logger = logger;
  }

  /** Wait for device to be ready (boot completed) */
  async waitForBoot(timeoutMs: number = 180_000): Promise<void> {
    this.logger.info('Waiting for device boot...');
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const result = adbCommand('shell getprop sys.boot_completed', this.host);
        if (result === '1') {
          this.logger.info('Device booted successfully');
          return;
        }
      } catch {
        // Device not ready yet
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    throw new Error(`Device failed to boot within ${timeoutMs / 1000}s`);
  }

  /** Install APK on device */
  async installApk(apkPath: string): Promise<void> {
    this.logger.info(`Installing APK: ${apkPath}`);
    try {
      adbCommand(`install -r "${apkPath}"`, this.host);
      this.logger.info('APK installed successfully');
    } catch (error) {
      throw new Error(`APK installation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Get device information */
  getDeviceInfo(): DeviceInfo {
    const model = adbCommand('shell getprop ro.product.model', this.host);
    const apiStr = adbCommand('shell getprop ro.build.version.sdk', this.host);
    const abiList = adbCommand('shell getprop ro.product.cpu.abilist', this.host);
    const serial = adbCommand('get-serialno', this.host);

    // Check if rooted
    let rooted = false;
    try {
      const suCheck = adbCommand('shell su -c id', this.host);
      rooted = suCheck.includes('uid=0');
    } catch {
      rooted = false;
    }

    return {
      mode: this.host === 'localhost' || this.host === '127.0.0.1' ? 'real-device' : 'emulator',
      serial,
      model,
      apiLevel: Number.parseInt(apiStr, 10) || 0,
      rooted,
      abiList,
    };
  }

  /** Configure proxy on device for mitmproxy */
  configureProxy(proxyHost: string, proxyPort: number = 8080): void {
    this.logger.info(`Configuring proxy: ${proxyHost}:${proxyPort}`);
    try {
      adbCommand(`shell settings put global http_proxy ${proxyHost}:${proxyPort}`, this.host);
    } catch (error) {
      this.logger.warn(`Proxy configuration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Remove proxy configuration */
  removeProxy(): void {
    try {
      adbCommand('shell settings put global http_proxy :0', this.host);
    } catch {
      // Best-effort
    }
  }

  /** Start Frida server on device */
  async startFrida(): Promise<void> {
    this.logger.info('Starting Frida server...');
    try {
      // Check if already running
      const ps = adbCommand('shell ps -A', this.host);
      if (ps.includes('frida-server')) {
        this.logger.info('Frida server already running');
        return;
      }

      // Start in background
      adbCommand('shell /data/local/tmp/frida-server -D &', this.host);
      await new Promise((r) => setTimeout(r, 2000));

      // Verify
      const verify = adbCommand('shell ps -A', this.host);
      if (verify.includes('frida-server')) {
        this.logger.info('Frida server started');
      } else {
        this.logger.warn('Frida server may not have started — check logs');
      }
    } catch (error) {
      this.logger.warn(`Frida setup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Kill Frida server */
  stopFrida(): void {
    try {
      adbCommand('shell pkill frida-server', this.host);
    } catch {
      // Best-effort
    }
  }

  /** Take a screenshot and pull to local path */
  captureScreenshot(localPath: string): boolean {
    try {
      adbCommand('shell screencap -p /sdcard/viper_screenshot.png', this.host);
      adbCommand(`pull /sdcard/viper_screenshot.png "${localPath}"`, this.host);
      adbCommand('shell rm /sdcard/viper_screenshot.png', this.host);
      return true;
    } catch {
      return false;
    }
  }

  /** Extract APK from an installed app on device */
  extractApk(packageName: string, localPath: string): string {
    this.logger.info(`Extracting APK for ${packageName}...`);
    const apkDevicePath = adbCommand(`shell pm path ${packageName}`, this.host);
    if (!apkDevicePath.startsWith('package:')) {
      throw new Error(`Package not found: ${packageName}`);
    }
    const devicePath = apkDevicePath.replace('package:', '').trim();
    adbCommand(`pull "${devicePath}" "${localPath}"`, this.host);
    this.logger.info(`APK extracted to: ${localPath}`);
    return localPath;
  }

  /** Launch app on device */
  launchApp(packageName: string): void {
    try {
      adbCommand(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`, this.host);
    } catch {
      this.logger.warn('Failed to launch app');
    }
  }

  /** Force-stop app */
  stopApp(packageName: string): void {
    try {
      adbCommand(`shell am force-stop ${packageName}`, this.host);
    } catch {
      // Best-effort
    }
  }
}
