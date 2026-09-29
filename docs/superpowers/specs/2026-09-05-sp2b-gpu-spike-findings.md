# SP2b GPU Renderer — Spike Findings and Revised Approach

Date: 2026-09-05. Status: spike complete; revises the port approach in the SP2 design (§4).

## What the spike did
Blobless-cloned LostCityRS/Client-TS and compared `225-gpu` (GPU work, tip 3f52c44) against
`274` (our vendored client base, tip 7d6ca61 = our upstream.lock pin).

## Findings (evidence)
- **No clean port path.** `225-gpu` is NOT based on 274. Their merge-base is an old common
  ancestor `74bc536`; `git diff 274..225-gpu` = **160 files, ~37k insertions / ~32k deletions**.
  274 is not an ancestor of 225-gpu and vice-versa. So the spec's "port the branch onto 274 as a
  series of commits mirroring upstream order" (§4) is not viable — there is nothing to cherry-pick
  cleanly.
- **Different graphics/scene architecture, not just paths:**
  - In 274, `Pix3D`/`Model` live in `dash3d/`; in 225-gpu they are in `graphics/`.
  - **274 has no `World3D.ts`.** Its scene is `dash3d/World.ts` + `Ground.ts`/`QuickGround.ts`/
    `Decor.ts`/`Wall.ts`/`Square.ts`/`TerrainOverlayShape.ts`. The GPU facade's scene hooks
    (`drawTileUnderlay`/`drawTileOverlay`, model draws) are written around 225's `World3D`.
  - 274 keeps `Colour.ts`/`Pix32.ts`; 225-gpu renamed to `Colors`/`Pix24`.
- **The renderer code itself is a clean, self-contained new tree:** `src/graphics/renderer/**`
  (`Renderer.ts` static facade, `webgl/*`, `webgpu/*`, `shaders/*` — ~10k lines). 274 has no
  `renderer/` tree, so the tree ADDS without collision, but it references 225-era Model/Pix3D/
  World3D internals (vertex arrays, HSL palettes, texture atlases) that differ in 274.
- **The facade is well-designed for safety:** every draw method returns `void` or a `boolean`
  ("handled → skip software"); when `Renderer.renderer` is unset, all calls fall through to the
  existing software raster unchanged. This is the key safety property for an incremental port.

## Revised approach (staged, software-path-safe)
The port is a **hand adaptation**, not a cherry-pick, and larger/riskier than §4 estimated. Stage it:

- **SP2b-1 — client-tier plugin registry** (`window.idlescape.plugins` + `ClientCapability`;
  renderer/scene/menu capabilities present but stubbed; wires the SP2a `onClientToggle` seam).
  Clean, bounded, testable, independent of the port's difficulty. Foundation for the renderer
  plugin and future SP5 scene plugins.
- **SP2b-2 — vendor renderer facade + WebGL backend, adapted to compile against 274**, with the
  facade left UNSET (returns false everywhere) → software path 100% unchanged, zero visual diff.
  Milestone: code present and compiling, nothing changes.
- **SP2b-3 — wire facade hooks incrementally, simplest first**, each behind the `gpu-renderer`
  plugin toggle, verifying the software path is byte-identical when off:
  1. `renderPixMap` / fullscreen blit (no scene internals).
  2. Triangle fills in 274 `dash3d/Pix3D.ts`.
  3. Model draws (274 `dash3d/Model.ts`).
  4. Terrain/scene hooks — the HARD part: 225 `World3D` tile draws must be re-mapped onto 274's
     `World.ts`/`Ground`/terrain classes. Time-box; if it fights back, ship WebGL for models/UI
     only and leave terrain on software.
  Defer WebGPU entirely (spec already allows this).

## Risk call
SP2b-1 and SP2b-2 are tractable and safe. SP2b-3 step 4 (terrain) is the real uncertainty and may
not map cleanly; the software-fallback design means a partial port still ships a working client.
Recommend a checkpoint after SP2b-2 before investing in SP2b-3 step 4.

## Addendum — backend coupling depth (refines the staging)
Examined the WebGL backend's imports/coupling:
- `RendererWebGL.ts` = the fullscreen **present** path (`renderPixMap` blits the software PixMap
  framebuffer to a GL texture via fullscreen-pixmap/texture shaders). Low coupling — needs PixMap +
  a GL canvas; mostly 274-agnostic. **This is the safe first GPU milestone.**
- `RendererWebGLC.ts` (1322 lines) = the **scene rasterizer**; imports `World3D`, `Ground`,
  `TileOverlay/Underlay`, `Model`, `Pix3D` and reads their internals to build GPU geometry. Also
  needs `gl-matrix` (new npm dep). 274 has no `World3D` (uses `World`/`Ground`/terrain classes), so
  this is the hard, high-risk adaptation.
