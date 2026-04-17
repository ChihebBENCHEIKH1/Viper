/**
 * Error classification for Temporal retry decisions.
 *
 * Multi-layer classification:
 * 1. ViperError with ErrorCode (most reliable)
 * 2. String pattern matching (fallback for external errors)
 */

import { ErrorCode, ViperError } from '../types/errors.js';

interface ErrorClassification {
  readonly type: string;
  readonly retryable: boolean;
}

// === Code-Based Classification ===

const NON_RETRYABLE_CODES = new Set<ErrorCode>([
  ErrorCode.CONFIG_NOT_FOUND,
  ErrorCode.CONFIG_VALIDATION_FAILED,
  ErrorCode.APK_NOT_FOUND,
  ErrorCode.APK_INVALID,
  ErrorCode.PROMPT_LOAD_FAILED,
]);

function classifyByErrorCode(code: ErrorCode, retryable: boolean): ErrorClassification {
  if (NON_RETRYABLE_CODES.has(code)) {
    return { type: code, retryable: false };
  }
  return { type: code, retryable };
}

// === String Pattern Matching ===

const BILLING_API_PATTERNS = ['invalid_request_error', 'spending', 'billing'];
const BILLING_TEXT_PATTERNS = [/spending cap/i, /billing limit/i, /insufficient credit/i];

const NON_RETRYABLE_PATTERNS = [
  'authentication',
  'invalid prompt',
  'out of memory',
  'permission denied',
  'session limit reached',
  'invalid api key',
];

function matchesBillingPattern(message: string): boolean {
  const lower = message.toLowerCase();

  const matchesApi = BILLING_API_PATTERNS.some((p) => lower.includes(p));
  if (matchesApi) return true;

  return BILLING_TEXT_PATTERNS.some((p) => p.test(message));
}

function matchesNonRetryablePattern(message: string): boolean {
  const lower = message.toLowerCase();
  return NON_RETRYABLE_PATTERNS.some((p) => lower.includes(p));
}

// === Public API ===

export function classifyErrorForTemporal(error: unknown): ErrorClassification {
  // 1. ViperError with ErrorCode — most reliable
  if (error instanceof ViperError && error.code !== undefined) {
    return classifyByErrorCode(error.code, error.retryable);
  }

  // 2. String matching fallback
  const message = error instanceof Error ? error.message : String(error);

  if (matchesBillingPattern(message)) {
    return { type: 'BillingError', retryable: true };
  }

  if (matchesNonRetryablePattern(message)) {
    return { type: 'NonRetryableError', retryable: false };
  }

  // Default: retryable (fail-safe — let Temporal decide)
  return { type: 'TransientError', retryable: true };
}

/** Detect spending cap behavior from agent output patterns */
export function isSpendingCapBehavior(turnCount: number, totalCost: number, result: string): boolean {
  // Spending cap: agent runs very few turns with $0 cost, and produces generic output
  if (turnCount <= 3 && totalCost === 0 && result.length < 200) {
    return true;
  }
  return false;
}
