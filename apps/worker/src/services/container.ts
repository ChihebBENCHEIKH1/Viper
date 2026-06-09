/**
 * Dependency injection container — one per workflow.
 *
 * NOTE: AuditSession is NOT stored in the container.
 * Each agent receives its own AuditSession instance to prevent
 * corruption during parallel execution.
 */

import { AgentExecutionService } from './agent-execution.js';
import { ConfigLoaderService } from './config-loader.js';
import { ExploitationCheckerService } from './exploitation-checker.js';
import type { Platform } from '../types/platform.js';

export interface SessionMetadata {
  readonly sessionId: string;
  readonly apkPath: string;
  readonly artifactPath: string;
  readonly platform: Platform;
  readonly sourcePath?: string;
  readonly workspaceDir: string;
  readonly decompiledDir: string;
}

export interface ContainerDependencies {
  readonly sessionMetadata: SessionMetadata;
}

export class Container {
  readonly sessionMetadata: SessionMetadata;
  readonly agentExecution: AgentExecutionService;
  readonly configLoader: ConfigLoaderService;
  readonly exploitationChecker: ExploitationCheckerService;

  constructor(deps: ContainerDependencies) {
    this.sessionMetadata = deps.sessionMetadata;
    this.configLoader = new ConfigLoaderService();
    this.exploitationChecker = new ExploitationCheckerService();
    this.agentExecution = new AgentExecutionService(this.configLoader);
  }
}

// === Per-Workflow Container Registry ===

const containers = new Map<string, Container>();

export function getOrCreateContainer(workflowId: string, sessionMetadata: SessionMetadata): Container {
  let container = containers.get(workflowId);
  if (!container) {
    container = new Container({ sessionMetadata });
    containers.set(workflowId, container);
  }
  return container;
}

export function removeContainer(workflowId: string): void {
  containers.delete(workflowId);
}
