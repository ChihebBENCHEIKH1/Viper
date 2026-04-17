/**
 * Multi-framework compliance mapping.
 *
 * Maps vulnerability findings to compliance controls beyond OWASP:
 * - PCI-DSS (payment apps)
 * - HIPAA (healthcare apps)
 * - NIST SP 800-163 (federal/government)
 * - GDPR (data protection)
 */

export interface ComplianceMapping {
  readonly framework: string;
  readonly control: string;
  readonly description: string;
}

export interface ComplianceResult {
  readonly owasp: string;
  readonly mastg?: string;
  readonly pciDss?: readonly ComplianceMapping[];
  readonly hipaa?: readonly ComplianceMapping[];
  readonly nist?: readonly ComplianceMapping[];
  readonly gdpr?: readonly ComplianceMapping[];
}

const COMPLIANCE_MAP: Record<string, Omit<ComplianceResult, 'owasp'>> = {
  // M1: Improper Credential Usage
  'M1': {
    pciDss: [
      { framework: 'PCI-DSS', control: '2.1', description: 'Do not use vendor-supplied defaults' },
      { framework: 'PCI-DSS', control: '8.2.3', description: 'Passwords must meet complexity requirements' },
    ],
    hipaa: [
      { framework: 'HIPAA', control: '§164.312(d)', description: 'Person or entity authentication' },
    ],
    nist: [
      { framework: 'NIST', control: 'IA-5', description: 'Authenticator management' },
    ],
  },

  // M3: Insecure Authentication
  'M3': {
    pciDss: [
      { framework: 'PCI-DSS', control: '8.1', description: 'Unique identification for all users' },
      { framework: 'PCI-DSS', control: '8.3', description: 'Secure authentication for access' },
    ],
    hipaa: [
      { framework: 'HIPAA', control: '§164.312(a)(2)(i)', description: 'Unique user identification' },
      { framework: 'HIPAA', control: '§164.312(d)', description: 'Person or entity authentication' },
    ],
    nist: [
      { framework: 'NIST', control: 'IA-2', description: 'Identification and authentication' },
    ],
  },

  // M4: Insufficient Input/Output Validation
  'M4': {
    pciDss: [
      { framework: 'PCI-DSS', control: '6.5.1', description: 'Injection flaws' },
      { framework: 'PCI-DSS', control: '6.5.7', description: 'Cross-site scripting (XSS)' },
    ],
    nist: [
      { framework: 'NIST', control: 'SI-10', description: 'Information input validation' },
    ],
  },

  // M5: Insecure Communication
  'M5': {
    pciDss: [
      { framework: 'PCI-DSS', control: '4.1', description: 'Use strong cryptography for transmission' },
    ],
    hipaa: [
      { framework: 'HIPAA', control: '§164.312(e)(1)', description: 'Transmission security' },
      { framework: 'HIPAA', control: '§164.312(e)(2)(ii)', description: 'Encryption of ePHI in transit' },
    ],
    nist: [
      { framework: 'NIST', control: 'SC-8', description: 'Transmission confidentiality and integrity' },
      { framework: 'NIST', control: 'SC-13', description: 'Cryptographic protection' },
    ],
    gdpr: [
      { framework: 'GDPR', control: 'Art. 32', description: 'Security of processing — encryption in transit' },
    ],
  },

  // M6: Inadequate Privacy Controls
  'M6': {
    gdpr: [
      { framework: 'GDPR', control: 'Art. 5(1)(c)', description: 'Data minimisation' },
      { framework: 'GDPR', control: 'Art. 5(1)(e)', description: 'Storage limitation' },
      { framework: 'GDPR', control: 'Art. 17', description: 'Right to erasure' },
    ],
    hipaa: [
      { framework: 'HIPAA', control: '§164.502(b)', description: 'Minimum necessary standard' },
    ],
  },

  // M9: Insecure Data Storage
  'M9': {
    pciDss: [
      { framework: 'PCI-DSS', control: '3.4', description: 'Render PAN unreadable' },
      { framework: 'PCI-DSS', control: '3.5', description: 'Protect cryptographic keys' },
    ],
    hipaa: [
      { framework: 'HIPAA', control: '§164.312(a)(2)(iv)', description: 'Encryption and decryption of ePHI' },
    ],
    nist: [
      { framework: 'NIST', control: 'SC-28', description: 'Protection of information at rest' },
    ],
    gdpr: [
      { framework: 'GDPR', control: 'Art. 32', description: 'Security of processing — encryption at rest' },
    ],
  },

  // M10: Insufficient Cryptography
  'M10': {
    pciDss: [
      { framework: 'PCI-DSS', control: '3.5', description: 'Protect cryptographic keys' },
      { framework: 'PCI-DSS', control: '3.6', description: 'Key management processes' },
    ],
    nist: [
      { framework: 'NIST', control: 'SC-12', description: 'Cryptographic key establishment' },
      { framework: 'NIST', control: 'SC-13', description: 'Cryptographic protection' },
    ],
  },
};

export function getComplianceMappings(owaspCategory: string): ComplianceResult {
  const mappings = COMPLIANCE_MAP[owaspCategory] || {};
  return { owasp: owaspCategory, ...mappings };
}

export function formatComplianceReport(mappings: ComplianceResult): string {
  const lines: string[] = [`OWASP Mobile: ${mappings.owasp}`];

  const frameworks = ['pciDss', 'hipaa', 'nist', 'gdpr'] as const;
  for (const fw of frameworks) {
    const controls = mappings[fw];
    if (controls && controls.length > 0) {
      for (const c of controls) {
        lines.push(`  ${c.framework} ${c.control}: ${c.description}`);
      }
    }
  }

  return lines.join('\n');
}
