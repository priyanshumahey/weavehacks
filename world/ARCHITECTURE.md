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

1. `world/index.html` provides the `#app` mount point.
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

`WorldScene` is now an orchestration scene. It wires dedicated collaborators for layout, input, runtime state, and rendering:

- `create()`: builds the world frame, creates the initial world state, instantiates the runtime and renderer, and binds input
- `update()`: reads input intent, dispatches actions into the runtime, advances simulation, and asks the renderer to reflect current state

### Character Architecture

Characters are file-backed and split into three layers:

- `src/data/characters/`: authored JSON definitions, one file per character
- `src/domain/characters/`: normalization and validation of character definitions into a stable runtime shape
- `src/world/`: `createWorld()` and `WorldRuntime`, the authoritative world-state layer responsible for state creation, action handling, and frame stepping
- `src/rendering/characters/`: Phaser-facing rendering adapters such as `CharacterRenderer`
- `src/rendering/world/`: scene frame and presentational world shell helpers
- `src/input/`: input readers that convert Phaser APIs into scene-level intent
- `src/entities/`: Phaser-facing wrappers such as `CharacterSprite`
- `src/types/`: shared TypeScript contracts for character definitions, instances, and world bounds

The scene does not treat Phaser game objects as the source of truth for character state. Runtime state lives in `WorldRuntime`, and rendered entities mirror that state through renderer modules.

### Rendered World

The current world is a minimal prototype scene composed of:

- A solid background color
- A bordered playfield rectangle
- A title label
- A set of character markers rendered from JSON definitions
- A movement instruction label

### Input Model

- Keyboard input is handled through Phaser cursor keys
- `WorldInputController` is the input adapter boundary for Phaser input devices
- Arrow keys are translated into a `move` world action with normalized directional intent
- `E` and space are translated into an edge-triggered `interact` world action
- The scene forwards adapter-produced actions into `WorldRuntime` and does not construct movement commands itself

### State Model

There is now a separated character state layer and a shared world-model contract in `src/world/worldState.ts`.

Current state is split as follows:

- `WorldScene`: Phaser lifecycle only
- `WorldInputController`: input polling and intent creation
- `createWorld()`: serializable world-state construction from authored definitions
- `WorldRuntime`: authoritative state mutation, action application, and per-frame simulation
- `CharacterRenderer` and `CharacterSprite`: visual representation for each character
- `createWorldFrame()`: static world presentation and bounds setup
- `worldState.ts`: serializable interfaces for world bounds, entities, characters, zones, UI, and time

The only scene-local mutable state required is references to its collaborators.

The shared model is intentionally plain data:

- `WorldState`: top-level container for `characters`, `entities`, `zones`, `ui`, `time`, `bounds`, `playerId`, and `seed`
- `WorldEntityState`: base interface for world objects with identity, position, tags, traits, zone membership, and interaction flags
- `CharacterState`: character-specific extension with movement, dialogue, appearance, velocity, and move intent
- `ZoneState`: named world partitions with bounds and entity membership
- `UiState`: prompt, dialogue, inspection, and selection state
- `WorldTimeState`: elapsed time, tick counter, and time scale

Existing character definition and instance types in `src/types/character.ts` are compatibility contracts layered on top of this shared model so current gameplay code can keep moving while the broader runtime is built out.

### Runtime Flow

Per frame, the current runtime flow is:

1. `WorldInputController` reads Phaser keyboard state and returns world actions for the current player.
2. `WorldScene` forwards those actions into `WorldRuntime`.
3. `WorldRuntime` stores move intent on the authoritative character state, resolves interaction targets, advances movement and time, and clamps positions to world bounds.
4. `CharacterRenderer` reads the current runtime state and syncs Phaser objects to it.

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

- Created this architecture document as the canonical record for the `world/` engine
- Documented the current single-scene Phaser setup and the rule to update this file with architecture changes
- Refactored the single-scene prototype into a small character architecture with file-backed definitions, a domain normalization layer, a runtime manager, and Phaser entity wrappers
- Converted the `world/src` runtime from JavaScript to TypeScript and added shared type contracts plus a project `tsconfig.json`
- Added a recommended target architecture for separating boot, scene orchestration, world state, input, simulation, and rendering
