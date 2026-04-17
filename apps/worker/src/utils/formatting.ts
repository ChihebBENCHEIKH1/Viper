/**
 * Output formatting utilities.
 */

export function formatTimestamp(): string {
  return new Date().toISOString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
