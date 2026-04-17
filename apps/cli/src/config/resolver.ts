/**
 * Cascading config resolution for npx mode.
 * Priority: env vars > ~/.viper/config.toml
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from 'smol-toml';

const VIPER_HOME = join(homedir(), '.viper');
const CONFIG_PATH = join(VIPER_HOME, 'config.toml');

interface ResolvedConfig {
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
}

export function resolveConfig(): ResolvedConfig {
  const config: ResolvedConfig = {};

  // 1. Check environment variables first (highest priority)
  if (process.env['ANTHROPIC_API_KEY']) {
    config.anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  }
  if (process.env['ANTHROPIC_BASE_URL']) {
    config.anthropicBaseUrl = process.env['ANTHROPIC_BASE_URL'];
  }

  // 2. Fall back to TOML config
  if (!config.anthropicApiKey && existsSync(CONFIG_PATH)) {
    // Check file permissions (reject if world-readable)
    const stat = statSync(CONFIG_PATH);
    const mode = stat.mode & 0o077;
    if (mode !== 0) {
      console.warn(`WARNING: ${CONFIG_PATH} has insecure permissions (mode ${mode.toString(8)}). Run: chmod 600 ${CONFIG_PATH}`);
    }

    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8');
      const toml = parseToml(content) as { anthropic?: { api_key?: string; base_url?: string } };

      if (toml.anthropic?.api_key) {
        config.anthropicApiKey = toml.anthropic.api_key;
      }
      if (toml.anthropic?.base_url) {
        config.anthropicBaseUrl = toml.anthropic.base_url;
      }
    } catch (error) {
      console.error(`Failed to parse ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return config;
}

export function applyConfig(config: ResolvedConfig): void {
  if (config.anthropicApiKey && !process.env['ANTHROPIC_API_KEY']) {
    process.env['ANTHROPIC_API_KEY'] = config.anthropicApiKey;
  }
  if (config.anthropicBaseUrl && !process.env['ANTHROPIC_BASE_URL']) {
    process.env['ANTHROPIC_BASE_URL'] = config.anthropicBaseUrl;
  }
}
