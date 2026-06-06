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

## Commit Rule

Use this commit format for changes in `world/`:

`prefix(area): message`

Do not include a description/body.
