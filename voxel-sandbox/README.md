# Voxel Sandbox

A first-person 3D voxel sandbox with wave-based survival combat.
Three.js + vanilla ES modules + Vite. No game engine.

## Running

```bash
cd voxel-sandbox
npm install
npm run dev      # http://localhost:5173
npm test         # headless physics/collision tests (no browser needed)
npm run build    # production bundle into dist/
```

## Controls

| Input | Action |
| --- | --- |
| Click | Capture the mouse (pointer lock) |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `Esc` | Release the mouse |

## Architecture

The hard constraint is that **game state never imports Three.js**. Everything
under `src/core/` is plain data and math, so it runs in Node (that is how
`npm test` works) and the renderer could be swapped without touching it.

```
src/
  core/                 no Three.js imports anywhere in here
    blocks.js           block type registry (ids, colours, solidity)
    World.js            voxel volume (Uint8Array) + queries + generation
    physics.js          gravity, AABB collision, player movement
  render/               the only place that knows about both voxels and Three.js
    WorldRenderer.js    World -> InstancedMesh, one mesh per block type
    sky.js              gradient sky dome (ShaderMaterial, no textures)
  player/
    PlayerController.js pointer lock, keyboard, yaw/pitch -> physics input
  ui/
    hud.js              FPS/perf readout, crosshair, click-to-play overlay
  main.js               wiring + frame loop
tests/
  physics.test.mjs      headless collision/movement assertions
```

### Notable implementation details

- **Coordinates.** Block `(x, y, z)` occupies `[x, x+1] x [y, y+1] x [z, z+1]`,
  so its centre is at `+0.5` on each axis. `+Y` is up.
- **Two different solidity queries.** `World.isOpaqueAt` treats out-of-bounds as
  empty (used for meshing, so world edges render). `World.isCollidableAt`
  treats out-of-bounds as solid (used for physics, so the arena has invisible
  walls and a floor under `y=0`).
- **Face culling.** Only blocks with at least one air-touching face get an
  instance. On the current flat world that is 2200 of 3113 blocks.
- **Instance colour is a multiplier.** Three.js multiplies `instanceColor` by
  `material.color`, so the per-block tint attribute holds a factor near `1.0`,
  not an absolute colour. Writing the absolute colour squares the albedo and
  turns everything near-black.
- **Collision** resolves one axis at a time and snaps the penetrating face back
  to the cell boundary. Movement is substepped to at most 0.25 blocks per step,
  so nothing tunnels through a wall even on a one-second frame.
