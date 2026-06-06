# World Agent Notes

Scope: everything under `world/`.

## Project Context

Use these files as the primary context for work in `world/`:

- [ARCHITECTURE.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/ARCHITECTURE.md) for engine structure, runtime boundaries, and architectural rules
- [Vision & Thesis.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/Vision%20&%20Thesis.md) for product vision, simulation goals, and the research framing of the project

## Documentation Rule

When a change affects the architecture of the `world/` game engine, update [ARCHITECTURE.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/ARCHITECTURE.md) in the same change.

When making product or gameplay decisions in `world/`, align them with the goals and constraints in [Vision & Thesis.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/Vision%20&%20Thesis.md).

Treat `world/ARCHITECTURE.md` as the canonical architecture document for:

- runtime stack changes
- scene structure changes
- engine boot flow changes
- input or state model changes
- new architectural subsystems

## Phaser-First Rule

Always prefer Phaser's built-in APIs over custom implementations when Phaser provides a suitable feature. Consult the [Phaser API documentation](https://docs.phaser.io/api-documentation/api-documentation) before writing new rendering, input, physics, animation, tilemap, camera, or geometry code.

Default to Phaser for:

- **Input** — `createCursorKeys()`, `JustDown()`, keyboard/gamepad events
- **Physics** — Arcade Physics bodies, velocity, collisions, world bounds, overlap callbacks
- **Animation** — `scene.anims.create()`, `sprite.play()`, animation state from runtime facing/velocity
- **Loading** — `load.image()`, `load.spritesheet()`, `load.tilemapTiledJSON()` in preload; avoid runtime texture surgery when frame dimensions are known at load time
- **Tilemaps** — `Tilemap`, `TilemapLayer`, and tile collision layers for terrain and props
- **Geometry** — `Phaser.Geom.*`, `Phaser.Math.Distance`, circle/rectangle overlap helpers
- **Game objects** — `Sprite`, `Container`, `Text`, `TileSprite`, depth/layer ordering via `setDepth()` or display lists
- **Cameras** — bounds, follow, culling, and scroll factors instead of manual viewport math

Do not reimplement Phaser features (manual frame-index math, hand-rolled collision separation, rising-edge key flags, runtime texture remove/re-add, etc.) unless there is a documented reason Phaser cannot be used.

This rule applies at the **Phaser adapter boundary** — scenes, renderers, input controllers, and entity wrappers under `src/scenes/`, `src/rendering/`, `src/input/`, and `src/entities/`. Game rules and authoritative state still live in `WorldRuntime` per [ARCHITECTURE.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/ARCHITECTURE.md); when using Phaser Physics or overlap, read results back into `WorldState` rather than letting Phaser objects become the source of truth.

When replacing an existing custom solution with a Phaser API, note the change in [ARCHITECTURE.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/ARCHITECTURE.md) if it affects runtime boundaries or data flow.

## Type Safety Rule

Do not introduce new enum-like magic strings in `world/src/`. For domains such as action types, scene keys, entity kinds, character kinds, movement modes, and controller types, define or reuse shared exported `const` objects and derive the TypeScript union types from them.

When touching existing code that compares or constructs these values, prefer the shared constants over inline string literals.

## Commit Rule

Use this commit format for changes in `world/`:

`prefix(area): message`

Do not include a description/body.

## Verification Rule

At the end of every task in `world/`, run `npm run verify` from the `world/` directory to confirm TypeScript type-checking passes. Fix any errors before considering the task complete.
