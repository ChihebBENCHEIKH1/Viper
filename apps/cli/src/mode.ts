/**
 * Auto-detect CLI mode: local (cloned repo) vs npx (published package).
 * Local mode activates when VIPER_LOCAL=1 env var is set.
 */

export type CliMode = 'local' | 'npx';

export function getMode(): CliMode {
  return process.env['VIPER_LOCAL'] === '1' ? 'local' : 'npx';
}
