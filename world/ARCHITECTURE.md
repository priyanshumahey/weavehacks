# World Architecture

This document is the single source of truth for the `world/` game engine architecture.

Rule: every architecture change in `world/` must be reflected in this file in the same change.

## Current Architecture

### Runtime Stack

- Build tool: Vite
- Engine: Phaser 3
- Language/runtime: TypeScript ES modules
- Package manager: Bun is the documented default, with npm and pnpm also supported

### Entry Flow

1. `world/index.html` provides the `#app` mount point for the Phaser canvas and the HTML UI overlay.
2. `world/src/main.ts` imports global styles and calls `createGame()`.
3. `world/src/game/config.ts` builds the Phaser config and registers `WorldScene` from `src/scenes/WorldScene.ts`.
4. `world/src/game/createGame.ts` creates the `Phaser.Game` instance.

### Boot Layer

Startup wiring is isolated from gameplay modules:

- `src/main.ts`: browser entrypoint only
- `src/game/config.ts`: Phaser config creation and scene registration
- `src/game/createGame.ts`: `Phaser.Game` construction

This keeps boot concerns separate from scene logic and world behavior.

### Scene Structure

`WorldScene` is now an orchestration scene. It wires dedicated collaborators for bounds/layout, input, runtime state, and rendering:

- `preload()`: registers `world/sprites` PNG assets through the shared asset registry
- `create()`: derives fixed world bounds, creates the initial world state, instantiates the runtime and renderer, and binds input
- `update()`: reads input intent, dispatches actions into the runtime, advances simulation, asks the renderer to reflect current state, and initializes camera follow once the player sprite exists

### Asset Loading

World art assets now have a dedicated preload and registration path:

- `src/assets/worldAssetRegistry.ts`: discovers `world/sprites/**/*.png` and `world/charsets/sprites/**/*.png`, derives stable Phaser texture keys from sprite-relative paths, attaches image dimensions from `spriteDimensions.json`, and exposes preload/lookup helpers
- `WorldScene.preload()`: owns asset registration for the scene and queues world textures before any renderer or future sprite-backed entity tries to use them

Texture consumers are expected to reference stable texture keys from the asset registry rather than hard-coded filesystem paths.

### Character Sprite Metadata

Character definitions now carry normalized sprite metadata alongside the existing circle-based appearance fields:

- `src/types/characterSprite.ts`: shared contracts for frame dimensions, label offsets, facing directions, animation keys, and animation row mappings
- `src/domain/characters/characterSprite.ts`: normalization and defaults for authored sprite metadata
- `deriveWorldTextureKey()` in `src/assets/worldAssetRegistry.ts`: derives stable texture keys from sprite-relative source paths without requiring the asset to already be registered

Authored character JSON may declare sprite metadata with either:

- `textureKey`: a stable registry key such as `world/characters/player`
- `textureSourcePath`: a path relative to `world/sprites/`, normalized into the same key format at definition load time
- `frameSourcePath`: a directory under `world/charsets/sprites/` containing per-frame PNGs named `{facing}_{index}.png` (for example `charsets/sprites/jon snow/down_1.png`)

Normalized runtime character state always includes a complete `sprite` object with texture key, frame size, fixed `displayHeight` slot, display scale fallback, label offset, origin, and optional idle/walk animation mappings per facing direction. Circle `appearance` fields remain authoritative for collision, interaction radius, and selection ring sizing — not visual height.

### Character Sprite Rendering

`CharacterSprite` renders characters as Phaser sprites backed by registry textures:

- `src/rendering/characters/preloadCharacterSpritesheets.ts`: queues spritesheet-backed character textures as `load.spritesheet()` during scene preload using authored frame dimensions from character definitions
- `src/rendering/characters/preloadCharsetFrames.ts`: queues charset frame directories as individual `load.image()` textures during scene preload
- `src/rendering/characters/charsetFrames.ts`: resolves per-frame texture keys from `frameSourcePath`, facing, and frame index; provides default idle/walk animation mappings for charset frame sequences
- `src/rendering/characters/characterSpritesheet.ts`: resolves spritesheet frame dimensions from texture size and authored frame metadata, scales sprites to fit a fixed `displayHeight` slot (`displayHeight / frameHeight`), computes label and depth offsets from `origin`, and maps row/column animation coordinates to frame indices
- `src/entities/CharacterSprite.ts`: creates a `Phaser.GameObjects.Sprite` per character from preloaded spritesheets or charset frame textures, registers animations through Phaser's `AnimationManager` (`scene.anims.create`, `generateFrameNumbers` for spritesheets; multi-texture frame lists for charset frame sequences), and plays them via `sprite.play()` from authoritative runtime `facing` and `animation` state; uses `setFlipX()` for single-row side-view sheets; gates `setTexture` / `setScale` / `play()` so idle and walk clips keep advancing instead of resetting every sync tick; positions name labels above the top of the fixed display slot
- `CharacterRenderer`: unchanged orchestration boundary; still mirrors authoritative `WorldRuntime` character positions each frame

