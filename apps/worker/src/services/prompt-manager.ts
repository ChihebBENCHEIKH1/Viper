/**
 * Prompt template loading, @include directive processing, and variable interpolation.
 *
 * Three-layer system:
 * 1. Template resolution (full vs pipeline-testing prompts)
 * 2. Include directives (@include(shared/_target.txt))
 * 3. Variable interpolation ({{APK_PATH}}, {{DEVICE_CONTEXT}}, etc.)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

import { PROMPTS_DIR } from '../paths.js';
import type { DistributedConfig } from '../types/config.js';
import type { ActivityLogger } from './agent-execution.js';

export interface PromptVariables {
  readonly apkPath: string;
  readonly sourcePath?: string;
  readonly decompiledDir: string;
  readonly emulatorHost: string;
  readonly emulatorPort: number;
  readonly packageName?: string;
  readonly apiLevel?: number;
}

// === Include Processing ===

const INCLUDE_REGEX = /@include\(([^)]+)\)/g;
const MAX_INCLUDE_DEPTH = 5;

async function processIncludes(content: string, baseDir: string, depth: number = 0): Promise<string> {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`Include depth exceeded (max ${MAX_INCLUDE_DEPTH})`);
  }

  let result = content;
  let match: RegExpExecArray | null;

  // Reset regex state
  INCLUDE_REGEX.lastIndex = 0;

  // Collect all includes first to avoid regex state issues
  const includes: Array<{ full: string; path: string }> = [];
  while ((match = INCLUDE_REGEX.exec(content)) !== null) {
    includes.push({ full: match[0], path: match[1] ?? '' });
  }

  for (const inc of includes) {
    const includePath = resolve(baseDir, inc.path);

    // Path traversal check
    if (!includePath.startsWith(resolve(baseDir))) {
      throw new Error(`Include path traversal detected: ${inc.path}`);
    }

    if (!existsSync(includePath)) {
      throw new Error(`Include file not found: ${inc.path}`);
    }

    const includeContent = readFileSync(includePath, 'utf-8');
    const processed = await processIncludes(includeContent, dirname(includePath), depth + 1);
    result = result.replace(inc.full, processed);
  }

  return result;
}

// === Variable Interpolation ===

function interpolateVariables(
  template: string,
  variables: PromptVariables,
  config: DistributedConfig,
): string {
  let result = template;

  // Core variables
  result = result.replace(/\{\{APK_PATH\}\}/g, variables.apkPath);
  result = result.replace(/\{\{SOURCE_PATH\}\}/g, variables.sourcePath || '(not available — black-box mode)');
  result = result.replace(/\{\{DECOMPILED_PATH\}\}/g, variables.decompiledDir);
  result = result.replace(/\{\{EMULATOR_HOST\}\}/g, variables.emulatorHost);
  result = result.replace(/\{\{EMULATOR_PORT\}\}/g, String(variables.emulatorPort));
  result = result.replace(/\{\{PACKAGE_NAME\}\}/g, variables.packageName || '(extract from AndroidManifest.xml)');
  result = result.replace(/\{\{API_LEVEL\}\}/g, String(variables.apiLevel || 34));

  // Config context
  result = result.replace(/\{\{DESCRIPTION\}\}/g, config.description || '');

  // Rules
  const avoidRules = config.avoid.length > 0
    ? config.avoid.map((r) => `- ${r.description} (${r.type}: ${r.value})`).join('\n')
    : 'None specified';
  result = result.replace(/\{\{RULES_AVOID\}\}/g, avoidRules);

  const focusRules = config.focus.length > 0
    ? config.focus.map((r) => `- ${r.description} (${r.type}: ${r.value})`).join('\n')
    : 'None specified';
  result = result.replace(/\{\{RULES_FOCUS\}\}/g, focusRules);

  // Auth context
  if (config.authentication) {
    const auth = config.authentication;
    const authContext = [
      `Credentials available: username="${auth.credentials.username}"`,
      auth.credentials.pin ? `PIN: "${auth.credentials.pin}"` : null,
      auth.credentials.totp_secret ? 'TOTP 2FA: configured' : null,
      auth.login_flow ? `Login flow:\n${auth.login_flow.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}` : null,
    ].filter(Boolean).join('\n');
    result = result.replace(/\{\{AUTH_CONTEXT\}\}/g, authContext);
  } else {
    result = result.replace(/\{\{AUTH_CONTEXT\}\}/g, 'No authentication credentials provided.');
  }

  return result;
}

// === Public API ===

export async function loadAndPreparePrompt(
  promptName: string,
  variables: PromptVariables,
  config: DistributedConfig,
  pipelineTestingMode: boolean,
  logger: ActivityLogger,
): Promise<string> {
  // 1. Resolve template path
  const promptsDir = pipelineTestingMode
    ? join(PROMPTS_DIR, 'pipeline-testing')
    : PROMPTS_DIR;

  const promptPath = join(promptsDir, `${promptName}.txt`);

  if (!existsSync(promptPath)) {
    throw new Error(`Prompt template not found: ${promptPath}`);
  }

  // 2. Load and process includes
  const rawTemplate = readFileSync(promptPath, 'utf-8');
  const withIncludes = await processIncludes(rawTemplate, dirname(promptPath));

  // 3. Interpolate variables
  const final = interpolateVariables(withIncludes, variables, config);

  // 4. Warn on unresolved placeholders
  const unresolved = final.match(/\{\{[^}]+\}\}/g);
  if (unresolved) {
    logger.warn(`Unresolved placeholders: ${unresolved.join(', ')}`);
  }

  return final;
}
