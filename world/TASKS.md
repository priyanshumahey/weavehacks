# World Tasks

This file tracks the major implementation tasks for the `world/` game engine.

## Tasks

### 1. Boot

Scope:
- Set up Phaser config, game creation, and scene registration
- Keep startup wiring separate from gameplay logic

Outcome:
- Game startup is isolated from world behavior

### 2. Scene Shell

Scope:
- Keep `WorldScene` focused on Phaser lifecycle methods
- Use the scene to orchestrate runtime, input, and rendering

Outcome:
- The scene acts as a thin shell instead of owning game rules

### 3. World Model

Scope:
- Define the core state shapes for world, characters, entities, zones, UI, and time
- Establish stable interfaces for domain data

Outcome:
- The game has a clear, shared data model

### 4. World Runtime

Scope:
- Own authoritative world state
- Apply actions
- Advance simulation each frame
- Expose read access to current state

Outcome:
- All state mutation happens in one place

### 5. Input Adapter

Scope:
- Read Phaser keyboard or controller input
- Translate raw input into world actions such as `move` and `interact`

Outcome:
- Input becomes intent-driven rather than directly mutating objects

### 6. Simulation Systems

Scope:
- Implement movement, bounds, collisions, and interactions
- Keep game rules independent from Phaser

Outcome:
- Core gameplay logic is modular and testable

### 7. Renderer

Scope:
- Create and update Phaser display objects from runtime state
- Keep visual objects synchronized with authoritative state

Outcome:
- Rendering consumes state instead of defining it

### 8. Interaction and UI Layer

Scope:
- Handle prompts, dialogue panels, inspect flows, and other player-facing interfaces
- Keep UI concerns separate from simulation rules

Outcome:
- World interactions have a dedicated home outside the core runtime
