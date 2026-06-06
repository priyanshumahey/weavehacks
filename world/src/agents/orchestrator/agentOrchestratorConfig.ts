export const AGENT_ORCHESTRATOR_DEFAULTS = {
  decisionIntervalMs: 250,
  maxActionsPerDecision: 8,
} as const;

export interface AgentOrchestratorConfig {
  decisionIntervalMs: number;
  maxActionsPerDecision: number;
  idleFallbackOnError: boolean;
  idleFallbackOnRejected: boolean;
}

export function createDefaultAgentOrchestratorConfig(): AgentOrchestratorConfig {
  return {
    decisionIntervalMs: AGENT_ORCHESTRATOR_DEFAULTS.decisionIntervalMs,
    maxActionsPerDecision: AGENT_ORCHESTRATOR_DEFAULTS.maxActionsPerDecision,
    idleFallbackOnError: true,
    idleFallbackOnRejected: true,
  };
}
