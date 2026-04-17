/**
 * Shared log stream primitive — append-only, crash-safe.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class LogStream {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  append(line: string): void {
    appendFileSync(this.filePath, line + '\n');
  }

  appendJson(data: Record<string, unknown>): void {
    this.append(JSON.stringify(data));
  }
}
