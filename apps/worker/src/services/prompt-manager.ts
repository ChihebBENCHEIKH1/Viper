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
import type { Platform } from '../types/platform.js';

export interface PromptVariables {
  /** @deprecated alias for artifactPath. */
  readonly apkPath: string;
  readonly artifactPath: string;
  readonly platform: Platform;
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

async function processIncludes(
  content: string,
  baseDir: string,
  platform: Platform,
  depth: number = 0,
): Promise<string> {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`Include depth exceeded (max ${MAX_INCLUDE_DEPTH})`);
  }

  // Resolve {{PLATFORM}} BEFORE include resolution so paths like
  // @include(shared/_{{PLATFORM}}-attacks.txt) select the right per-platform file.
  content = content.replace(/\{\{PLATFORM\}\}/g, platform);

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
    const processed = await processIncludes(includeContent, dirname(includePath), platform, depth + 1);
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

  // Platform-derived context (Android vs iOS)
  const isIos = variables.platform === 'ios';
  const manifest = isIos ? 'Info.plist (inside Payload/*.app/)' : 'AndroidManifest.xml';
  const decompileCmds = isIos
    ? [
        `Unzip IPA:      unzip -o "${variables.artifactPath}" -d "${variables.decompiledDir}/extracted"`,
        `App bundle:     ${variables.decompiledDir}/extracted/Payload/*.app/`,
        `Plists:         plistutil -i <app>/Info.plist   (also scan *.plist + embedded.mobileprovision)`,
        `Entitlements:   codesign -d --entitlements :- <app>   (or strings the binary)`,
        `Mach-O:         otool -hlL <app>/<binary>; nm; strings; python3 -c "import lief"`,
        `Class metadata: class-dump <app>/<binary>   (Objective-C); demangle Swift symbols`,
      ].join('\n')
    : [
        `Decompile (Java/Kotlin):  jadx -d "${variables.decompiledDir}/jadx" "${variables.artifactPath}"`,
        `Resources + manifest:     apktool d -o "${variables.decompiledDir}/apktool" "${variables.artifactPath}"`,
      ].join('\n');
  const deviceContext = isIos
    ? `iOS: STATIC-ONLY unless a jailbroken device is attached. When dynamic, Frida server at ${variables.emulatorHost}:${variables.emulatorPort}.`
    : `Android emulator at ${variables.emulatorHost}:${variables.emulatorPort} with Frida server running.`;
  const packageDefault = isIos
    ? '(extract CFBundleIdentifier from Info.plist)'
    : '(extract from AndroidManifest.xml)';
  const binaryHardening = isIos
    ? [
        '  ```bash',
        `  BIN=$(find "${variables.decompiledDir}/extracted/Payload" -maxdepth 2 -type f -perm -u+x | head -1)`,
        '  otool -hv "$BIN" | grep -i PIE                 # position-independent executable',
        '  otool -Iv "$BIN" | grep -i stack_chk           # stack canaries (__stack_chk_*)',
        '  otool -Iv "$BIN" | grep -i objc_release        # ARC (automatic ref counting)',
        '  otool -arch all -l "$BIN" | grep -A4 LC_ENCRYPTION_INFO   # App Store binary encryption (cryptid)',
        '  strings "$BIN" | grep -Ei "ptrace|PT_DENY_ATTACH|jailb|cydia|/bin/sh"  # anti-debug / JB detection',
        '  ```',
        '  Flag: missing PIE, missing stack canaries, no ARC, cryptid=0 (decryptable), and absent jailbreak/anti-debug detection.',
      ].join('\n')
    : [
        '  ```bash',
        `  for so in $(find "${variables.decompiledDir}/apktool/lib" -name "*.so"); do`,
        '    echo "=== $so ===" && readelf -l "$so" 2>/dev/null | grep -E "GNU_RELRO|GNU_STACK"',
        '  done',
        '  ```',
      ].join('\n');

  // Core variables
  result = result.replace(/\{\{PLATFORM\}\}/g, variables.platform);
  result = result.replace(/\{\{ARTIFACT_PATH\}\}/g, variables.artifactPath);
  result = result.replace(/\{\{APK_PATH\}\}/g, variables.artifactPath); // back-compat alias
  result = result.replace(/\{\{MANIFEST\}\}/g, manifest);
  result = result.replace(/\{\{DECOMPILE_CMDS\}\}/g, decompileCmds);
  result = result.replace(/\{\{BINARY_HARDENING_CHECK\}\}/g, binaryHardening);
  result = result.replace(/\{\{DEVICE_CONTEXT\}\}/g, deviceContext);
  result = result.replace(/\{\{SOURCE_PATH\}\}/g, variables.sourcePath || '(not available — black-box mode)');
  result = result.replace(/\{\{DECOMPILED_PATH\}\}/g, variables.decompiledDir);
  result = result.replace(/\{\{EMULATOR_HOST\}\}/g, variables.emulatorHost);
  result = result.replace(/\{\{EMULATOR_PORT\}\}/g, String(variables.emulatorPort));
  result = result.replace(/\{\{PACKAGE_NAME\}\}/g, variables.packageName || packageDefault);
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
  const withIncludes = await processIncludes(rawTemplate, dirname(promptPath), variables.platform);

  // 3. Interpolate variables
  const final = interpolateVariables(withIncludes, variables, config);

  // 4. Warn on unresolved placeholders
  const unresolved = final.match(/\{\{[^}]+\}\}/g);
  if (unresolved) {
    logger.warn(`Unresolved placeholders: ${unresolved.join(', ')}`);
  }

  return final;
}
