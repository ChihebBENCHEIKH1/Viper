/**
 * Consolidated billing/spending cap detection utilities.
 *
 * Anthropic's spending cap behavior is inconsistent:
 * - Sometimes a proper SDK error (billing_error)
 * - Sometimes Claude responds with text about the cap
 * - Sometimes partial billing before cutoff
 *
 * Defense-in-depth detection with shared pattern lists to prevent drift.
 */

/** Text patterns for SDK output sniffing (what Claude says) */
export const BILLING_TEXT_PATTERNS = [
  'spending cap',
  'spending limit',
  'cap reached',
  'budget exceeded',
  'usage limit',
  'resets',
] as const;

/** API patterns for error message classification (what the API returns) */
export const BILLING_API_PATTERNS = [
  'billing_error',
  'credit balance is too low',
  'insufficient credits',
  'usage is blocked due to insufficient credits',
  'please visit plans & billing',
  'please visit plans and billing',
  'usage limit reached',
  'quota exceeded',
  'daily rate limit',
  'limit will reset',
  'billing limit reached',
] as const;

/** Checks if text matches any billing text pattern */
export function matchesBillingTextPattern(text: string): boolean {
  const lower = text.toLowerCase();
  return BILLING_TEXT_PATTERNS.some((p) => lower.includes(p));
}

/** Checks if an error message matches any billing API pattern */
export function matchesBillingApiPattern(message: string): boolean {
  const lower = message.toLowerCase();
  return BILLING_API_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Behavioral heuristic for detecting spending cap.
 * When Claude hits a spending cap, it returns a short message with $0 cost.
 * Legitimate agent work NEVER costs $0 with only 1-2 turns.
 */
export function isSpendingCapBehavior(turns: number, cost: number, resultText: string): boolean {
  if (turns > 2 || cost !== 0) {
    return false;
  }
  return matchesBillingTextPattern(resultText);
}
