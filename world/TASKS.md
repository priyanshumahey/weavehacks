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
- 12. Agent Orchestrator
- 16. Asset Loading and Registry
- 17. Character Sprite Metadata
- 18. Sprite-Backed Character Renderer
- 19. Character Animation and Facing
- 20. Terrain Base Layer
- 21. Props and Building Placement
- 22. Render Layering and Depth Rules
- 23. Asset Rendering Validation

## Planned: Agent Interaction Layer

### Boundary rules

Agent interaction must stay on a **separate adapter path** parallel to player input — not merged into scene, input, or simulation logic.

- **Agent code lives in `src/agents/`** (orchestrator under `src/agents/orchestrator/`). Scenes wire collaborators only; they do not call `decide()`, own agent instances long-term, or implement scheduling.
- **Player code stays in `src/input/`**. `WorldInputController` must not branch on agent behavior or read agent observations.
- **World rules stay in `src/world/`**. Simulation systems resolve action outcomes; they do not embed agent decision logic or LLM calls.
- **Shared contract only at the runtime boundary**: both paths produce `WorldAction[]` and call `WorldRuntime.dispatch(action, controller)`. Convergence is intentional; shared decision logic is not.
- **Read path**: agents consume `WorldRuntime.getObservation()` (cloned, read-only). **Write path**: `WorldRuntime.dispatch(..., "agent")` with controller ownership checks. Agents never mutate `WorldState` directly.
- **Task 14 extensions** add action types and system handlers in `src/world/`; agent-specific *choice* logic remains in `src/agents/`. No agent-only branches in `WorldScene`, `WorldInputController`, or renderers.

- 13. Agent Scheduling and Safety Rules
  Add guardrails in the orchestrator layer for tick rate, action budgets, invalid action rejection, and fallback behavior so multiple agents can run predictably without stalling the simulation or spamming commands every frame.

- 14. Interaction Extensions for Agents
  Extend the shared action and interaction model as needed for agent-driven play, such as explicit facing, inspect/select actions, or richer dialogue initiation. New handlers live in `src/world/`; agents consume the extensions through `decide()` → `dispatch()` only.

- 15. Debug and Visibility Tooling
  Add development-facing debugging under `src/agents/` (or a dev-only submodule) for agent-controlled characters: current controller type, latest observation summary, last chosen action, and rejected commands. Must not couple to player input or gameplay UI renderers.

## Planned: Asset Integration Layer

_All asset integration tasks are complete._

## Planned: Sprite and Image Improvements (Phaser 4)

Audit source: sprites-and-images skill review of `CharacterSprite`, `PropSprite`, and related preload/render paths.

In Phaser 4, `Sprite` and `Image` share the same visual component mixins (`Transform`, `Origin`, `Tint`, `Alpha`, `Flip`, `Depth`, `TextureCrop`, etc.) — the only meaningful difference is that `Sprite` owns an `AnimationState` (`sprite.anims`), runs `preUpdate` every frame, and is added to the scene `updateList`. Static world art should use `Image`; only entities that call `play()` / `stop()` need `Sprite`.

Factory methods accept an optional frame at creation time: `this.add.sprite(x, y, texture, frame)` and `this.add.image(x, y, texture, frame)`. The `TextureCrop` component also exposes `setTexture(key, frame)` and `setFrame(frame, updateSize, updateOrigin)` — when `updateOrigin` defaults to `true`, Phaser recalculates origin from the frame, which can undo a prior `setOrigin()` call.

Sizing can be driven through the `Size` component: `setDisplaySize(width, height)` or assigning `displayWidth` / `displayHeight` adjusts scale for you, instead of manually dividing target pixels by frame height. Depth sorting should be based on the sprite foot, which is controlled by `origin` — `setOrigin(0.5, 1)` anchors the bottom-center (feet), while `(0.5, 0.5)` anchors the center.

- ~~24. PropSprite: use Image instead of Sprite~~ ✓
  `PropSprite` uses `scene.add.image()` and `Phaser.GameObjects.Image` for static prop rendering — no per-frame `preUpdate` or `updateList` membership.

