# World Architecture

This document is the single source of truth for the `world/` game engine architecture.

Rule: every architecture change in `world/` must be reflected in this file in the same change.

## Current Architecture

### Runtime Stack

- Build tool: Vite
- Engine: Phaser 3
- Language/runtime: JavaScript ES modules
- Package manager: Bun is the documented default, with npm and pnpm also supported

### Entry Flow

1. `world/index.html` provides the `#app` mount point.
2. `world/src/main.js` imports Phaser and bootstraps the game.
3. `new Phaser.Game(config)` creates the application with a single scene: `WorldScene`.

### Scene Structure

`WorldScene` currently owns all game behavior:

- `preload()`: no assets loaded yet
- `create()`: builds the current world view and input bindings
- `update()`: runs per-frame player movement logic

### Rendered World

The current world is a minimal prototype scene composed of:

- A solid background color
- A bordered playfield rectangle
- A title label
- A circular player marker
- A movement instruction label

### Input Model

- Keyboard input is handled through Phaser cursor keys
- Arrow keys move the player marker on the X/Y axes
- Movement is applied directly in `update()` at a fixed speed

### State Model

There is no separated game-state layer yet.

Current state is stored directly on the scene instance:

- `this.player`: the player display object
- `this.cursors`: the keyboard input bindings

## Change Log

### 2026-06-06

- Created this architecture document as the canonical record for the `world/` engine
- Documented the current single-scene Phaser setup and the rule to update this file with architecture changes
