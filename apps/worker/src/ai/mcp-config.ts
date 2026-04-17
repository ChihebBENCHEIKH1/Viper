/**
 * MCP server configuration generator for Viper agents.
 *
 * Generates per-agent MCP config files with the appropriate servers:
 * - Static analysis agents: no MCP servers (CLI tools only)
 * - Recon + Vuln + Exploit agents: Appium + Frida + Android-MCP
 * - Network agents additionally get mitmproxy control
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentPhase } from '../types/agents.js';

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Create a temporary MCP config file with mobile testing servers.
 * Returns the path to the config file, or undefined for static-analysis phase.
 */
export function createMcpConfigFile(
  cwd: string,
  agentId: string,
  phase: AgentPhase,
  emulatorHost: string,
  emulatorPort: number,
): string | undefined {
  // Static analysis runs offline — no MCP servers needed
  if (phase === 'static-analysis') {
    return undefined;
  }

  const npxPath = process.env['NPX_PATH'] || '/usr/bin/npx';
  const config: McpConfig = { mcpServers: {} };

  // Appium MCP — UI automation on emulator
  config.mcpServers['appium'] = {
    command: npxPath,
    args: ['-y', 'appium-mcp@latest'],
    env: {
      APPIUM_HOST: emulatorHost,
      APPIUM_PORT: '4723',
    },
  };

  // Frida MCP — runtime instrumentation, method hooking, SSL pinning bypass
  config.mcpServers['frida'] = {
    command: npxPath,
    args: ['-y', 'frida-mcp'],
    env: {
      FRIDA_HOST: emulatorHost,
      FRIDA_PORT: '27042',
    },
  };

  // Android-MCP — ADB device control, file pull, logcat, component interaction
  config.mcpServers['android'] = {
    command: npxPath,
    args: ['-y', 'android-mcp'],
    env: {
      ADB_HOST: emulatorHost,
      ADB_PORT: String(emulatorPort),
    },
  };

  // Network agents get mitmproxy access
  if (agentId.includes('network')) {
    config.mcpServers['mitmproxy'] = {
      command: npxPath,
      args: ['-y', 'mitmproxy-mcp'],
      env: {
        MITMPROXY_HOST: emulatorHost,
        MITMPROXY_PORT: '8080',
      },
    };
  }

  // Write per-agent config file
  const mcpDir = join(cwd, '.viper', '.mcp');
  mkdirSync(mcpDir, { recursive: true });

  const configPath = join(mcpDir, `mcp-${agentId}.json`);
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  return configPath;
}
