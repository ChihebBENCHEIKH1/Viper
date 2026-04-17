/**
 * Secure TOML config persistence.
 * Writes to ~/.viper/config.toml with 0o600 permissions.
 */

import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stringify as tomlStringify } from 'smol-toml';

const VIPER_HOME = join(homedir(), '.viper');
const CONFIG_PATH = join(VIPER_HOME, 'config.toml');

interface ConfigData {
  anthropic?: {
    api_key?: string;
    base_url?: string;
  };
}

export function writeConfig(config: ConfigData): void {
  mkdirSync(VIPER_HOME, { recursive: true });
  const content = tomlStringify(config as Record<string, unknown>);
  writeFileSync(CONFIG_PATH, content, { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
  console.log(`Config saved to ${CONFIG_PATH}`);
}
