/**
 * CVSS v4.0 auto-calculator for mobile vulnerabilities.
 *
 * Calculates CVSS scores based on vulnerability characteristics.
 * Provides structured scoring for the executive report.
 */

export type AttackVector = 'Network' | 'Adjacent' | 'Local' | 'Physical';
export type AttackComplexity = 'Low' | 'High';
export type PrivilegesRequired = 'None' | 'Low' | 'High';
export type UserInteraction = 'None' | 'Passive' | 'Active';
export type Impact = 'None' | 'Low' | 'High';

export interface CvssMetrics {
  readonly attackVector: AttackVector;
  readonly attackComplexity: AttackComplexity;
  readonly privilegesRequired: PrivilegesRequired;
  readonly userInteraction: UserInteraction;
  readonly confidentiality: Impact;
  readonly integrity: Impact;
  readonly availability: Impact;
}

export interface CvssResult {
  readonly score: number;
  readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  readonly vector: string;
  readonly metrics: CvssMetrics;
}

// Simplified CVSS calculation (approximate base score)
const AV_WEIGHTS: Record<AttackVector, number> = { Network: 0.85, Adjacent: 0.62, Local: 0.55, Physical: 0.20 };
const AC_WEIGHTS: Record<AttackComplexity, number> = { Low: 0.77, High: 0.44 };
const PR_WEIGHTS: Record<PrivilegesRequired, number> = { None: 0.85, Low: 0.62, High: 0.27 };
const UI_WEIGHTS: Record<UserInteraction, number> = { None: 0.85, Passive: 0.62, Active: 0.27 };
const I_WEIGHTS: Record<Impact, number> = { High: 0.56, Low: 0.22, None: 0 };

function calculateBaseScore(metrics: CvssMetrics): number {
  const exploitability = 8.22 * AV_WEIGHTS[metrics.attackVector] * AC_WEIGHTS[metrics.attackComplexity]
    * PR_WEIGHTS[metrics.privilegesRequired] * UI_WEIGHTS[metrics.userInteraction];

  const impactBase = 1 - (1 - I_WEIGHTS[metrics.confidentiality])
    * (1 - I_WEIGHTS[metrics.integrity])
    * (1 - I_WEIGHTS[metrics.availability]);

  if (impactBase <= 0) return 0;

  const impact = 6.42 * impactBase;
  const score = Math.min(10, 1.08 * (impact + exploitability));
  return Math.round(score * 10) / 10;
}

function getSeverity(score: number): CvssResult['severity'] {
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'NONE';
}

function buildVector(metrics: CvssMetrics): string {
  return `CVSS:4.0/AV:${metrics.attackVector[0]}/AC:${metrics.attackComplexity[0]}/PR:${metrics.privilegesRequired[0]}/UI:${metrics.userInteraction[0]}/C:${metrics.confidentiality[0]}/I:${metrics.integrity[0]}/A:${metrics.availability[0]}`;
}

export function calculateCvss(metrics: CvssMetrics): CvssResult {
  const score = calculateBaseScore(metrics);
  return {
    score,
    severity: getSeverity(score),
    vector: buildVector(metrics),
    metrics,
  };
}

// === Pre-built profiles for common mobile vulnerabilities ===

export const MOBILE_VULN_PROFILES: Record<string, CvssMetrics> = {
  'plaintext_storage_sensitive': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'None',
    userInteraction: 'None', confidentiality: 'High', integrity: 'None', availability: 'None',
  },
  'hardcoded_credentials': {
    attackVector: 'Network', attackComplexity: 'Low', privilegesRequired: 'None',
    userInteraction: 'None', confidentiality: 'High', integrity: 'High', availability: 'None',
  },
  'missing_ssl_pinning': {
    attackVector: 'Adjacent', attackComplexity: 'High', privilegesRequired: 'None',
    userInteraction: 'Passive', confidentiality: 'High', integrity: 'Low', availability: 'None',
  },
  'sql_injection_content_provider': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'None',
    userInteraction: 'None', confidentiality: 'High', integrity: 'High', availability: 'None',
  },
  'webview_xss': {
    attackVector: 'Network', attackComplexity: 'Low', privilegesRequired: 'None',
    userInteraction: 'Active', confidentiality: 'Low', integrity: 'Low', availability: 'None',
  },
  'auth_bypass_biometric': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'Low',
    userInteraction: 'None', confidentiality: 'High', integrity: 'High', availability: 'None',
  },
  'tapjacking': {
    attackVector: 'Local', attackComplexity: 'High', privilegesRequired: 'None',
    userInteraction: 'Active', confidentiality: 'None', integrity: 'High', availability: 'None',
  },
  'task_hijacking': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'None',
    userInteraction: 'Active', confidentiality: 'High', integrity: 'High', availability: 'None',
  },
  'pending_intent_hijack': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'Low',
    userInteraction: 'None', confidentiality: 'Low', integrity: 'High', availability: 'None',
  },
  'weak_crypto_des': {
    attackVector: 'Network', attackComplexity: 'High', privilegesRequired: 'None',
    userInteraction: 'None', confidentiality: 'High', integrity: 'None', availability: 'None',
  },
  'exported_activity_no_guard': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'None',
    userInteraction: 'None', confidentiality: 'Low', integrity: 'Low', availability: 'None',
  },
  'broadcast_theft': {
    attackVector: 'Local', attackComplexity: 'Low', privilegesRequired: 'Low',
    userInteraction: 'None', confidentiality: 'High', integrity: 'None', availability: 'None',
  },
};
