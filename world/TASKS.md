# World Tasks

All major `world/` engine tasks are complete.

## Completed

- 1. Boot
- 2. Scene Shell
- 3. World Model
- 4. World Runtime
- 5. Input Adapter
- 6. Simulation Systems
- 7. Renderer
- 8. Interaction and UI Layer
- 9. Control Ownership Layer
- 10. Agent Perception Layer
- 11. Character Agent Interface

## Planned: Agent Interaction Layer

- 12. Agent Orchestrator
  Build an orchestration layer that owns agent instances, updates them on a controlled cadence, collects their actions, and dispatches those actions into `WorldRuntime` without letting agents mutate state directly.

- 13. Agent Scheduling and Safety Rules
  Add guardrails for tick rate, action budgets, invalid action rejection, and fallback behavior so multiple agents can run predictably without stalling the simulation or spamming commands every frame.

- 14. Interaction Extensions for Agents
  Extend the action and interaction model as needed for agent-driven play, such as explicit facing, inspect/select actions, or richer dialogue initiation, while preserving the current deterministic runtime flow.

- 15. Debug and Visibility Tooling
  Add development-facing debugging support for agent-controlled characters, such as current controller type, latest observation summary, last chosen action, and any rejected commands.
