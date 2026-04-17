/**
 * Agent definitions and types for the Viper pipeline
 */

export const ALL_AGENTS = [
  'static-analysis',
  'recon',
  'storage-vuln',
  'crypto-vuln',
  'auth-vuln',
  'network-vuln',
  'injection-vuln',
  'storage-exploit',
  'crypto-exploit',
  'auth-exploit',
  'network-exploit',
  'injection-exploit',
  'report',
] as const;

export type AgentName = (typeof ALL_AGENTS)[number];

export type AgentPhase = 'static-analysis' | 'recon' | 'vuln' | 'exploit' | 'report';

export type ModelTier = 'small' | 'medium' | 'large';

export interface AgentDefinition {
  readonly name: AgentName;
  readonly displayName: string;
  readonly prerequisites: readonly AgentName[];
  readonly promptTemplate: string;
  readonly deliverableFilename: string;
  readonly modelTier: ModelTier;
  readonly phase: AgentPhase;
  readonly exploitationQueueFilename?: string;
}

export type AgentValidator = (sourceDir: string) => Promise<boolean>;

/** Vulnerability types that have paired vuln+exploit agents */
export const VULN_TYPES = ['storage', 'crypto', 'auth', 'network', 'injection'] as const;
export type VulnType = (typeof VULN_TYPES)[number];

/** Maps vuln type to its agent pair */
export interface VulnExploitPair {
  readonly vulnAgent: AgentName;
  readonly exploitAgent: AgentName;
  readonly vulnType: VulnType;
}

export const VULN_EXPLOIT_PAIRS: readonly VulnExploitPair[] = [
  { vulnType: 'storage', vulnAgent: 'storage-vuln', exploitAgent: 'storage-exploit' },
  { vulnType: 'crypto', vulnAgent: 'crypto-vuln', exploitAgent: 'crypto-exploit' },
  { vulnType: 'auth', vulnAgent: 'auth-vuln', exploitAgent: 'auth-exploit' },
  { vulnType: 'network', vulnAgent: 'network-vuln', exploitAgent: 'network-exploit' },
  { vulnType: 'injection', vulnAgent: 'injection-vuln', exploitAgent: 'injection-exploit' },
] as const;
