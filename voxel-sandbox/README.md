# Voxel Sandbox

A first-person 3D voxel sandbox with wave-based survival combat.
Three.js + vanilla JS (ES modules) + Vite. No game engine beyond Three.js.

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # headless logic tests (node:test, no browser needed)
npm run build
```

## Controls (Phase 1)

| Input | Action |
| --- | --- |
| Click | Capture the mouse (pointer lock) |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `Esc` | Release the mouse |

## Architecture

The hard rule: **the voxel/game layer never imports Three.js.** Rendering reads
from game state, never the reverse — so the renderer can be swapped without
touching gameplay. The unit tests exercise the world and physics in plain Node,
which is only possible because that boundary holds.

```
src/
  core/constants.js        tuning values (no imports at all)
  world/
    blocks.js              block type registry (id, colour, solid, opaque)
    VoxelWorld.js          chunked voxel storage + queries
    worldgen.js            flat terrain generation
  physics/
    Player.js              player state, movement, AABB-vs-voxel collision
  input/
    InputState.js          keyboard / pointer lock -> movement "intent"
  render/                  <- the only place `three` is imported
    SceneManager.js        renderer, camera, lights, fog
    TerrainRenderer.js     VoxelWorld -> InstancedMesh
    Sky.js                 gradient sky dome (shader, no texture assets)
  ui/Hud.js                DOM overlay (FPS / block count / position)
  main.js                  wiring + fixed-timestep game loop
```

### Notes on the non-obvious parts

- **Chunked storage.** 16×64×16 chunks in a `Map`, each a flat `Uint8Array`.
  Chunk/local coordinate maths uses `Math.floor` and a positive modulo so
  negative world coordinates map correctly (`x = -1` is chunk `-1`, local `15`).
- **Fixed-timestep physics.** Player simulation runs at a fixed 1/120 s
  independent of the display refresh rate, with leftover time carried between
  frames. Collision resolution assumes each step moves less than one block,
  which that timestep guarantees at our top speed.
- **Axis-separated collision.** X, then Z, then Y — resolving each axis alone
  is what makes sliding along a wall work instead of sticking to it.
- **Instanced terrain.** One `InstancedMesh` per block type, so the whole world
  is a handful of draw calls. Two culling passes keep the instance count down:
  blocks outside `RENDER_DISTANCE` are skipped, and fully buried blocks
  (all six neighbours opaque) are never emitted. Below y = 0 counts as opaque
  bedrock for culling, which removes the unreachable underside of the world.
- **Per-block tint.** Untextured cubes of one type are pixel-identical, so a
  field of them reads as a flat sheet. A deterministic hash of the block
  coordinate applies a small brightness jitter; it is a pure function of
  position so blocks don't shimmer when the mesh rebuilds.
