import type { AgentObservation } from "./buildAgentObservation";
import type { WorldAction } from "../world/worldActions";

export type CharacterAgentObservation = AgentObservation;

export interface CharacterAgent {
  readonly characterId: string;
  decide(observation: CharacterAgentObservation): WorldAction[];
}
