/**
 * OWASP MASTG (Mobile Application Security Testing Guide) test case mapping.
 *
 * Maps vulnerability findings to specific MASTG atomic test IDs and MASVS controls.
 * Used by the report agent to generate MASTG-compliant reports.
 */

export interface MastgMapping {
  readonly testId: string;
  readonly masvs: string;
  readonly title: string;
  readonly level: 'L1' | 'L2' | 'R';
}

/** Map vulnerability types to MASTG test IDs */
export const MASTG_MAPPINGS: Record<string, readonly MastgMapping[]> = {
  // === Data Storage (M9) ===
  'insecure_data_storage': [
    { testId: 'MASTG-TEST-0001', masvs: 'MASVS-STORAGE-1', title: 'Testing Local Storage for Sensitive Data', level: 'L1' },
    { testId: 'MASTG-TEST-0002', masvs: 'MASVS-STORAGE-2', title: 'Testing Logs for Sensitive Data', level: 'L1' },
    { testId: 'MASTG-TEST-0003', masvs: 'MASVS-STORAGE-1', title: 'Testing Backups for Sensitive Data', level: 'L1' },
    { testId: 'MASTG-TEST-0011', masvs: 'MASVS-STORAGE-1', title: 'Testing Memory for Sensitive Data', level: 'L2' },
    { testId: 'MASTG-TEST-0012', masvs: 'MASVS-STORAGE-2', title: 'Testing the Clipboard for Sensitive Data', level: 'L1' },
  ],

  // === Cryptography (M10) ===
  'insufficient_cryptography': [
    { testId: 'MASTG-TEST-0013', masvs: 'MASVS-CRYPTO-1', title: 'Testing Symmetric Cryptography', level: 'L1' },
    { testId: 'MASTG-TEST-0014', masvs: 'MASVS-CRYPTO-1', title: 'Testing Random Number Generation', level: 'L1' },
    { testId: 'MASTG-TEST-0015', masvs: 'MASVS-CRYPTO-2', title: 'Testing Key Management', level: 'L1' },
  ],

  // === Authentication (M3) ===
  'insecure_authentication': [
    { testId: 'MASTG-TEST-0016', masvs: 'MASVS-AUTH-1', title: 'Testing Local Authentication', level: 'L1' },
    { testId: 'MASTG-TEST-0017', masvs: 'MASVS-AUTH-2', title: 'Testing Biometric Authentication', level: 'L2' },
    { testId: 'MASTG-TEST-0018', masvs: 'MASVS-AUTH-1', title: 'Testing Session Management', level: 'L1' },
  ],

  // === Network (M5) ===
  'insecure_communication': [
    { testId: 'MASTG-TEST-0019', masvs: 'MASVS-NETWORK-1', title: 'Testing Data Encryption on the Network', level: 'L1' },
    { testId: 'MASTG-TEST-0020', masvs: 'MASVS-NETWORK-1', title: 'Testing the TLS Settings', level: 'L1' },
    { testId: 'MASTG-TEST-0021', masvs: 'MASVS-NETWORK-2', title: 'Testing Custom Certificate Stores', level: 'L2' },
    { testId: 'MASTG-TEST-0022', masvs: 'MASVS-NETWORK-2', title: 'Testing Certificate Pinning', level: 'L2' },
  ],

  // === Platform (M4 + M8) ===
  'input_validation': [
    { testId: 'MASTG-TEST-0023', masvs: 'MASVS-PLATFORM-1', title: 'Testing App Permissions', level: 'L1' },
    { testId: 'MASTG-TEST-0024', masvs: 'MASVS-PLATFORM-1', title: 'Testing for Injection Flaws', level: 'L1' },
    { testId: 'MASTG-TEST-0025', masvs: 'MASVS-PLATFORM-2', title: 'Testing WebViews', level: 'L1' },
    { testId: 'MASTG-TEST-0026', masvs: 'MASVS-PLATFORM-3', title: 'Testing Deep Links', level: 'L1' },
  ],

  // === Overlay/Tapjacking ===
  'tapjacking': [
    { testId: 'MASTG-TEST-0035', masvs: 'MASVS-PLATFORM-1', title: 'Testing for Overlay Attacks', level: 'L1' },
  ],

  // === Task Hijacking ===
  'task_hijacking': [
    { testId: 'MASTG-TEST-0036', masvs: 'MASVS-PLATFORM-1', title: 'Testing for Task Hijacking', level: 'L1' },
  ],

  // === Resilience (M7) ===
  'insufficient_binary_protection': [
    { testId: 'MASTG-TEST-0038', masvs: 'MASVS-RESILIENCE-1', title: 'Testing Obfuscation', level: 'R' },
    { testId: 'MASTG-TEST-0039', masvs: 'MASVS-RESILIENCE-2', title: 'Testing Root Detection', level: 'R' },
    { testId: 'MASTG-TEST-0040', masvs: 'MASVS-RESILIENCE-3', title: 'Testing Anti-Tampering', level: 'R' },
    { testId: 'MASTG-TEST-0041', masvs: 'MASVS-RESILIENCE-4', title: 'Testing Reverse Engineering Tools Detection', level: 'R' },
  ],

  // === Credentials (M1) ===
  'improper_credentials': [
    { testId: 'MASTG-TEST-0042', masvs: 'MASVS-STORAGE-1', title: 'Testing for Hardcoded Credentials', level: 'L1' },
  ],
};

export function getMastgMappings(vulnType: string): readonly MastgMapping[] {
  return MASTG_MAPPINGS[vulnType] || [];
}

export function formatMastgReference(mapping: MastgMapping): string {
  return `${mapping.testId} (${mapping.masvs}) [${mapping.level}]: ${mapping.title}`;
}
