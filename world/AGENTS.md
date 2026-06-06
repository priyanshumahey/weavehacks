# World Agent Notes

Scope: everything under `world/`.

## Documentation Rule

When a change affects the architecture of the `world/` game engine, update [ARCHITECTURE.md](/Users/alekkarp/Projects/weavehacks/weavehacks/world/ARCHITECTURE.md) in the same change.

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
