/**
 * Configuration type definitions for Viper
 */

export type RuleType = 'activity' | 'service' | 'receiver' | 'provider' | 'package' | 'endpoint' | 'permission';

export interface Rule {
  readonly description: string;
  readonly type: RuleType;
  readonly value: string;
}

export interface Rules {
  readonly avoid?: readonly Rule[];
  readonly focus?: readonly Rule[];
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
  readonly pin?: string;
  readonly totp_secret?: string;
}

export interface Authentication {
  readonly credentials: Credentials;
  readonly login_flow?: readonly string[];
}

export interface EmulatorConfig {
  readonly api_level?: number;
  readonly device_profile?: string;
}

export type RetryPreset = 'default' | 'subscription';

export interface PipelineConfig {
  readonly retry_preset?: RetryPreset;
  readonly max_concurrent_pipelines?: number;
}

export interface Config {
  readonly description?: string;
  readonly authentication?: Authentication;
  readonly emulator?: EmulatorConfig;
  readonly rules?: Rules;
  readonly pipeline?: PipelineConfig;
}

/** Normalized config distributed to agents */
export interface DistributedConfig {
  readonly avoid: readonly Rule[];
  readonly focus: readonly Rule[];
  readonly authentication: Authentication | null;
  readonly description: string;
  readonly emulator: EmulatorConfig;
}
