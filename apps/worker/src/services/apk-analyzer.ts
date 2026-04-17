/**
 * APK static analysis orchestration.
 *
 * Runs JADX and APKTool for decompilation, then extracts key metadata.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ActivityLogger } from './agent-execution.js';

export interface ApkMetadata {
  readonly packageName: string;
  readonly versionName: string;
  readonly versionCode: string;
  readonly minSdk: number;
  readonly targetSdk: number;
  readonly permissions: readonly string[];
  readonly exportedActivities: readonly string[];
  readonly exportedServices: readonly string[];
  readonly exportedReceivers: readonly string[];
  readonly exportedProviders: readonly string[];
  readonly allowBackup: boolean;
  readonly debuggable: boolean;
  readonly hasNetworkSecurityConfig: boolean;
}

export class ApkAnalyzer {
  /** Run JADX decompilation (APK → Java source) */
  async decompileWithJadx(apkPath: string, outputDir: string, logger: ActivityLogger): Promise<void> {
    const jadxDir = join(outputDir, 'jadx');
    mkdirSync(jadxDir, { recursive: true });

    logger.info(`Running JADX: ${apkPath} → ${jadxDir}`);
    try {
      execSync(`jadx -d "${jadxDir}" "${apkPath}" --no-debug-info --deobf`, {
        stdio: 'pipe',
        timeout: 300_000, // 5 minutes
      });
      logger.info('JADX decompilation complete');
    } catch (error) {
      logger.warn(`JADX completed with warnings: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
    }
  }

  /** Run APKTool extraction (APK → resources, manifest, smali) */
  async extractWithApktool(apkPath: string, outputDir: string, logger: ActivityLogger): Promise<void> {
    const apktoolDir = join(outputDir, 'apktool');
    mkdirSync(apktoolDir, { recursive: true });

    logger.info(`Running APKTool: ${apkPath} → ${apktoolDir}`);
    try {
      execSync(`apktool d -f -o "${apktoolDir}" "${apkPath}"`, {
        stdio: 'pipe',
        timeout: 120_000, // 2 minutes
      });
      logger.info('APKTool extraction complete');
    } catch (error) {
      logger.warn(`APKTool: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
    }
  }

  /** Parse AndroidManifest.xml for key metadata */
  parseManifest(apktoolDir: string): ApkMetadata | null {
    const manifestPath = join(apktoolDir, 'AndroidManifest.xml');
    if (!existsSync(manifestPath)) return null;

    const content = readFileSync(manifestPath, 'utf-8');

    // Extract package name
    const packageMatch = content.match(/package="([^"]+)"/);
    const packageName = packageMatch?.[1] || 'unknown';

    // Extract version
    const versionNameMatch = content.match(/android:versionName="([^"]+)"/);
    const versionCodeMatch = content.match(/android:versionCode="([^"]+)"/);

    // Extract SDK versions
    const minSdkMatch = content.match(/android:minSdkVersion="(\d+)"/);
    const targetSdkMatch = content.match(/android:targetSdkVersion="(\d+)"/);

    // Extract permissions
    const permissions = [...content.matchAll(/uses-permission android:name="([^"]+)"/g)]
      .map((m) => m[1] || '');

    // Extract exported components
    const exportedActivities = this.findExportedComponents(content, 'activity');
    const exportedServices = this.findExportedComponents(content, 'service');
    const exportedReceivers = this.findExportedComponents(content, 'receiver');
    const exportedProviders = this.findExportedComponents(content, 'provider');

    // Flags
    const allowBackup = !content.includes('android:allowBackup="false"');
    const debuggable = content.includes('android:debuggable="true"');
    const hasNetworkSecurityConfig = content.includes('android:networkSecurityConfig');

    return {
      packageName,
      versionName: versionNameMatch?.[1] || 'unknown',
      versionCode: versionCodeMatch?.[1] || '0',
      minSdk: Number.parseInt(minSdkMatch?.[1] || '21', 10),
      targetSdk: Number.parseInt(targetSdkMatch?.[1] || '34', 10),
      permissions,
      exportedActivities,
      exportedServices,
      exportedReceivers,
      exportedProviders,
      allowBackup,
      debuggable,
      hasNetworkSecurityConfig,
    };
  }

  private findExportedComponents(manifest: string, type: string): string[] {
    // Components with android:exported="true" or with intent-filters (implicitly exported)
    const regex = new RegExp(
      `<${type}[^>]*android:name="([^"]+)"[^>]*(?:android:exported="true"|>[\\s\\S]*?<intent-filter)`,
      'g',
    );
    const results: string[] = [];
    let match;
    while ((match = regex.exec(manifest)) !== null) {
      if (match[1]) results.push(match[1]);
    }
    return results;
  }

  /** Full analysis pipeline */
  async analyze(apkPath: string, decompiledDir: string, logger: ActivityLogger): Promise<ApkMetadata | null> {
    // 1. Decompile
    await this.decompileWithJadx(apkPath, decompiledDir, logger);
    await this.extractWithApktool(apkPath, decompiledDir, logger);

    // 2. Parse manifest
    const apktoolDir = join(decompiledDir, 'apktool');
    return this.parseManifest(apktoolDir);
  }
}
