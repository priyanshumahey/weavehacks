import type { CharacterAgent } from "../characterAgent";
import type { WorldRuntime } from "../../world/WorldRuntime";
import { CHARACTER_CONTROLLER_TYPES } from "../../world/worldState";
import type { WorldAction } from "../../world/worldActions";
import {
  createDefaultAgentOrchestratorConfig,
  type AgentOrchestratorConfig,
} from "./agentOrchestratorConfig";
import { createIdleMoveAction } from "./createIdleMoveAction";
import {
  validateAgentAction,
  type AgentActionRejectionReason,
} from "./validateAgentAction";

export interface AgentRejectedAction {
  characterId: string;
  action: WorldAction;
  reason: AgentActionRejectionReason | "dispatch_rejected";
}

export class AgentOrchestrator {
  private readonly agents: CharacterAgent[];
  private readonly config: AgentOrchestratorConfig;
  private readonly lastDecisionElapsedMs = new Map<string, number>();
  private lastRejectedActions: AgentRejectedAction[] = [];

  constructor(
    agents: CharacterAgent[],
    config: AgentOrchestratorConfig = createDefaultAgentOrchestratorConfig(),
  ) {
    this.agents = agents;
    this.config = config;
  }

  getLastRejectedActions(): readonly AgentRejectedAction[] {
    return this.lastRejectedActions;
  }

  tick(runtime: WorldRuntime): void {
    const elapsedMs = runtime.getState().time.elapsedMs;
    const rejectedActions: AgentRejectedAction[] = [];

    for (const agent of this.agents) {
      const lastDecisionMs = this.lastDecisionElapsedMs.get(agent.characterId) ?? -Infinity;

      if (elapsedMs - lastDecisionMs < this.config.decisionIntervalMs) {
        continue;
      }

      const observation = runtime.getObservation(agent.characterId);

      if (!observation) {
        continue;
      }

      let actions: WorldAction[];

      try {
        actions = agent.decide(observation);
      } catch {
        actions =
          this.config.idleFallbackOnError ? [createIdleMoveAction(agent.characterId)] : [];
      }

      const accepted = this.dispatchAgentActions(
        runtime,
        agent.characterId,
        actions.slice(0, this.config.maxActionsPerDecision),
        rejectedActions,
      );

      if (!accepted && this.config.idleFallbackOnRejected) {
        this.dispatchAgentActions(
          runtime,
          agent.characterId,
          [createIdleMoveAction(agent.characterId)],
          rejectedActions,
        );
      }

      this.lastDecisionElapsedMs.set(agent.characterId, elapsedMs);
    }

    this.lastRejectedActions = rejectedActions;
  }

  private dispatchAgentActions(
    runtime: WorldRuntime,
    characterId: string,
    actions: WorldAction[],
    rejectedActions: AgentRejectedAction[],
  ): boolean {
    let accepted = false;

    for (const action of actions) {
      const rejectionReason = validateAgentAction(action, characterId);

      if (rejectionReason) {
        rejectedActions.push({
          characterId,
          action,
          reason: rejectionReason,
        });
        continue;
      }

      if (runtime.dispatch(action, CHARACTER_CONTROLLER_TYPES.agent)) {
        accepted = true;
        continue;
      }

      rejectedActions.push({
        characterId,
        action,
        reason: "dispatch_rejected",
      });
    }

    return accepted;
  }
}