- Facade hook sites to re-insert into 274: Pix3D 6, Model 4, World3D 3, GameShell 2, PixMap 2 (~17).

### Final staging (careful, software-path-safe)
- **SP2b-1 — client-tier plugin registry** (`window.idlescape.plugins` + `ClientCapability`,
  renderer/scene/menu stubbed, real `state()`; wires SP2a `onClientToggle`). Low-risk foundation.
- **SP2b-2 — fullscreen WebGL present path**: `gpu-renderer` client plugin that, when enabled,
  blits the software framebuffer (PixMap) to a WebGL canvas (RendererWebGL `renderPixMap` +
  fullscreen shaders). Software raster unchanged; proves the whole pipeline end-to-end at low risk.
  Feature-detect WebGL; fall back to software with a toast on failure.
- **SP2b-3 — scene rasterizer (HIGH RISK, checkpoint first)**: adapt `RendererWebGLC` to 274's
  `World`/`Ground`/terrain, add `gl-matrix`, wire the Pix3D/Model/World hook sites incrementally,
  each verified software-identical when off. Time-box; if terrain fights back, ship models/UI on GL
  and leave terrain software. Defer WebGPU entirely.

## SP2b-2 concrete design (locked; minimal fullscreen present)
Investigation of 274 presentation + 225-gpu RendererWebGL settles SP2b-2 as a MINIMAL present path,
NOT a port of the 512-line RendererWebGL:
- **274 presentation:** single `#canvas` with a hardcoded 2D context (`graphics/Canvas.ts` module
  singletons `canvas`/`canvas2d`); `PixMap.draw(x,y)` = `ctx.putImageData(this.img, x, y)`. A canvas
  with a 2D context CANNOT also get WebGL → the GPU present needs a SEPARATE WebGL canvas.
- **225-gpu `RendererWebGL.init(container,w,h)`** creates its own `<canvas>` and appends to a
  container — confirms the second-canvas approach.
- **Minimal SP2b-2 backend `WebGLPresent`** (write fresh, ~150 lines): implements only
  `renderPixMap(pixmap,x,y)` (gl.texImage2D from the PixMap's pixel buffer → fullscreen quad via the
  `fullscreen-pixmap` vert/frag shaders vendored from 225-gpu), plus `resize`/`resetRenderer`.
  ALL other facade methods return `false`/void → software path unchanged (models, scene, UI all
  still software-rendered; GL only blits the finished framebuffer).
- **Vendor (adapted to 274 import paths):** `graphics/renderer/Renderer.ts` (facade),
  `graphics/renderer/webgl/{Shader.ts,ShaderProgram.ts,WebGLResource.ts}`,
  `shaders/fullscreen-pixmap.{vert,frag}.glsl.ts`. Do NOT vendor RendererWebGLC/webgpu/main shaders.
- **PixMap pixel access:** `renderPixMap` needs the PixMap's RGBA bytes — add a public getter to
  274 `graphics/PixMap.ts` exposing `img.data` (or the Int32 pixel array). Small, additive.
- **Hook:** in `PixMap.draw(x,y)`, prepend `if (Renderer.renderPixMap(this, x, y)) return;` before
  `putImageData`. (2 Renderer.* calls in 225-gpu PixMap matches this.)
- **capability.renderer (SP2b-1 stub → real here):** `set('webgl')` feature-detects WebGL2, creates
  the WebGL canvas overlaying `#canvas` (sized to match, kept in sync with the shell's canvasSize),
  instantiates `WebGLPresent`, sets `Renderer.renderer`; on failure → toast + revert to 'software'.
  `set('software')` calls `Renderer.resetRenderer()` and removes/hides the GL canvas.
- **gpu-renderer plugin:** shell manifest `tier:'client'`, settings `mode: select(software,webgl)`,
  registered on the shell; a client plugin (in the bundle) whose `onEnable` calls
  `cap.renderer.set(mode)`. Toggling flows shell → onClientToggle → window.idlescape.plugins.
- **Reserved (terser):** setting keys crossing the boundary (`mode`) + any capability method names
  the web touches — verify at integration (this is where SP2b-1's deferred terser check lands).
- **Verify:** software path byte-identical when off; when on, the game still renders (via GL blit)
  with no visual regression; toggle 10× leaks no canvases/contexts. Full visual e2e needs the
  memory-constrained stack (deferred); typecheck + client build + unit are the standing gate.
- **Risk:** low — no scene internals touched; the only sensitive edits are the module-level
  Canvas/PixMap singletons and canvas sizing sync. SP2b-3 (scene rasterizer) remains the hard,
  checkpointed stage after this.