### Character Animation and Facing

Facing and idle/walk selection are authoritative runtime state, not renderer logic:

- `src/domain/characters/resolveCharacterFacing.ts`: derives facing from normalized `moveIntent` (dominant axis, retains last facing when idle) and resolves `idle` vs `walk` animation keys
- `animationSystem` in `src/world/systems/animationSystem.ts`: updates `CharacterState.facing` and `CharacterState.animation` each tick after movement integration
- `CharacterState` carries `facing` and `animation` alongside `moveIntent` and `velocity`

### Player Appearance Selection

The player can swap between authored charset sprites without changing entity identity:

- `src/data/characters/playerAppearances.ts`: catalog of selectable charset options backed by `frameSourcePath` directories under `world/charsets/sprites/`
- `src/rendering/characters/preloadPlayerAppearances.ts`: preloads every selectable charset frame directory during `WorldScene.preload()`
- `applyPlayerAppearanceSystem()` in `src/domain/characters/applyPlayerAppearance.ts`: applies normalized sprite metadata to the player and updates `UiState.playerAppearanceId`
- `WORLD_ACTION_TYPES.setPlayerAppearance`: player-controller action dispatched from the bottom selector bar in `WorldUiRenderer`

### Map Background Layer

The playfield background is a single pre-rendered map image instead of a tilemap fill:

- `src/types/terrain.ts`: map texture source paths and `MapBackgroundDefinition` contract
- `src/data/terrain/defaultMapBackground.ts`: default background texture key and dimensions for `maps/throne_room.png`
- `src/rendering/terrain/TerrainRenderer.ts`: renders the map image at world origin with `scene.add.image()` at `RENDER_LAYERS.terrain`
- `src/assets/worldAssetRegistry.ts`: discovers and preloads PNG assets under `world/maps/`

Map background rules:

- World size matches the authored map image (`1024×1536` for the throne room)
- Image origin is `(0, 0)` and spans the full world rectangle
- `WorldBounds` remain simulation-authoritative with a playfield margin that keeps characters off walls and furniture baked into the image
- `createWorldFrame()` sets the camera background color
- `setupWorldCamera()` constrains the main camera to the fixed world size and follows the player sprite

### Scrollable World and Camera

The world is larger than the Phaser viewport and scrolls as the player moves:

- `src/rendering/world/worldDimensions.ts`: fixed world size constants (`WORLD_WIDTH` 1024, `WORLD_HEIGHT` 1536 — sized to the throne room map) and playfield margin
- `getWorldBounds()`: returns simulation bounds from fixed world dimensions, not from the camera viewport
- `setupWorldCamera()`: calls `camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)` and `camera.startFollow(playerSprite, true)` with pixel rounding for crisp pixel art
- `WorldScene.ensureCameraFollow()`: defers camera setup until the player `CharacterSprite` exists after the first render pass
- `worldToAppPoint()` and `CharacterLabelRenderer`: already subtract `camera.scrollX/Y` and cull against `camera.worldView`, so HTML overlays stay aligned during scroll
- `game.scale` letterboxing in `config.ts` is separate from camera scroll; the internal canvas stays 960×540 while the camera moves within the larger world

### Props and Building Placement

Placed world props and buildings are now file-backed entities in authoritative state and rendered as Phaser sprites:

