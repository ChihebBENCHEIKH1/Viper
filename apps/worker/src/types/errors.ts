/**
 * Error codes and types for Viper pipeline
 */

export enum ErrorCode {
  // Config errors
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  CONFIG_PARSE_FAILED = 'CONFIG_PARSE_FAILED',

  // APK errors
  APK_NOT_FOUND = 'APK_NOT_FOUND',
  APK_DECOMPILATION_FAILED = 'APK_DECOMPILATION_FAILED',
  APK_INVALID = 'APK_INVALID',

  // Emulator errors
  EMULATOR_START_FAILED = 'EMULATOR_START_FAILED',
  EMULATOR_NOT_READY = 'EMULATOR_NOT_READY',
  EMULATOR_APK_INSTALL_FAILED = 'EMULATOR_APK_INSTALL_FAILED',
  ADB_CONNECTION_FAILED = 'ADB_CONNECTION_FAILED',

  // Frida errors
  FRIDA_SERVER_FAILED = 'FRIDA_SERVER_FAILED',
  FRIDA_INJECTION_FAILED = 'FRIDA_INJECTION_FAILED',

  // Proxy errors
  PROXY_START_FAILED = 'PROXY_START_FAILED',
  PROXY_CERT_INSTALL_FAILED = 'PROXY_CERT_INSTALL_FAILED',

  // Billing errors
  SPENDING_CAP_REACHED = 'SPENDING_CAP_REACHED',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  API_RATE_LIMITED = 'API_RATE_LIMITED',

  // Agent execution
  AGENT_EXECUTION_FAILED = 'AGENT_EXECUTION_FAILED',
  OUTPUT_VALIDATION_FAILED = 'OUTPUT_VALIDATION_FAILED',
  PROMPT_LOAD_FAILED = 'PROMPT_LOAD_FAILED',

  // Git errors
  GIT_CHECKPOINT_FAILED = 'GIT_CHECKPOINT_FAILED',
  GIT_ROLLBACK_FAILED = 'GIT_ROLLBACK_FAILED',

  // Filesystem
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
}

export type VulnErrorType =
  | 'config'
  | 'apk'
  | 'emulator'
  | 'frida'
  | 'proxy'
  | 'network'
  | 'billing'
  | 'agent'
  | 'prompt'
  | 'filesystem'
  | 'validation';

export interface ViperErrorContext {
  readonly [key: string]: unknown;
}

export class ViperError extends Error {
  readonly type: VulnErrorType;
  readonly retryable: boolean;
  readonly context: ViperErrorContext;
  readonly code: ErrorCode | undefined;

  constructor(
    message: string,
    type: VulnErrorType,
    retryable: boolean,
    context: ViperErrorContext = {},
    code?: ErrorCode,
  ) {
    super(message);
    this.name = 'ViperError';
    this.type = type;
    this.retryable = retryable;
    this.context = context;
    this.code = code;
  }
}
