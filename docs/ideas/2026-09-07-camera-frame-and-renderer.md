# Idea: camera, frame rate and draw distance now, a modern renderer later

Recorded: 2026-09-07, from the owner, in conversation
Status: brainstorming; stage 1 is **sprint row 9, "Camera, frame and renderer"** (D41), spec being written (owner gave the camera-and-frame entry a row on 2026-09-07; see the round-two addition)
Touches: the client fork (`client/src/client/Client.ts`, `GameShell.ts`, `dash3d/World.ts`),
`client/PATCHES.md`, sprint entry 3 (the client-fork gate), entry 4 (shell v2, the `config`
panel), entry 8 (the next batch of numbered client patches), entry 17 (SP5), decision D18 (the
dormant client plugin tier and the `advanced-controls` candidate), the GPU spike findings
`2026-09-05-sp2b-gpu-spike-findings.md`

## The idea, in the owner's words

- What I am interested in is a lot of RuneLite GPU quality of life mainly: zoom, range, fps and
  so on.
- Today the itch is zoom, fps, draw distance; then fog and 2007scape-like graphics, lower
  priority. The nostalgia build we are on is purely because it was a good starting point. Not a
  project canceller or anything, just getting an idea.
- Add settings for all of those, particularly a slider from default to the maximum range we can
  do without pop-in, in a settings UI.
- Ideally unlocked fps, but a smooth 60 is a great improvement.
- Related, longer term: could a client inspired by osrs.world be built, cut down to our engine's
  needs?
- (Round two) Give them a row now. Include a WASD camera movement setting that works like
  RuneLite: blocking text input and allowing WASD to rotate the camera, and when Enter is pressed
  regular chatbox functions again and you are in typing mode.

## First consideration

**A correction to the premise first.** This repository never shipped a GPU renderer that was then
disabled. The WebGL and WebGPU work is upstream Lost City's `225-gpu` branch by dennisdev, and it
was never merged to revision 274. Our fork was rebased to 274 on 2026-09-05 without it, the spike
measured the port as a large divergence with terrain as the hard part, and D18 ruled the client
plugin tier dormant because nothing needed it. The question is "port or rewrite", not "re-enable".

**Most of the wish list does not need a GPU.**

| Wish | Needs a GPU? | Where it is in the fork |
|---|---|---|
| Zoom | No | Camera distance is `pitch * 3 + 600` (`Client.ts:6572`); a factor plus a wheel handler is one numbered patch. Vanilla OSRS shipped zoom in software mode |
| Pitch, free look, WASD | No | Already the `advanced-controls` candidate under D18 |
| FPS | Partly | `GameShell` clamps the target at 50 (`GameShell.ts:259`) and couples update and draw at 20 ms. A display-rate draw with camera interpolation between 20 ms cycles is a loop change. Software cost is linear in frames: 60 is plausible, unlocked to a 144 Hz monitor is not without a GPU backend |
| Draw distance | Mostly | The far clip is 3500 units, about 27 tiles (`World.ts:938`). Raising it is a constant. What bounds "no pop-in" is not the clip but the loaded scene: the client holds a 104 by 104 tile region and the server rebuilds it when the player nears an edge, so the guaranteed radius without void depends on the rebuild policy, which is an engine-side rule. A private world can rebuild more eagerly at the cost of more rebuild stutters |
| Fog, anti-aliasing, smooth textures, a 2007 look on this world | Yes | GPU only. No new art: the 2004 cache is the only art there is, so "2007-like" means lighting, fog, filtering and distance, not new models |

**The staged path.**

1. **Camera and frame patches** (small, one entry of numbered client patches after entry 3 makes
   patches checkable, possibly riding with entry 8's batch): zoom, pitch range, wheel and WASD,
   the display-rate draw loop with interpolation, and a fps target setting. Each is a setting.
2. **Draw-distance spike** (one session, throwaway): raise the far clip, measure fps at two and
   three times the default on the software rasteriser, and find the real no-pop-in bound under the
   current rebuild policy. Its output is the slider's maximum and whether the engine's rebuild
   rule needs a private-world override.
3. **A WebGL scene backend** behind the client's draw seam (the spike's SP2b-3, high risk), using
   osrs.world's renderer as the reference: same author as `225-gpu`, BSD-2-Clause, actively
   maintained, already loads old-format caches. It consumes the client's in-memory scene
   (`Ground`, `Model`, `World`) rather than re-parsing caches. This is what removes the fps and
   distance ceilings.