- `src/types/propSprite.ts`: shared contracts for prop texture keys, scale, origin, and collision radius
- `src/types/prop.ts`: prop categories (`building`, `resource`, `decoration`), definition contracts, and normalized instance shape
- `src/domain/props/propSprite.ts`: normalization and defaults for authored prop sprite metadata
- `src/domain/props/propDefinition.ts`: validation and normalization of prop definitions into runtime instances
- `src/data/props/placements.json`: authored world layout for buildings, resources, and decorations
- `src/entities/PropSprite.ts`: creates a `Phaser.GameObjects.Image` inside a `Container` (static props do not need Sprite animation overhead), applies authored origin/scale via Phaser APIs, and Y-sorts with `setDepth()`
- `src/rendering/props/PropRenderer.ts`: mirrors authoritative prop entities from `WorldState.entities` each frame
- `createWorld()`: loads normalized props into `WorldState.entities`
- `collisionSystem`: separates player-driven characters from blocking props using circle overlap, same as character-character separation

Prop rendering rules:

- Props load through the shared asset registry (`textureSourcePath` or `textureKey`)
- Default origin is bottom-center `(0.5, 1)` so building feet align to authored positions
- Default `collisionRadius` is derived from registry texture dimensions when not authored
- Props remain presentation and collision metadata in state; Phaser objects mirror `WorldRuntime` rather than owning it

Authored prop JSON may declare sprite metadata with either:

- `textureKey`: a stable registry key such as `world/buildings/blue-buildings/house1`
- `textureSourcePath`: a path relative to `world/sprites/`, normalized into the same key format at definition load time

Rendered character positions always come from runtime state. The renderer does not write back into `WorldRuntime`.

### Render Layering and Depth Rules

World presentation uses Phaser `setDepth()` with explicit layer bands and foot-based Y-sorting:

- `src/rendering/renderDepth.ts`: shared layer constants (`RENDER_LAYERS`), tie-break priorities (`RENDER_DEPTH_PRIORITY`), and helpers that convert authored sprite origins into sort-Y values
- `TerrainRenderer`: map background image at `RENDER_LAYERS.terrain` (always behind world objects)
- `PropSprite`: depth from the sprite foot using authored `origin`, scaled texture height, and `RENDER_DEPTH_PRIORITY.prop`
- `CharacterSprite`: depth from the sprite foot using resolved frame height and display scale, with `RENDER_DEPTH_PRIORITY.character` so characters draw above props at the same foot Y
- `WorldUiRenderer`: HTML overlay (`#world-ui`) for prompt, dialogue, inspection, and player appearance selector panels, positioned above the Phaser canvas with CSS and `pointer-events: none` on the root so only interactive controls capture clicks. Dialogue uses a Hades-inspired layout: full-screen backdrop dim, full-body character portrait from `world/sprites/Characters/` on the left, and a parchment panel for speaker name and dialogue text

Depth rules:

- Sort Y is the world-space foot of each sprite, not its container center
- Props with bottom-center origin `(0.5, 1)` sort at their authored position; non-default origins adjust foot Y by `(1 - origin.y) * displayHeight`
- Characters sort with the same foot-based formula as props: `position.y + displayHeight * (1 - origin.y)`
- Selection rings and name badges live inside the character container and inherit the same depth as the body
- World depth values stay in the world band; player-facing UI is rendered in a separate HTML layer above the canvas

### Character Architecture

Characters and world UI are file-backed and split into focused layers:

- `src/data/characters/`: authored JSON definitions, one file per character
- `src/data/props/`: authored JSON placements for buildings, resources, and decorations
- `src/domain/characters/`: normalization and validation of character definitions into a stable runtime shape
- `src/world/`: `createWorld()` and `WorldRuntime`, the authoritative world-state layer responsible for state creation, action handling, and frame stepping
- `src/agents/`: agent-facing read-only observation builders derived from authoritative runtime state
- `src/rendering/characters/`: Phaser-facing rendering adapters such as `CharacterRenderer`
- `src/rendering/props/`: Phaser-facing prop rendering adapters such as `PropRenderer`
- `src/rendering/world/`: world bounds helpers, scene frame creation, and the top-level `WorldRenderer`
- `src/rendering/ui/`: DOM-based prompt, dialogue, inspection, and character selector rendering
- `src/input/`: input readers that convert Phaser APIs into scene-level intent
- `src/ui/`: presentation logic that derives player-facing copy from authoritative world state
- `src/entities/`: Phaser-facing wrappers such as `CharacterSprite` and `PropSprite`
- `src/types/`: shared TypeScript contracts for character definitions, instances, and world bounds

The scene does not treat Phaser game objects as the source of truth for character state. Runtime state lives in `WorldRuntime`, and rendered entities mirror that state through renderer modules.

### Rendered World

