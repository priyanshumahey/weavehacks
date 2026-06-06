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

## Type Safety Rule

Do not introduce new enum-like magic strings in `world/src/`. For domains such as action types, scene keys, entity kinds, character kinds, movement modes, and controller types, define or reuse shared exported `const` objects and derive the TypeScript union types from them.

When touching existing code that compares or constructs these values, prefer the shared constants over inline string literals.

## Commit Rule

Use this commit format for changes in `world/`:

`prefix(area): message`

Do not include a description/body.

## Verification Rule

At the end of every task in `world/`, run `npm run verify` from the `world/` directory to confirm TypeScript type-checking passes. Fix any errors before considering the task complete.
