/**
 * Adaptive testing — adjusts test suite based on app characteristics.
 *
 * Analyzes the target app and enables/disables test categories
 * based on what's relevant. Prevents wasting time on irrelevant tests.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VulnType } from '../types/agents.js';
import type { FrameworkDetection } from './framework-detector.js';

export type AppCategory = 'banking' | 'healthcare' | 'social' | 'ecommerce' | 'gaming' | 'utility' | 'enterprise' | 'unknown';

export interface TestProfile {
  readonly appCategory: AppCategory;
  readonly enabledVulnTypes: readonly VulnType[];
  readonly priorityOrder: readonly VulnType[];
  readonly additionalChecks: readonly string[];
  readonly skipReasons: Record<string, string>;
}

interface ManifestInfo {
  permissions: string[];
  hasPayment: boolean;
  hasHealth: boolean;
  hasBiometric: boolean;
  hasWebView: boolean;
  hasLocation: boolean;
  hasCamera: boolean;
  hasNetwork: boolean;
}

function parseManifestInfo(apktoolDir: string): ManifestInfo {
  const manifestPath = join(apktoolDir, 'AndroidManifest.xml');
  if (!existsSync(manifestPath)) {
    return { permissions: [], hasPayment: false, hasHealth: false, hasBiometric: false, hasWebView: false, hasLocation: false, hasCamera: false, hasNetwork: false };
  }

  const content = readFileSync(manifestPath, 'utf-8');
  const permissions = [...content.matchAll(/android\.permission\.(\w+)/g)].map((m) => m[1] ?? '');

  return {
    permissions,
    hasPayment: content.includes('billing') || content.includes('payment') || content.includes('InAppPurchase'),
    hasHealth: content.includes('health') || permissions.includes('BODY_SENSORS'),
    hasBiometric: content.includes('BiometricPrompt') || content.includes('fingerprint') || permissions.includes('USE_BIOMETRIC'),
    hasWebView: content.includes('WebView'),
    hasLocation: permissions.includes('ACCESS_FINE_LOCATION') || permissions.includes('ACCESS_COARSE_LOCATION'),
    hasCamera: permissions.includes('CAMERA'),
    hasNetwork: permissions.includes('INTERNET'),
  };
}

function detectAppCategory(manifest: ManifestInfo, framework: FrameworkDetection): AppCategory {
  if (manifest.hasPayment) return 'banking';
  if (manifest.hasHealth) return 'healthcare';
  if (manifest.hasCamera && manifest.hasLocation) return 'social';
  if (framework.framework === 'react-native' || framework.framework === 'flutter') return 'utility';
  return 'unknown';
}

export function buildTestProfile(
  apktoolDir: string,
  framework: FrameworkDetection,
): TestProfile {
  const manifest = parseManifestInfo(apktoolDir);
  const category = detectAppCategory(manifest, framework);

  const allVulnTypes: VulnType[] = ['storage', 'crypto', 'auth', 'network', 'injection'];
  const enabledVulnTypes: VulnType[] = [];
  const skipReasons: Record<string, string> = {};
  const additionalChecks: string[] = [];

  // Storage — always enabled, but priority varies
  enabledVulnTypes.push('storage');

  // Crypto — always enabled for apps with sensitive data
  enabledVulnTypes.push('crypto');

  // Auth — enabled if app has authentication features
  if (manifest.hasBiometric || manifest.hasNetwork) {
    enabledVulnTypes.push('auth');
    if (manifest.hasBiometric) {
      additionalChecks.push('biometric_bypass');
    }
  } else {
    skipReasons['auth'] = 'No authentication indicators found';
  }

  // Network — enabled if app has INTERNET permission
  if (manifest.hasNetwork) {
    enabledVulnTypes.push('network');
  } else {
    skipReasons['network'] = 'No INTERNET permission — app is offline-only';
  }

  // Injection — enabled if app has WebView or Content Providers
  if (manifest.hasWebView) {
    enabledVulnTypes.push('injection');
    additionalChecks.push('webview_xss', 'js_bridge_fuzzing');
  } else {
    enabledVulnTypes.push('injection'); // Still check Content Providers + deep links
  }

  // Category-specific additional checks
  switch (category) {
    case 'banking':
      additionalChecks.push('tapjacking', 'task_hijacking', 'root_detection', 'screen_capture_prevention');
      break;
    case 'healthcare':
      additionalChecks.push('data_encryption_at_rest', 'hipaa_compliance', 'audit_logging');
      break;
    case 'social':
      additionalChecks.push('deep_link_hijacking', 'broadcast_theft', 'privacy_data_collection');
      break;
    default:
      break;
  }

  // Framework-specific checks
  if (framework.framework === 'react-native') {
    additionalChecks.push('rn_bridge_fuzzing', 'js_bundle_secrets', 'hermes_decompile');
  }
  if (framework.framework === 'flutter') {
    additionalChecks.push('platform_channel_analysis', 'dart_snapshot_analysis');
  }

  // Priority ordering based on category
  const priorityOrder: VulnType[] = category === 'banking'
    ? ['auth', 'crypto', 'network', 'storage', 'injection']
    : category === 'healthcare'
      ? ['storage', 'crypto', 'network', 'auth', 'injection']
      : ['storage', 'network', 'auth', 'crypto', 'injection'];

  return {
    appCategory: category,
    enabledVulnTypes,
    priorityOrder: priorityOrder.filter((t) => enabledVulnTypes.includes(t)),
    additionalChecks,
    skipReasons,
  };
}