The current world is a minimal prototype scene composed of:

- A scrollable 1024×1536 throne room with camera follow on the player
- A pre-rendered map background image spanning the full world
- Sprite-backed buildings, resources, and decorations loaded from authored prop placements
- A set of sprite-backed character markers rendered from JSON definitions
- Selection highlighting derived from UI state
- Prompt, dialogue, and inspection panels derived from the runtime UI state

### Input Model

- Keyboard input is handled through Phaser cursor keys
- `WorldInputController` is the input adapter boundary for Phaser input devices
- Arrow keys are translated into a `move` world action with normalized directional intent
- `E` and space are translated into an edge-triggered `interact` world action via `Phaser.Input.Keyboard.JustDown()`
- The scene forwards adapter-produced actions into `WorldRuntime` and does not construct movement commands itself

### State Model

There is now a separated character state layer and a shared world-model contract in `src/world/worldState.ts`.

Current state is split as follows:

- `WorldScene`: Phaser lifecycle only
- `WorldInputController`: input polling and intent creation
- `createWorld()`: serializable world-state construction from authored definitions
- `WorldRuntime`: authoritative state mutation, action application, and per-frame simulation
- `buildAgentObservation()`: filtered, character-scoped perception queries for future agent controllers
- `src/world/systems/`: deterministic simulation passes for movement, bounds, collisions, and interactions
- `WorldRenderer`: top-level Phaser-facing renderer for the world frame and character rendering passes
- `WorldUiRenderer` and `buildWorldUiViewModel()`: player-facing prompt, dialogue, inspection, and bottom-of-screen character appearance selector rendered as an HTML overlay synced each frame from `WorldState.ui`. Dialogue portraits resolve from each character's `sprite.frameSourcePath` via `characterPortraitRegistry.ts`, which maps `charsets/sprites/<name>` to `sprites/Characters/<name>.png`
- `CharacterRenderer` and `CharacterSprite`: sprite-backed visual representation for each character with labels and selection highlighting
- `TerrainRenderer`, `createWorldFrame()`, `setupWorldCamera()`, and `getWorldBounds()`: map background presentation, camera background, fixed world bounds, and player camera follow
- `worldState.ts`: serializable interfaces for world bounds, entities, characters, zones, UI, and time

The only scene-local mutable state required is references to its collaborators.

The shared model is intentionally plain data:

- `WorldState`: top-level container for `characters`, `entities`, `zones`, `ui`, `time`, `bounds`, `playerId`, and `seed`
- `WorldEntityState`: base interface for world objects with identity, position, tags, traits, zone membership, and interaction flags
- `CharacterState`: character-specific extension with movement, dialogue, controller ownership, appearance, sprite metadata, velocity, move intent, facing, and animation
- `ZoneState`: named world partitions with bounds and entity membership
- `UiState`: prompt, dialogue, inspection, selection state, and active player appearance id
- `WorldTimeState`: elapsed time, tick counter, and time scale

Existing character definition and instance types in `src/types/character.ts` are compatibility contracts layered on top of this shared model so current gameplay code can keep moving while the broader runtime is built out.

Character controller ownership is now an explicit part of authored and runtime state:

- Character definitions may declare a controller type of `player`, `script`, or `agent`
- Character normalization defaults controller ownership by role when not authored explicitly
- `createWorld()` derives `playerId` from the first character owned by the `player` controller
- `WorldRuntime.dispatch(action, controller)` validates that the caller matches the character's assigned controller before mutating state
- `WorldRuntime.getObservation(entityId)` derives a cloned, read-only observation scoped to one character for future agent decision-making
- Scene input uses the `player` controller path, while future scripted and agent systems are expected to use the same runtime dispatch boundary with their own controller type

### Agent Interface

The runtime now has a first-pass character agent interface in `src/agents/`:

- `characterAgent.ts`: stable contract for agents that accept an observation and return `WorldAction[]`
- `ScoutGreeterAgent.ts`: lightweight scripted agent used to validate the contract against the live runtime

Agent interaction uses a **separate adapter path** parallel to player input. Player and agent controllers converge only at the runtime dispatch boundary; decision logic must not be shared or merged across layers.

#### Separation constraints

