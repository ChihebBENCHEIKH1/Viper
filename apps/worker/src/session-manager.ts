/**
 * Agent registry — single source of truth for all agent definitions.
 */

import type { AgentDefinition, AgentName, AgentValidator } from './types/agents.js';

export const AGENTS: Readonly<Record<AgentName, AgentDefinition>> = {
  // === Phase 1: Static Analysis ===
  'static-analysis': {
    name: 'static-analysis',
    displayName: 'Static Analysis',
    prerequisites: [],
    promptTemplate: 'static-analysis',
    deliverableFilename: 'static_analysis_deliverable.md',
    modelTier: 'large',
    phase: 'static-analysis',
  },

  // === Phase 2: Reconnaissance ===
  'recon': {
    name: 'recon',
    displayName: 'Reconnaissance',
    prerequisites: ['static-analysis'],
    promptTemplate: 'recon',
    deliverableFilename: 'recon_deliverable.md',
    modelTier: 'large',
    phase: 'recon',
  },

  // === Phase 3: Vulnerability Analysis (5 parallel) ===
  'storage-vuln': {
    name: 'storage-vuln',
    displayName: 'Storage Vulnerability Analysis',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-storage',
    deliverableFilename: 'storage_analysis_deliverable.md',
    modelTier: 'medium',
    phase: 'vuln',
    exploitationQueueFilename: 'storage_exploitation_queue.json',
  },
  'crypto-vuln': {
    name: 'crypto-vuln',
    displayName: 'Cryptography Vulnerability Analysis',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-crypto',
    deliverableFilename: 'crypto_analysis_deliverable.md',
    modelTier: 'medium',
    phase: 'vuln',
    exploitationQueueFilename: 'crypto_exploitation_queue.json',
  },
  'auth-vuln': {
    name: 'auth-vuln',
    displayName: 'Authentication Vulnerability Analysis',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-auth',
    deliverableFilename: 'auth_analysis_deliverable.md',
    modelTier: 'medium',
    phase: 'vuln',
    exploitationQueueFilename: 'auth_exploitation_queue.json',
  },
  'network-vuln': {
    name: 'network-vuln',
    displayName: 'Network Vulnerability Analysis',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-network',
    deliverableFilename: 'network_analysis_deliverable.md',
    modelTier: 'medium',
    phase: 'vuln',
    exploitationQueueFilename: 'network_exploitation_queue.json',
  },
  'injection-vuln': {
    name: 'injection-vuln',
    displayName: 'Injection Vulnerability Analysis',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-injection',
    deliverableFilename: 'injection_analysis_deliverable.md',
    modelTier: 'medium',
    phase: 'vuln',
    exploitationQueueFilename: 'injection_exploitation_queue.json',
  },

  // === Phase 4: Exploitation (5 parallel, conditional) ===
  'storage-exploit': {
    name: 'storage-exploit',
    displayName: 'Storage Exploitation',
    prerequisites: ['storage-vuln'],
    promptTemplate: 'exploit-storage',
    deliverableFilename: 'storage_exploitation_evidence.md',
    modelTier: 'medium',
    phase: 'exploit',
  },
  'crypto-exploit': {
    name: 'crypto-exploit',
    displayName: 'Cryptography Exploitation',
    prerequisites: ['crypto-vuln'],
    promptTemplate: 'exploit-crypto',
    deliverableFilename: 'crypto_exploitation_evidence.md',
    modelTier: 'medium',
    phase: 'exploit',
  },
  'auth-exploit': {
    name: 'auth-exploit',
    displayName: 'Authentication Exploitation',
    prerequisites: ['auth-vuln'],
    promptTemplate: 'exploit-auth',
    deliverableFilename: 'auth_exploitation_evidence.md',
    modelTier: 'medium',
    phase: 'exploit',
  },
  'network-exploit': {
    name: 'network-exploit',
    displayName: 'Network Exploitation',
    prerequisites: ['network-vuln'],
    promptTemplate: 'exploit-network',
    deliverableFilename: 'network_exploitation_evidence.md',
    modelTier: 'medium',
    phase: 'exploit',
  },
  'injection-exploit': {
    name: 'injection-exploit',
    displayName: 'Injection Exploitation',
    prerequisites: ['injection-vuln'],
    promptTemplate: 'exploit-injection',
    deliverableFilename: 'injection_exploitation_evidence.md',
    modelTier: 'medium',
    phase: 'exploit',
  },

  // === Phase 5: Reporting ===
  'report': {
    name: 'report',
    displayName: 'Executive Report',
    prerequisites: [
      'storage-exploit',
      'crypto-exploit',
      'auth-exploit',
      'network-exploit',
      'injection-exploit',
    ],
    promptTemplate: 'report-executive',
    deliverableFilename: 'executive_report.md',
    modelTier: 'large',
    phase: 'report',
  },
};

// === Validators ===

function createVulnValidator(vulnType: string): AgentValidator {
  return async (sourceDir: string) => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const deliverable = join(sourceDir, '.viper', 'deliverables', `${vulnType}_analysis_deliverable.md`);
    const queue = join(sourceDir, '.viper', 'deliverables', `${vulnType}_exploitation_queue.json`);
    return existsSync(deliverable) && existsSync(queue);
  };
}

function createExploitValidator(vulnType: string): AgentValidator {
  return async (sourceDir: string) => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    return existsSync(join(sourceDir, '.viper', 'deliverables', `${vulnType}_exploitation_evidence.md`));
  };
}

export const AGENT_VALIDATORS: Partial<Record<AgentName, AgentValidator>> = {
  'storage-vuln': createVulnValidator('storage'),
  'crypto-vuln': createVulnValidator('crypto'),
  'auth-vuln': createVulnValidator('auth'),
  'network-vuln': createVulnValidator('network'),
  'injection-vuln': createVulnValidator('injection'),
  'storage-exploit': createExploitValidator('storage'),
  'crypto-exploit': createExploitValidator('crypto'),
  'auth-exploit': createExploitValidator('auth'),
  'network-exploit': createExploitValidator('network'),
  'injection-exploit': createExploitValidator('injection'),
  'report': async (sourceDir: string) => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    return existsSync(join(sourceDir, '.viper', 'deliverables', 'executive_report.md'));
  },
};
