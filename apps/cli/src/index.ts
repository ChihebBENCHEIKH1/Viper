/**
 * Viper CLI — AI Android Penetration Testing Framework
 *
 * Unified CLI supporting two modes:
 *   Local mode: Run from cloned repo — builds locally, mounts prompts, uses ./workspaces/
 *   NPX mode:   Run via npx — pulls from Docker Hub, uses ~/.viper/
 *
 * Mode is auto-detected based on VIPER_LOCAL env var.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './commands/build.js';
import { logs } from './commands/logs.js';
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { status } from './commands/status.js';
import { stop } from './commands/stop.js';
import { getMode } from './mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function showHelp(): void {
  const mode = getMode();
  const prefix = mode === 'local' ? './viper' : 'npx @viper/cli';

  console.log(`
Viper - AI Mobile (Android & iOS) Penetration Testing Framework

Usage:${
    mode === 'local'
      ? ''
      : `
  ${prefix} setup                                             Configure credentials`
  }
  ${prefix} start --apk <path> [--source <path>] [options]   Start a pentest scan
  ${prefix} stop [--clean]                                     Stop all containers
  ${prefix} workspaces                                         List all workspaces
  ${prefix} logs <workspace>                                   Tail workflow log
  ${prefix} status                                             Show running workers${
    mode === 'local'
      ? `
  ${prefix} build [--no-cache]                                 Build worker image`
      : ''
  }
  ${prefix} help                                               Show this help

Options for 'start':
  -a, --apk <path>          Artifact: .apk/.aab (Android) or .ipa (iOS) (required)
  -s, --source <path>       Source code path (optional, enables white-box)
  -c, --config <path>       Configuration file (YAML)
  -o, --output <path>       Copy deliverables to this directory
  -w, --workspace <name>    Named workspace (auto-resumes if exists)
      --platform <os>       Override auto-detection: 'android' or 'ios'
      --device <mode>       Device mode: 'usb' (real device), 'emulator' (default)
      --emulator <name>     Android emulator profile (default: API 34)
      --pipeline-testing    Use minimal prompts for fast testing

Platform is auto-detected from the artifact (.apk/.aab => Android, .ipa => iOS).
iOS dynamic testing requires --device usb with a jailbroken device; otherwise iOS
runs static-only on Linux.

Examples:
  ${prefix} start -a ./app-debug.apk
  ${prefix} start -a ./app.apk -s ./android-project --device usb
  ${prefix} start -a ./app.ipa                       # iOS static (auto-detected)
  ${prefix} start -a ./app.ipa --device usb          # iOS dynamic (jailbroken device)
  ${prefix} logs q1-audit
  ${prefix} stop --clean

State directory: ${mode === 'local' ? './workspaces/' : '~/.viper/'}
Monitor workflows at http://localhost:8233
`);
}

export type DeviceMode = 'usb' | 'emulator';

export interface ParsedStartArgs {
  apk: string;
  source?: string;
  config?: string;
  workspace?: string;
  output?: string;
  emulator?: string;
  platform?: 'android' | 'ios';
  deviceMode: DeviceMode;
  pipelineTesting: boolean;
}

function parseStartArgs(argv: string[]): ParsedStartArgs {
  let apk = '';
  let source: string | undefined;
  let config: string | undefined;
  let workspace: string | undefined;
  let output: string | undefined;
  let emulator: string | undefined;
  let platform: 'android' | 'ios' | undefined;
  let deviceMode: DeviceMode = 'emulator';
  let pipelineTesting = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '-a':
      case '--apk':
        if (next && !next.startsWith('-')) {
          apk = next;
          i++;
        }
        break;
      case '-s':
      case '--source':
        if (next && !next.startsWith('-')) {
          source = next;
          i++;
        }
        break;
      case '-c':
      case '--config':
        if (next && !next.startsWith('-')) {
          config = next;
          i++;
        }
        break;
      case '-w':
      case '--workspace':
        if (next && !next.startsWith('-')) {
          workspace = next;
          i++;
        }
        break;
      case '-o':
      case '--output':
        if (next && !next.startsWith('-')) {
          output = next;
          i++;
        }
        break;
      case '--platform':
        if (next && (next === 'android' || next === 'ios')) {
          platform = next;
          i++;
        } else {
          console.error("ERROR: --platform must be 'android' or 'ios'");
          process.exit(1);
        }
        break;
      case '--device':
        if (next && (next === 'usb' || next === 'emulator')) {
          deviceMode = next;
          i++;
        }
        break;
      case '--emulator':
        if (next && !next.startsWith('-')) {
          emulator = next;
          i++;
        }
        break;
      case '--pipeline-testing':
        pipelineTesting = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.error(`Run "${getMode() === 'local' ? './viper' : 'npx @viper/cli'} help" for usage`);
        process.exit(1);
    }
  }

  if (!apk) {
    console.error('ERROR: --apk is required');
    console.error(
      `Usage: ${getMode() === 'local' ? './viper' : 'npx @viper/cli'} start -a <apk-path> [-s <source-path>]`,
    );
    process.exit(1);
  }

  return {
    apk,
    deviceMode,
    pipelineTesting,
    ...(source && { source }),
    ...(config && { config }),
    ...(workspace && { workspace }),
    ...(output && { output }),
    ...(emulator && { emulator }),
    ...(platform && { platform }),
  };
}

// === Main Dispatch ===

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'start': {
    const parsed = parseStartArgs(args.slice(1));
    await start({ ...parsed, version: getVersion() });
    break;
  }
  case 'stop':
    stop(args.includes('--clean'));
    break;
  case 'logs': {
    const workspaceId = args[1];
    if (!workspaceId) {
      console.error('ERROR: Workspace ID is required');
      console.error(`Usage: ${getMode() === 'local' ? './viper' : 'npx @viper/cli'} logs <workspace>`);
      process.exit(1);
    }
    logs(workspaceId);
    break;
  }
  case 'workspaces':
    console.log('Workspace listing not yet implemented.');
    break;
  case 'status':
    status();
    break;
  case 'setup':
    if (getMode() === 'local') {
      console.error('ERROR: setup is only available in npx mode. In local mode, use .env');
      process.exit(1);
    }
    setup();
    break;
  case 'build':
    build(args.includes('--no-cache'));
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