- **Agent orchestration and decision logic** live in `src/agents/` only. The orchestrator (task 12) belongs under `src/agents/orchestrator/`.
- **Player input** lives in `src/input/` only. `WorldInputController` reads Phaser devices and returns `WorldAction[]` for the player controller; it must not call `decide()`, read observations, or branch on agent state.
- **World rules** live in `src/world/` only. Simulation systems resolve action outcomes; they must not call agents, host LLM logic, or contain agent-specific decision branches.
- **Scenes** wire collaborators and forward frame ticks. `WorldScene` must not own long-term agent instances, implement scheduling, or embed agent decision loops once the orchestrator exists.
- **Read path**: `WorldRuntime.getObservation(entityId)` returns a cloned, character-scoped, read-only view. Agents must not read or mutate the authoritative `WorldState` directly.
- **Write path**: `WorldRuntime.dispatch(action, "agent")` with controller ownership validation. All agent output is expressed as `WorldAction[]`, same contract as the player path.
- **Action extensions** for agents (task 14) add shared types and system handlers in `src/world/`; agent choice logic stays in `src/agents/` and reaches the runtime only through `decide()` → `dispatch()`.

#### Module layout

```text
src/agents/
  characterAgent.ts
  buildAgentObservation.ts
  orchestrator/
    AgentOrchestrator.ts
    agentOrchestratorConfig.ts
    createCharacterAgents.ts
    createIdleMoveAction.ts
    validateAgentAction.ts
  ScoutGreeterAgent.ts
  ...
src/domain/characters/
  resolveFacingToward.ts
src/world/systems/
  facingSystem.ts
  ...
```

#### Orchestrator integration

- `AgentOrchestrator` owns agent instances and runs the observation → `decide()` → `dispatch()` loop each tick
- `createCharacterAgents()` maps `controller: "agent"` characters from world state to concrete `CharacterAgent` implementations
- `WorldScene` constructs the orchestrator at `create()` and calls `agentOrchestrator.tick(worldRuntime)` each frame before `step()`
- agents consume read-only observations from `WorldRuntime.getObservation(entityId)`
- all agent output flows through `WorldRuntime.dispatch(action, "agent")`

#### Scheduling and safety (task 13)

Guardrails live entirely in `src/agents/orchestrator/`:

- **Decision cadence**: each agent calls `decide()` at most once per `decisionIntervalMs` (default 250ms), keyed off `WorldState.time.elapsedMs`
- **Action budget**: at most `maxActionsPerDecision` actions (default 8) are considered per decision cycle
- **Validation**: `validateAgentAction()` rejects malformed or cross-entity actions before dispatch
- **Dispatch gate**: failed `WorldRuntime.dispatch()` calls are recorded as `dispatch_rejected`
- **Fallback**: on `decide()` throw or when every action is rejected, the orchestrator can dispatch an idle `move` intent (`{ x: 0, y: 0 }`) so agents do not stall with stale intent
- **Rejection surface**: `getLastRejectedActions()` exposes the latest tick's rejected commands for future debug tooling (task 15)

#### Interaction extensions (task 14)

Shared `WorldAction` types and handlers in `src/world/`:

- `face`: set explicit `CharacterState.facing` from a facing direction or `targetEntityId` (`facingSystem.applyFaceAction`)
- `select`: set per-character `interaction.selectedEntityId` when a target is in range
- `inspect`: set `interaction.inspectedEntityId` and selection when a target is in range
- `startDialogue`: set `interaction.dialogueEntityId` when a character target has `dialogueId` and is in range

Per-character `CharacterState.interaction` holds agent/script focus separately from player-facing `state.ui`. `syncCharacterInteractionSystem()` clears stale selections when targets move out of range. Agent observations read interaction state from the observer character, not global UI.

`ScoutGreeterAgent` demonstrates the extended action flow: approach the player, face toward them, select/inspect, and start dialogue when in range.

### Runtime Flow

Per frame, the current runtime flow is:

1. `WorldInputController` reads Phaser keyboard state and returns world actions for the current player.
2. `WorldScene` forwards those actions into `WorldRuntime` with the `player` controller type.
3. `AgentOrchestrator` reads observations from `WorldRuntime`, runs each agent's `decide()` pass, and forwards returned actions with the `agent` controller type.
4. `WorldRuntime` stores move intent on the authoritative character state and runs focused systems for movement, animation facing, collisions, bounds, and interactions.
5. `WorldRenderer` reads the current runtime state, syncs Phaser display objects, and projects UI state through dedicated UI renderers.