4. **Fog, filtering and the rest** on that backend.

**Skip the standalone GL present path (SP2b-2).** It blits the same software pixels through a GL
texture and yields no visible change; it only makes sense as the first commit of stage 3.

**The settings surface.** A "Display" section in the existing `config` panel, not a new panel:
the shell v2 icon strip ships exactly eleven glyphs and entry 4's argument depends on that count.
Settings: zoom, draw distance (a slider whose maximum is stage 2's finding), fps target with an
"unlocked" position, pitch limit, and later fog. Persisted per browser under the `cs.` prefix.

**On an osrs.world-shaped client.** Not as a client: the viewer covers terrain, locs and spawns
and none of the protocol, interfaces, animation sync or input that make up the fork's fourteen
thousand line `Client.ts`. It fits twice: as the renderer reference for stage 3, and as a
standalone free-camera viewer of our world fed by live positions, which would be the battlebots
spectator and replay window and SP5's world map in one. The three ideas in this directory
converge on one WebGL scene renderer.

**Dependencies, in order.** Entry 3 (checkable patches), then stage 1 at any point; stage 2 any
time; stage 3 after shell v2 (its settings live in the `config` panel) and after SP5's scene half
if that lands first, since both read the same scene structures.

**Rough size.** Stage 1 small. Stage 2 a session. Stage 3 large, its own entry with a checkpoint
after terrain renders. Stage 4 medium.

**Questions a brainstorm would settle.**
1. The rebuild policy: override the engine's edge threshold for this world, or send a larger
   scene? The first is one constant in an overlay; the second is a protocol change.
2. Interpolation in the draw loop: camera only, or entity positions too? Camera only is safe and
   gives most of the smoothness.
3. Stage 3's seam: a backend behind `World.draw` only, with UI and interfaces staying software, or
   the full `Renderer` facade from the spike?

**Doors to leave open now.** Entry 8's client patches keep scene drawing behind one call so a
backend can replace it. The `config` panel in shell v2 reserves a "Display" section. The draw-loop
change is written so a backend can drive it at any rate.

## Round two addition (2026-09-07)

The owner gave the camera-and-frame client-patch entry a row in this sprint (it had been placed
by D40 as a spec-writing item after entry 8; the owner's instruction is that it becomes a row
now). One setting is added to its scope, in the owner's words above: **WASD camera, RuneLite
style.**

How it behaves, so the spec does not have to rediscover RuneLite's rules:

- A setting in the `config` panel's Display section, off by default, persisted under a `cs.` key.
- When on and not in typing mode, W, A, S and D act as the four arrow keys (the client already
  rotates and pitches the camera on the arrows) and are swallowed before the chat input sees
  them. Every other printable key is also swallowed, so nothing lands in the chatbox by accident.
- Enter switches to typing mode: the chat input takes keys as it does today. Enter in typing mode
  sends the line as usual and returns to camera mode. Escape in typing mode clears the line and
  returns to camera mode.
- Typing mode is entered automatically when the client opens a text prompt (the amount prompt on
  withdraw-X, name entry, the `::` command line), and camera mode resumes when the prompt closes.
  This is the rule RuneLite applies and the one that stops the setting fighting the bank.
- A one-word hint in the chatbox ("Press Enter to chat") while in camera mode, drawn by the shell
  over the canvas rather than by a client patch, so the client patch stays a key-routing change.

Where it lands in the fork: the keyboard path in `Client.ts` around the chat input handling (the
`::fps` command lives there, near line 5455) and `GameShell`'s key events. One numbered patch with
its grep line, in the same batch as zoom, pitch, the display-rate draw loop and the fps target.

## Draw-distance spike (2026-09-07)

**This is a spike. Read-only, no code kept.** Queue item 9 under D40, run on `sprint/dragon-slayer`
without building, running or touching the live stack. The working notes were written into
`.superpowers/sdd/2026-09-07-draw-distance-spike/findings.md`, a git-ignored workspace a fresh clone
does not have, so the file paths, the line numbers and the arithmetic that carry the argument are
inlined below and this section stands alone. Everything below is either read out of the source or
derived from it; the two estimates are labelled as estimates.

### 1. What "draw distance" can mean here, and which one the slider moves

Three separate things, and the idea file's first consideration conflated two of them:

- **The built scene.** 4 x 104 x 104 tiles, `BuildArea.SIZE = 13 << 3` in
  `client/src/dash3d/CollisionMap.ts:7-10`, allocated once at startup
  (`client/src/client/Client.ts:3124-3126`) and never resized. Its size is the server's: it is what
  `REBUILD_NORMAL` sends. Changing it is a protocol change.
- **The drawn window.** `client/src/dash3d/World.ts:982-1000`, in `renderAll`: `World.minX = gx - 25`
  through `World.maxX = gx + 25`, so a 50 x 50 tile window per level around the camera tile. The
  literal `25` recurs about 25 times in that one file, in the visibility lookup (`:1014`), the
  painter's-algorithm fill traversal (`:1030-1093`) and every occluder transform (`:1258-1360`).
- **The far clip.** Two constants, both `3500` units, both upstream. `World.ts:938` is inside
  `testPoint`, which only bakes the startup visibility table; `Model.ts:1723` (`midZ >= 3500`) is the
  live per-model clip evaluated every frame.

There is **no fog** in the client at all; fog is stage 4 and GPU-only.

The correction that matters: **the far clip is not the binding limit, and neither is the window on
its own.** 128 units per tile makes 3500 units 27.3 tiles of camera-space depth; the camera sits
`pitch * 3 + 600` behind and above the player, that is 7.7 to 13.7 tiles, so forward ground reach is
roughly 20 to 27 tiles, and the tile window is 25. The two were tuned to each other. **The slider
must move both together** (the window in `World`, the model clip in `Model`), or you get a bigger
tile loop that still cuts at 27 tiles, or locs vanishing over ground that still draws.

One side finding for this row's zoom patch, not the slider: `resetVisCalc`
(`client/src/client/Client.ts:3489-3497`) bakes `angle * 3 + 600`, the same camera-distance formula,
into the visibility table. **A zoom setting invalidates that table too.**

### 2. The cost model, with the numbers the code gives

Write R for the draw radius, 25 today.

**Per frame, quadratic in R.** The visibility pass (`World.ts:1005-1026`) is `levels x (2R)^2`:
10,000 tile visits at R=25 with four levels, 40,000 at R=50, 90,000 at R=75. The fill traversal
(`:1028-1110`) is another `4 x R^2` per level.

**Per frame, almost flat in R.** The rasteriser. `Pix3D.gouraudTriangle`, `flatTriangle` and
`textureTriangle` all write scanlines into a fixed 512 x 334 viewport, so total pixel fill is bounded
by the viewport however far the scene reaches. What grows is the per-face **setup**: `Model.render2`
(`Model.ts:1849-1910`) walks every face of every visible model doing three array loads per vertex, a
backface cross product and a depth-bucket insert.

So the model is: **setup scales O(R^2) inside the view wedge, fill barely scales at all**, because
distant triangles cover few pixels. For a software rasteriser at this resolution fill is normally the
larger half, so doubling R should cost well under 4x. **Estimate, unmeasured: 1.5x to 2.5x frame time
going from R=25 to R=50.**

**Memory.** `World.visBacking` is `TypedArray4d(8, 32, 51, 51)` (`World.ts:116`), that is 8 pitch
buckets x 32 yaw buckets x (2R+1)^2 booleans. At 4 bytes per V8 slot: **~2.7 MB at R=25, ~10.4 MB at
R=50, ~23.4 MB at R=75.** The scene arrays themselves do not change, since the scene does not.

**Startup, and the cost of moving the slider.** `resetVisCalc` (`World.ts:858-928`) runs 288 camera
orientations over `(2R+3)^2` tiles with up to 11 `testPoint` samples each: up to 8.9 million calls
today, about 34 million at R=50. Estimated 0.1 to 0.3 s today and 0.4 to 1.0 s at R=50. **The table
has to be rebuilt every time the slider moves, so the setting applies on release, not while
dragging, and wants a brief busy state.**

**Rebuild time on region change.** Unchanged by the slider, and worth recording anyway: `mapBuild()`
(`Client.ts:7519-7624`) is on the order of 400,000 tile-level iterations plus a fresh `ClientBuild`
allocating ~440 KB of scratch, and `Client.ts:9281-9354` then shifts every entity including a 43,264
iteration `groundObj` pass. **Nothing times it**: `sceneLoadStartTime` feeds only a 6-minute stall
watchdog (`:7466-7469`).

**Effect on the 20 ms loop.** None directly. `deltime` stays 20 and `mainloop` stays at 50 Hz. What a
bigger R changes is how often `GameShell` drops a draw, which it does gracefully by design: see 4.

**Two things wrongly suspected and cleared.** `Model.tmpDepthFaces` (`1500 x 512`, `Model.ts:108-109`)
is indexed by the model's own bounding-sphere depth (`minDepth`/`maxDepth`, `:1005-1006`), not scene
depth, so a longer clip cannot overflow it. And there is **no level of detail anywhere in the
renderer**: no distance-based decimation, no mipmaps, no screen-size early-out. `Pix3D.lowDetail` is
an inventory-icon switch; `ClientPlayer.lowMemory` is population-based (`Client.ts:6676`, 50 and 200
players). Every model that survives culling is drawn at full face count at any distance. That absence
is the single biggest reason distance is expensive in software and cheap on a GPU, and it is the
strongest argument for stages 3 and 4.

### 3. The slider: range, default, maximum, and whether the rebuild rule has to change

**Recommendation: a five-stop slider from 15 to 50 tiles, default 25, maximum 50.** Stops at 15, 25,
32, 40, 50. No engine change, no rebuild-policy override.

**Why 25 is the default.** It is exactly today's behaviour, and it is the radius the 3500 far clip
and the visibility table were tuned against. A setting that ships with the current value as its
default cannot regress anyone.

**Why 50 is the maximum, and why it is a real ceiling rather than a picked number.** The scene is 104
tiles across, so 52 is its half width, and a symmetric window has to leave room for the guard borders
the code already assumes (`groundh` and `occlusionCycle` are `SIZE + 1`; `resetVisCalc` works over
`(2R+3)^2`). 50 is the largest clean radius that fits. Past it the window simply clamps to the scene
edge and you pay the quadratic visibility pass for tiles that are not there. **There is nothing above
50 to buy without enlarging the built scene, which is a protocol change.** 50 is also exactly the
"two times the default" the idea file asked this spike to measure; three times the default is not
available at all.

**Why 15 is the bottom stop.** It is the only radius that is genuinely free of the scene edge; see
below. It is worth offering to anyone on a weak machine.

**The "no pop-in" premise needs correcting, and this is the spike's main finding.** The engine
rebuilds only when the player leaves a reload box, `engine/server/src/engine/entity/BuildArea.ts:57-96`:
the box spans zone offsets -4 to +5 from the origin zone, the scene spans -6 to +6. In tiles from the
origin zone's first tile, the scene runs -48 to +55 and the player may stand anywhere in -32 to +39.
**The guaranteed margin from the player to the scene edge is therefore 16 tiles**, decaying to that
from 48 to 55 immediately after a rebuild.

So the honest statement is: **the client already draws to 25 and the guarantee is 16.** Seeing the
scene edge in flat open ground on the far side of a reload box is existing upstream 274 behaviour,
not something the slider introduces. Raising the radius makes that edge visible somewhat more often
and, most of the time, shows a great deal more real world. It is a trade the player is choosing, and
the Display section should say so in a line of help text rather than promise a guarantee the engine
does not make.

**Does the maximum need a region-rebuild change? No.** The arithmetic is against it. Tightening the
reload box to plus or minus one zone would raise the guarantee to 40 tiles, but it shrinks the box
from 72 tiles across to 24, roughly tripling rebuilds, and each rebuild is ~400,000 tile iterations
plus ~440 KB of allocation plus a full entity shift, with the scene unusable while `sceneState === 1`.
Guaranteeing 50 would need a rebuild at nearly every zone crossing. **Trading a rare visible horizon
for three times as many scene hitches is a bad trade.** That answers question 1 in the section above:
neither an overlay override nor a protocol change; leave the rebuild policy alone.

**Does the maximum need a numbered client patch? Yes, and it needs a ruling first.**
`client/PATCHES.md` and the `idlescape-client-patch` skill both state that every numbered patch lives
in `client/src/client/Client.ts` and everything else outside `src/hooks/` and `src/vendor/` is
pristine 274. **Draw distance cannot honour that**: the window and the visibility table are in
`dash3d/World.ts` and the live far clip is in `dash3d/Model.ts`. This would be the fork's first
numbered patch outside `Client.ts`, so the spec must rule on it before patch 29 is written. The
smallest shape that keeps upstream re-application tractable is one `static drawRadius` on `World`
with `visBacking`'s dimensions and every `+ 25` and `- 25` derived from it, a setter that re-runs
`resetVisCalc`, and a matching `static farClip` read by `Model`: two files, two anchors, two greps,
instead of 25 scattered edits. Numbering is at 28, so these are 29 and 30.

### 4. Variable frame rate, and whether software can hold 60

**The 50 fps ceiling is structural, not the clamp the table above named.** `GameShell.setTargetedFramerate`
does clamp to 50 (`GameShell.ts:258-260`), but raising it changes nothing, because the loop itself
cannot draw faster. There is **no `requestAnimationFrame` anywhere in `client/src`**: the loop is
`while` plus `await sleep(delta)` on `setTimeout`, `mainredraw()` runs exactly once per iteration
(`:203`), and the pacing term `ratio` is clamped to 256 (`:163-165`), which means **never more than
one draw per 20 ms update**.

How it behaves today, from `ratio = 256 x (deltime / mean ms per iteration)`:

- Iteration at 20 ms: `ratio` 256, one `mainloop()` per iteration, **50 updates and 50 draws**.
- Iteration at 40 ms: `ratio` 128, two `mainloop()` calls per iteration, **50 updates and 25 draws**.
  The game clock holds and frames are dropped. This is exactly the stutter the owner is describing.
- Floor: `ratio` cannot go below 25, about 4.9 draws per second, past which the tick itself slips.

**What the change costs.** Drive `mainredraw()` from `requestAnimationFrame` and keep a fixed-step
accumulator calling `mainloop()` every 20 ms: standard fixed-update, variable-render. Per-frame draw
work is unchanged, so **60 fps is 1.20x today's rasteriser load and 144 fps is 2.88x**. Camera-only
interpolation is unusually cheap here because the slot already exists: `Client.ts:6584-6634` saves
`camX/camY/camZ/camPitch/camYaw`, draws, then restores them, and a lerped camera drops into exactly
that window touching nothing else. Entity interpolation is a different size of job (double-buffered
positions or a shadow copy, and it perturbs picking, since `Model.mouseCheck` records the picked
typecode against whatever position was drawn), so **camera only is the right first cut**, as this file
already guessed at question 2. One non-issue: the visibility table is quantised to 32 yaw buckets, so
an interpolated camera resnaps its tile set every 11 degrees, which is invisible and free.

**Can the software renderer hold 60 at the default scene on a typical machine? Probably yes when
quiet, probably not when crowded.** The client already targets 50 and the fork runs, so a whole
iteration fits in about 20 ms today; 60 fps needs 16.7, a 20 percent squeeze on a budget that already
fits. Against it: `render2` walks every face of every visible model every frame with no caching and no
LOD, the hottest per-face loops are wrapped in `try/catch` carrying the comment
`// chrome's V8 optimizer hates us` (`Model.ts:1912-1916`, `:1988-2005`, `:2053-2078`), which is a
deliberate deoptimisation in the inner loop, and the crowd path only relaxes at 50 or 200 players.
Ship the fps target as a setting with 50 as its default and 60 available, and let the loop degrade the
way it already does rather than promising a number.

**What could not be measured without running the client**, each needing a throwaway instrumentation
patch, and none of them kept: faces per frame at a typical location (nothing counts them); the
`mainloop` versus `mainredraw` split inside the 20 ms (grep for `console.time`, `performance.mark` and
`performance.measure` over `client/src` returns zero hits, and the whole client's only timing is the
10-entry `otim` ring); how far below 20 ms an iteration currently lands; and whether R=50 fits in
16.7 ms. The existing `Fps:` overlay (`::fpson`, `Client.ts:5455-5466` and `:7254-7277`) answers none
of them, because the number it prints is `GameShell`'s derived `ratio`, not a counted frame rate: it
tells you the loop is behind, never where the time went.

### 5. The constants elsewhere that assume the current scene size

The distinction that resolves the worry in the brief: **every one of these derives from the 104 x 104
built scene, not from the 25-tile draw window.** A slider that moves only the window and the far clip
leaves all of them correct, and needs no ruling. They come into play only if the built scene is ever
enlarged, which is a protocol change to `REBUILD_NORMAL`, not a client patch, and which this spike
recommends against.

| Constant | Where | Derivation |
|---|---|---|
| `MAX_LEG_TILES = 52` | `web/src/tasks/travel.ts:18` | "104 x 104 centred on the player, so 52 in any direction" |
| `ROUTE_START_TILES` | `web/src/tasks/travel.ts:24` | follows `MAX_LEG_TILES` |
| `MAX_RADIUS = 52` | `web/src/tasks/find.ts:20` | "the scene is 104 x 104, so 52 is the furthest that is built" |
| `radius` capped at 52 | `web/src/tasks/types.ts:80` | the task API surface |
| cluster centres inside 52 | `web/src/data/gen/clusters.ts:80` | SP4b spec decision 4 |
| first-leg bound 52 | `web/src/data/gen/tutorialRoutes.ts:38` | `ROUTE_START_TILES` |
| the literal 52 in three tests | `travel.test.ts:80-84`, `tutorialRoutes.test.ts:41-43`, `find.test.ts:122` | written as a literal on purpose, so the bar cannot drift with the constant |
| `104 * 128` and the 104 bounds | `client/src/vendor/rs-sdk/bot/StateCollector.ts:904-906`, `:1079`, `:1266` | scene bounds |
| `sceneX >= 104` | `client/src/client/Client.ts:1194`, `:1234`, `:1295` | the SDK bridge's `out_of_scene` |

Those three tests assert the literal deliberately, with a comment saying an assertion against the
imported constant "could never fail". If the scene ever grows they are the tripwire, which is what
they were for.

**Two constants that a draw-distance patch does move, and that the spec must name:**
`client/src/dash3d/World.ts:116` (the `visBacking` dimensions, plus about 25 uses of the `25` literal
in the same file) and `client/src/dash3d/Model.ts:1723` (the live per-model far clip, which has to
move with the window or locs pop out over ground that still draws).

**One provenance note.** The window, the table dimensions and both clips were checked against upstream
`LostCityRS/Client-TS` branch `274` on 2026-09-07 and are byte-identical there. Our fork has not
touched any of them, so a patch here is a genuine divergence to carry across every future bump, which
is a further argument for the single-constant shape described in part 3.

### 6. Two notes for the spec that was written in parallel

`docs/superpowers/specs/2026-09-07-camera-frame-and-renderer-design.md` landed while this spike ran,
and the two agree: it ships `cs.draw.radius` at 15 to 25 with 25 as the default and states that any
maximum above 25 is the spike's to supply. **The number is 50**, for the reasons in part 3, and its
section 9.3 rule of applying a raised maximum at the next scene rebuild rather than immediately is
better than anything this spike would have proposed, and is exactly right given the 0.4 to 1.0 s
`resetVisCalc` cost measured out in part 2. Its ruling that the patch may touch `dash3d/World.ts`
settles the patch-shape question this spike would otherwise have raised.

Two things to feed back:

- **`Model.ts:1723` is missing from the spec.** Sections 9.2 and the corrections list both say,
  correctly, that raising `World.testPoint`'s `pz > 3500` alone changes nothing. The converse is not
  stated anywhere and is the one that will bite: `Model.worldRender` rejects any model with
  `midZ >= 3500` on every frame, so **widening the tile window without widening that clip draws
  ground out to 50 tiles with every loc on it vanishing at about 27**. The far clip has to move as a
  pair with the window, and the patch that widens the window needs a second anchor and a second grep
  in `dash3d/Model.ts`.
- **Ruling R2 and the draw-distance maximum multiply.** R2 widens `visBacking` to 12 pitch buckets
  for the pitch range; part 2 here sizes the table at `buckets x 32 x (2r+1)^2`. Taken together at
  12 buckets and r = 50 that is about 3.9 million booleans, roughly 15.7 MB, and a boot precompute
  around five times today's rather than the four times section 9.2 estimates from radius alone. Both
  settings would have to be at maximum for that, and both apply at a scene rebuild, so it is a sizing
  note rather than an objection: the R2 fallback of 11 buckets already named in that ruling is the
  lever if the boot cost shows up.
