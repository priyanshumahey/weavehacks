import type { CharacterAgent } from "../characterAgent";
import type { WorldRuntime } from "../../world/WorldRuntime";
import { CHARACTER_CONTROLLER_TYPES } from "../../world/worldState";

export class AgentOrchestrator {
  private readonly agents: CharacterAgent[];

  constructor(agents: CharacterAgent[]) {
    this.agents = agents;
  }

  tick(runtime: WorldRuntime): void {
    for (const agent of this.agents) {
      const observation = runtime.getObservation(agent.characterId);

      if (!observation) {
        continue;
      }

      for (const action of agent.decide(observation)) {
        runtime.dispatch(action, CHARACTER_CONTROLLER_TYPES.agent);
      }
    }
  }
}