When non-player controllers are introduced, they are expected to read character-scoped observations from `WorldRuntime` rather than the raw mutable `WorldState`.

### Simulation Systems

The runtime now splits core gameplay rules into focused Phaser-independent system modules:

- `movementSystem`: integrates move intent into velocity and position
- `animationSystem`: derives facing and idle/walk animation from move intent
- `collisionSystem`: prevents overlapping blocking characters
- `boundsSystem`: clamps characters back into world bounds
- `interactionSystem`: resolves nearby interaction targets and maintains prompt, inspection, and dialogue state

`WorldRuntime.step()` orchestrates these systems in a deterministic order. Scene code and renderers consume the results but do not implement the rules themselves.

## Recommended Target Architecture

The current single-scene prototype is fine for bootstrapping, but it will become hard to extend once the world contains more than one actor, interaction type, or UI surface.

The next architecture step should be a layered world runtime with explicit boundaries:

1. Boot layer: creates Phaser and wires scenes
2. Scene layer: owns Phaser objects and frame lifecycle
3. World runtime layer: owns authoritative world state and simulation
4. Adapter layer: translates between Phaser/input APIs and the world runtime

This keeps Phaser as the rendering/input engine, not the place where game rules live.

### Design Principles

- Keep game rules outside Phaser scene classes
- Keep one authoritative mutable world state object
- Treat scenes as orchestration and rendering shells
- Prefer small domain-specific modules over a general ECS until scale requires it
- Make input produce intent, not direct object mutation
- Make rendering consume state, not define it
- Keep agent decision logic in `src/agents/` on a parallel adapter path; share only `WorldAction` dispatch with player input, never merged control flow

### Recommended Module Boundaries

#### 1. Boot

Responsibility:

- create the Phaser config
- register scenes
- create shared services needed at startup

Suggested files:

- `world/src/main.ts`
- `world/src/game/createGame.ts`
- `world/src/game/config.ts`

Interface:

```ts
export function createGame() {
  return new Phaser.Game(createGameConfig());
}
```

#### 2. Scene Shell

Responsibility:

- own Phaser lifecycle: `preload`, `create`, `update`
- instantiate world runtime dependencies
- forward frame ticks to the simulation
- forward state to renderers

Suggested files:

- `world/src/scenes/WorldScene.ts`

Interface:

```ts
class WorldScene extends Phaser.Scene {
  create() {}
  update(time, delta) {}
}
```

Constraint:

- scene classes should not contain world rules such as movement, collisions, quests, or interaction outcomes

#### 3. World Runtime

Responsibility:

- hold the canonical world state
- apply actions/intents
- run simulation systems each frame
- expose a simple query surface for renderers and UI

Suggested files:

- `world/src/world/createWorld.ts`
- `world/src/world/WorldRuntime.ts`
- `world/src/world/worldState.ts`

Interface:

```ts
export function createWorld(seed) {
  return {
    player: { id: "player", x: 0, y: 0, speed: 220 },
    entities: {},
    zones: {},
    ui: {},
    time: { elapsedMs: 0 },
    seed,
  };
}

export class WorldRuntime {
  constructor(initialState) {}
  dispatch(action) {}
  step(deltaMs) {}
  getState() {}
}
```

Rule:

- `WorldRuntime` is the only layer allowed to mutate authoritative world state

#### 4. Input Adapter

Responsibility:

- read Phaser input devices
- convert input into world intents/actions
- avoid mutating sprites or state directly

Suggested files:

- `world/src/input/createInputController.ts`
- `world/src/input/mapKeyboardToActions.ts`

Interface:

```ts
export function createInputController(scene) {
  return {
    readActions() {
      return [];
    },
  };
}
```

Example actions:

- `{ type: "move", entityId: "player", direction: { x: -1, y: 0 } }`
- `{ type: "interact", entityId: "player" }`

#### 5. Simulation Systems

Responsibility:

- implement deterministic world rules
- update state in focused passes
- stay independent from Phaser

Suggested files:

- `world/src/world/systems/movementSystem.ts`
- `world/src/world/systems/boundsSystem.ts`
- `world/src/world/systems/interactionSystem.ts`

Interface:

```ts
export function movementSystem(state, deltaMs) {}
```

Initial system split:

- input/action application
- movement integration
- world bounds/clamping
- interaction resolution

This is enough abstraction for the current project. Do not introduce a generic scheduler or plugin system until there are multiple scenes or runtime modes that need it.

