#!/usr/bin/env node

/**
 * Viper entry point — sets VIPER_LOCAL=1 for local mode and delegates to CLI.
 */

process.env.VIPER_LOCAL = '1';

import('./apps/cli/dist/index.js').catch((err) => {
  console.error('Failed to start Viper:', err.message);
  process.exit(1);
});
