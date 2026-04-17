/**
 * Model tier resolution for Viper agents.
 *
 * Tier assignment:
 *   large  → Opus (deep reasoning: static analysis, recon, reporting)
 *   medium → Sonnet (focused analysis: vuln + exploit agents)
 *   small  → Haiku (lightweight: validation, simple checks)
 */

import type { ModelTier } from '../types/agents.js';

export interface ModelConfig {
  readonly modelId: string;
  readonly maxTokens: number;
}

const MODEL_MAP: Record<ModelTier, ModelConfig> = {
  large: {
    modelId: 'claude-opus-4-6',
    maxTokens: 32768,
  },
  medium: {
    modelId: 'claude-opus-4-6',
    maxTokens: 32768,
  },
  small: {
    modelId: 'claude-sonnet-4-6',
    maxTokens: 16384,
  },
};

export function resolveModel(tier: ModelTier): ModelConfig {
  return MODEL_MAP[tier];
}