#### 6. Renderers

Responsibility:

- create and update Phaser display objects from state
- keep rendering code separate from simulation code
- manage display object lifecycle for a domain area

Suggested files:

- `world/src/renderers/WorldRenderer.ts`
- `world/src/renderers/PlayerRenderer.ts`
- `world/src/renderers/HudRenderer.ts`

Interface:

```ts
export class PlayerRenderer {
  constructor(scene) {}
  sync(state) {}
}
```

Rule:

- renderers may cache Phaser objects
- renderers must not decide game rules

### Recommended Data Shape

Keep state plain and serializable. Avoid storing Phaser objects in world state.

Suggested shape:

```ts
{
  player: {
    id: "player",
    position: { x: 480, y: 270 },
    velocity: { x: 0, y: 0 },
    moveIntent: { x: 0, y: 0 },
    speed: 220,
  },
  world: {
    width: 960,
    height: 540,
    boundsPadding: 40,
  },
  entities: {},
  ui: {
    prompt: null,
  },
  time: {
    elapsedMs: 0,
  },
}
```

This gives a clean path to save/load, replay, testing, and multiplayer-style synchronization later.

### Recommended Folder Layout

```text
world/src/
  game/
    config.ts
    createGame.ts
  scenes/
    WorldScene.ts
  world/
    createWorld.ts
    WorldRuntime.ts
    worldState.ts
    systems/
      movementSystem.ts
      boundsSystem.ts
      interactionSystem.ts
  input/
    createInputController.ts
    mapKeyboardToActions.ts
  renderers/
    WorldRenderer.ts
    PlayerRenderer.ts
    HudRenderer.ts
  main.ts
  style.css
```

### Control Flow

Recommended per-frame flow inside `WorldScene.update`:

1. read actions from input controller
2. dispatch actions into `WorldRuntime`
3. advance simulation with `runtime.step(delta)`
4. sync renderers from `runtime.getState()`

Pseudo-flow:

```ts
update(_time, delta) {
  for (const action of this.inputController.readActions()) {
    this.runtime.dispatch(action);
  }

  this.runtime.step(delta);
  this.worldRenderer.sync(this.runtime.getState());
}
```

### Recommended Abstraction Level

Use domain modules, not framework-heavy abstractions.

Good abstractions now:

- `WorldRuntime`
- focused systems like `movementSystem`
- input and renderer adapters
- plain action objects

Avoid for now:

- full ECS
- event bus for all communication
- dependency injection container
- generic entity/component registries with no concrete need
- multiple layers of manager classes with overlapping responsibilities

### Incremental Adoption Plan

Apply this in small steps:

1. Extract `WorldScene` into `world/src/scenes/WorldScene.ts`
2. Introduce `createWorld()` and `WorldRuntime`
3. Move movement logic into `movementSystem`
4. Move keyboard handling into an input controller
5. Move player display object creation/sync into `PlayerRenderer`
6. Add more systems only when new gameplay demands them

## Change Log

### 2026-06-06

- Switched charset characters to per-frame assets in `world/charsets/sprites/` via `frameSourcePath`, replacing combined spritesheet sheets that bled across uneven frame bounds
- Added agent interaction extensions: `face`, `select`, `inspect`, and `startDialogue` actions with per-character `interaction` state, `facingSystem`, and updated agent observations
- Added agent scheduling and safety guardrails to `AgentOrchestrator`: decision interval, per-decision action budget, pre-dispatch validation, idle fallback, and `getLastRejectedActions()`
- Added `AgentOrchestrator` and `createCharacterAgents()` under `src/agents/orchestrator/`; `WorldScene` now delegates agent updates to `agentOrchestrator.tick(runtime)` instead of an inline loop
- Documented agent interface separation constraints: orchestration in `src/agents/orchestrator/`, no agent logic in scenes, input, or simulation systems; shared boundary is `WorldAction` dispatch only
- Created this architecture document as the canonical record for the `world/` engine
- Documented the current single-scene Phaser setup and the rule to update this file with architecture changes
- Refactored the single-scene prototype into a small character architecture with file-backed definitions, a domain normalization layer, a runtime manager, and Phaser entity wrappers
- Converted the `world/src` runtime from JavaScript to TypeScript and added shared type contracts plus a project `tsconfig.json`
- Added a recommended target architecture for separating boot, scene orchestration, world state, input, simulation, and rendering