- 25. setFrame: preserve authored origin and scale
  `PropSprite.applySpritePresentation()` calls `setOrigin()` then `setFrame(index)` with Phaser defaults (`updateSize=true`, `updateOrigin=true`). That second call can reset origin back to the frame default (0.5, 0.5), undermining the authored bottom-center `(0.5, 1)` origin and breaking foot-based Y-sort math in `resolvePropSortY()`. `CharacterSprite` has the same risk when falling back to a static frame via `setFrame(resolveCharacterFrameIndex(...))` without flags. Pass `setFrame(index, false, false)` whenever origin and scale are already set manually. In Phaser terms: `updateOrigin=false` keeps your `Origin` component values; `updateSize=false` keeps your `Size` / scale values.

- 26. Sizing: use setDisplaySize / displayHeight instead of manual scale math
  `CharacterSprite` computes `displayScale = targetHeight / frameHeight` and calls `setScale(displayScale)`. Phaser's `Size` component provides `setDisplaySize(width, height)` and writable `displayHeight` / `displayWidth` properties that adjust `scaleX` / `scaleY` for you. Refactor `applyBodyAnimation()` and `PropSprite.applySpritePresentation()` to set visual size through `displayHeight` (or `setDisplaySize`) so sizing intent reads as "this sprite should be N pixels tall" rather than a derived scale ratio. Update `resolveDisplayHeight()` helpers to read from the game object where possible.

- 27. Animation keys: deduplicate across character instances
  `CharacterSprite.buildPhaserAnimationKey()` includes `characterId`, so two NPCs sharing the same spritesheet register duplicate `scene.anims.create()` entries (`scout:world/characters/scout:walk:down`, `guard:world/characters/scout:walk:down`, etc.). Phaser animations are global per scene and keyed by string — they should be shared per texture/animation/facing, e.g. `${textureKey}:${animationKey}:${facing}`. Deduplicating reduces `AnimationManager` memory and avoids redundant `anims.exists()` checks on every sync.

- 28. Factory creation: pass texture and frame at construction
  Both entity classes create bodies as `scene.add.sprite(0, 0, textureKey)` with no frame, then call `setTexture()` / `setFrame()` again in `sync()` every tick. Phaser factory methods accept the initial frame as the fourth argument: `scene.add.image(0, 0, textureKey, frameIndex)`. Use this in constructors for props with `sprite.frame` metadata, and in `applyBodyAnimation()` only call `setTexture` / `setFrame` when the texture or frame actually changed (pairs with task 29).

- 29. Sync gating: skip redundant presentation updates
  `CharacterSprite.sync()` and `PropSprite.sync()` re-run full presentation logic every frame even when `facing`, `animation`, `textureKey`, `scale`, and `origin` are unchanged. Each unnecessary `setTexture()`, `setScale()`, `setOrigin()`, or `play()` triggers Phaser component recalculation (origin pixels, display size, animation restart). Track a small last-applied snapshot (texture key, frame index, scale, origin, facing, animation key) and only update the properties that changed. Sprites still update position and depth every frame.

- 30. Character origin: add authored origin metadata (parity with props)
  Props support configurable `sprite.origin` (default bottom-center `0.5, 1`); characters hardcode `setOrigin(0.5, 0.5)` and compensate with `resolveCharacterSortY(position.y + displayHeight * 0.5)`. In Phaser, `origin` is the normalized pivot (0–1) that controls both visual anchoring and where `displayOriginX` / `displayOriginY` land in world space. Add `sprite.origin` to character metadata (default `(0.5, 1)` for feet-anchored positioning), apply it in `CharacterSprite`, and unify foot-sort math with `resolvePropSortY()` so characters and props use the same depth formula. Simplifies label badge positioning (no `displayHeight * 0.5` offset workaround).

- 31. Label badges: evaluate NineSlice for character name plates
  `CharacterSprite` draws label backgrounds with `Graphics.fillRoundedRect()`. Phaser provides `this.add.nineslice()` for scalable UI panels where corners stay fixed and edges stretch — ideal for name badges that vary in text width. Lower priority until a panel texture asset exists; if adopted, replace the manual graphics redraw in `redrawLabelBadge()` with a `NineSlice` resized to `labelText.width + padding`.

- 32. Static prop batching: evaluate Blitter for high prop counts
  Phaser's `Blitter` renders large numbers of static or semi-static sprites via lightweight `Bob` children — no per-object rotation, scale, or physics, but significantly fewer draw calls than individual `Image` objects. Not needed at current prop counts, but worth evaluating if placements grow into hundreds of identical decorations (trees, rocks, grass tufts). Would require a separate render path for homogeneous static props vs. heterogeneous buildings.
