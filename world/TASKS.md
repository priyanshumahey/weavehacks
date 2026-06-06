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

## Planned: Asset Integration Layer

- 16. Asset Loading and Registry
  Add a dedicated preload/registration path for `world/sprites` assets so scenes and renderers use stable texture keys instead of hard-coded file paths.

- 17. Character Sprite Metadata ✓
  Extend authored character definitions and normalized runtime types with sprite metadata such as texture key, frame dimensions, scale, label offset, and optional animation mappings.

- 18. Sprite-Backed Character Renderer ✓
  Replace the current circle-based `CharacterSprite` rendering with Phaser image or spritesheet instances while preserving name labels, selection state, and runtime-authoritative positioning.

- 19. Character Animation and Facing ✓
  Drive idle and movement animations from runtime state, including choosing the correct row or animation for player and NPC movement without letting renderer logic become the source of truth.

- 20. Terrain Base Layer
  Replace the placeholder world rectangle with a tile- or image-based terrain layer derived from the terrain sprites, with a clear approach for scaling, repetition, and camera-safe bounds.

- 21. Props and Building Placement
  Introduce placed world props and buildings backed by asset metadata so houses, resources, and environmental decoration can render as first-class world entities instead of one-off scene art.

- 22. Render Layering and Depth Rules
  Add explicit depth ordering for terrain, props, characters, UI markers, and overlays so tall sprites render correctly and do not visually break movement or selection.

- 23. Asset Rendering Validation
  Verify collision radius, interaction distance, visual scale, and screen readability after the art migration, and document any runtime or architecture adjustments required by sprite-backed rendering.
