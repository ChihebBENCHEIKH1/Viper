/**
 * Centralized path constants for the worker package.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of the worker package (one level up from src/) */
export const WORKER_ROOT = join(__dirname, '..');

/** Prompt templates directory */
export const PROMPTS_DIR = join(WORKER_ROOT, 'prompts');

/** Config schemas directory */
export const CONFIGS_DIR = join(WORKER_ROOT, 'configs');

/** Workspaces root — overridable via VIPER_WORKSPACES_DIR */
export const WORKSPACES_DIR = process.env['VIPER_WORKSPACES_DIR'] || join(process.cwd(), 'workspaces');

/** Deliverables subdirectory within the target repo */
export const DELIVERABLES_SUBDIR = '.viper/deliverables';

/** MCP config subdirectory within the target repo */
export const MCP_SUBDIR = '.viper/.mcp';

/** Decompiled source subdirectory within the workspace */
export const DECOMPILED_SUBDIR = 'decompiled';
