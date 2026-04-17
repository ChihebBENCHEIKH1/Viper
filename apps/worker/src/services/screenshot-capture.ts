/**
 * Screenshot evidence capture during exploitation.
 *
 * Captures before/after screenshots of app state as exploitation proof.
 * Stores screenshots with metadata in the deliverables directory.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatTimestamp } from '../utils/formatting.js';

export interface ScreenshotEvidence {
  readonly filename: string;
  readonly timestamp: string;
  readonly description: string;
  readonly agentName: string;
  readonly findingId?: string;
}

export class ScreenshotCaptureService {
  private readonly evidenceDir: string;
  private readonly screenshots: ScreenshotEvidence[] = [];

  constructor(workspaceDir: string) {
    this.evidenceDir = join(workspaceDir, 'screenshots');
    mkdirSync(this.evidenceDir, { recursive: true });
  }

  /**
   * Capture a screenshot from the emulator via ADB.
   * Returns the local file path of the saved screenshot.
   */
  capture(
    description: string,
    agentName: string,
    findingId?: string,
    emulatorHost: string = 'viper-emulator',
  ): string | null {
    const timestamp = Date.now();
    const filename = `${agentName}_${timestamp}.png`;
    const localPath = join(this.evidenceDir, filename);

    try {
      // Capture screenshot on device
      execSync(
        `docker exec ${emulatorHost} adb shell screencap -p /sdcard/screenshot.png`,
        { stdio: 'pipe' },
      );

      // Pull to local
      execSync(
        `docker exec ${emulatorHost} adb pull /sdcard/screenshot.png ${localPath}`,
        { stdio: 'pipe' },
      );

      // Clean up device
      execSync(
        `docker exec ${emulatorHost} adb shell rm /sdcard/screenshot.png`,
        { stdio: 'pipe' },
      );

      const evidence: ScreenshotEvidence = {
        filename,
        timestamp: formatTimestamp(),
        description,
        agentName,
        ...(findingId && { findingId }),
      };

      this.screenshots.push(evidence);
      return localPath;
    } catch {
      // Screenshot capture is best-effort
      return null;
    }
  }

  /** Capture logcat output as text evidence */
  captureLogcat(
    filter: string,
    agentName: string,
    emulatorHost: string = 'viper-emulator',
  ): string | null {
    const filename = `${agentName}_logcat_${Date.now()}.txt`;
    const localPath = join(this.evidenceDir, filename);

    try {
      const output = execSync(
        `docker exec ${emulatorHost} adb logcat -d | grep -iE "${filter}"`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );

      writeFileSync(localPath, output);
      return localPath;
    } catch {
      return null;
    }
  }

  /** Get all captured screenshots for the report */
  getAll(): readonly ScreenshotEvidence[] {
    return this.screenshots;
  }

  /** Generate markdown evidence section for the report */
  formatForReport(): string {
    if (this.screenshots.length === 0) return 'No screenshot evidence captured.';

    const lines: string[] = ['### Screenshot Evidence\n'];
    for (const s of this.screenshots) {
      lines.push(`- **${s.description}** (${s.agentName}, ${s.timestamp})`);
      lines.push(`  File: \`screenshots/${s.filename}\``);
      if (s.findingId) lines.push(`  Finding: ${s.findingId}`);
    }
    return lines.join('\n');
  }
}
