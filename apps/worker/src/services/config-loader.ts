/**
 * YAML config loading and validation service.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import yaml from 'js-yaml';

import type { Config, DistributedConfig, Rule } from '../types/config.js';
import { ErrorCode, ViperError } from '../types/errors.js';
import { type Result, ok, err } from '../types/result.js';

const MAX_CONFIG_SIZE = 1024 * 1024; // 1MB

export class ConfigLoaderService {
  async loadOptional(configPath: string | undefined): Promise<Result<Config | null, ViperError>> {
    if (!configPath) return ok(null);

    if (!existsSync(configPath)) {
      return err(new ViperError(
        `Config file not found: ${configPath}`,
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_NOT_FOUND,
      ));
    }

    return this.load(configPath);
  }

  async load(configPath: string): Promise<Result<Config, ViperError>> {
    try {
      // 1. Check file size
      const stat = statSync(configPath);
      if (stat.size > MAX_CONFIG_SIZE) {
        return err(new ViperError(
          `Config file too large: ${stat.size} bytes (max ${MAX_CONFIG_SIZE})`,
          'config',
          false,
          { configPath, size: stat.size },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        ));
      }

      // 2. Read and parse YAML (FAILSAFE_SCHEMA — no JS evaluation)
      const content = readFileSync(configPath, 'utf-8');
      if (!content.trim()) {
        return err(new ViperError(
          'Config file is empty',
          'config',
          false,
          { configPath },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        ));
      }

      const parsed = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA }) as Config | null;
      if (!parsed || typeof parsed !== 'object') {
        return err(new ViperError(
          'Config file parsed to null or non-object',
          'config',
          false,
          { configPath },
          ErrorCode.CONFIG_PARSE_FAILED,
        ));
      }

      // TODO: Add AJV JSON Schema validation

      return ok(parsed);
    } catch (error) {
      return err(new ViperError(
        `Failed to parse config: ${error instanceof Error ? error.message : String(error)}`,
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_PARSE_FAILED,
      ));
    }
  }
}

/** Normalize config into a standard form distributed to agents */
export function distributeConfig(config: Config | null): DistributedConfig {
  return {
    avoid: config?.rules?.avoid ? [...config.rules.avoid] : [],
    focus: config?.rules?.focus ? [...config.rules.focus] : [],
    authentication: config?.authentication || null,
    description: config?.description?.trim() || '',
    emulator: config?.emulator || { api_level: 34 },
  };
}
