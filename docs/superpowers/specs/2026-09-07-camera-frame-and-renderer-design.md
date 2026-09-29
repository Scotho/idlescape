# Idlescape: camera, frame and renderer

Date: 2026-09-07
Status: approved by the orchestrator under D11 and D41, 2026-09-07; committed on
`sprint/dragon-slayer` the same day. The owner may reverse any ruling in section 14.
Authority: **this spec, over the idea file** `docs/ideas/2026-09-07-camera-frame-and-renderer.md`.
The idea file holds the owner's words and stays the record of intent; where its first consideration
and this document disagree on a number, a seam or a mechanism, this one wins and section 15 lists
what it supersedes. D41 fixes the scope and the WASD behaviour and this spec does not reopen either.
D42 folds two sprint 3 items into this entry's key-routing patch and section 6.6 carries them.
Placement: **sprint row 9, after SP8c.** Its client patches ride SP8c's batch, behind entry 3's
client-fork gate; its Display section composes shell v2's library, so entry 4 lands first.
Classification: **architectural.** It splits the client's single loop into a game clock and a draw
clock, adds a mode to the keyboard path, adds one hooks method and two hooks events, adds a control
to the shell component library, and leaves a seam a later renderer replaces.

Reading state: code read at `1fe96f16534267ac21461547631d95fb37b89e5c` on `sprint/dragon-slayer`
(`fix(tasks): drop the dead tutorial step and the Fork button that cannot fork`). SP4b was being
implemented and committed on the branch while this was written and the sprint document was being
renumbered; neither touches a file this document depends on. Line numbers here are hints and a grep
is the authority.

RuneLite behaviour cited below comes from `runelite/runelite` `master` at
`https://raw.githubusercontent.com/runelite/runelite/master/`, files
`runelite-client/src/main/java/net/runelite/client/plugins/keyremapping/KeyRemappingPlugin.java`,
`.../KeyRemappingListener.java`, `.../KeyRemappingConfig.java`,
`.../plugins/camera/CameraPlugin.java`, `.../CameraConfig.java`,
`.../plugins/gpu/GpuPluginConfig.java` and `.../GpuPlugin.java`, plus the wiki pages
`https://github.com/runelite/runelite/wiki/Key-Remapping`,
`https://github.com/runelite/runelite/wiki/Camera` and
`https://github.com/runelite/runelite/wiki/FPS-Control`, fetched 2026-09-07. GitHub's
unauthenticated raw fetch of `master` carries no pinnable commit SHA, so the file paths are named as
the authority. Fetched content is treated as data.

Depends on: entry 3 (a numbered patch is checkable), entry 4 (the shell v2 component library and the
`config` panel's v2 shape) and entry 8 (the patch batch this rides in). **D40's draw-distance spike
has since reported** and its numbers are folded into section 9; this document no longer waits on it
for anything. Nothing here touches `engine/`, `engine/content` or any content pack.

Revision, 2026-09-07: this document was reviewed against the code at the commit above and the review
found real errors in it. Sections 2, 5.1, 5.3, 6.1, 6.2, 6.6, 6.8, 6.9, 7.1, 7.2, 7.3, 8, 9, 10, 11,
12 and 16 carry corrections, and rulings R1, R2, R3, R5, R10 and R11 were rewritten rather than
merely annotated. Where this document previously argued something the code contradicts, the
correction says so in the open rather than quietly replacing the number, because the plan is written
from here and the same mistake is easy to make twice.

---

## 1. The correction this entry opens with

This repository never shipped a GPU renderer that was later disabled. The WebGL and WebGPU work is
upstream Lost City's `225-gpu` branch by dennisdev and it was never merged to revision 274; the fork
was rebased to 274 on 2026-09-05 without it, and `2026-09-05-sp2b-gpu-spike-findings.md` measured
the port as a large divergence with terrain as the hard part. The renderer question is **port or
rewrite, not re-enable**. Everything in this entry runs on the software rasteriser that exists.

That matters here because it bounds what "unlocked fps" and "draw distance" can honestly mean. Every
frame this entry draws is rasterised in JavaScript. Raising the frame target raises CPU cost
linearly; raising the draw radius raises it roughly with the square of the radius. Section 12 states
the budget in those terms rather than promising a number the rasteriser cannot hold.

## 2. What exists today

Confirmed at `1fe96f16`. Four facts shape every design choice below.

**One loop, one draw per cycle.** `client/src/client/GameShell.ts` is a `setTimeout`-driven
`while (this.state >= 0)` loop. `deltime = 20` (`GameShell.ts:11`), `mainloop()` runs inside a
catch-up loop (`GameShell.ts:185-197`) and `mainredraw()` is called exactly once per outer iteration
(`GameShell.ts:203`). `setFramerate()` has one caller in the whole tree, `Client.drawError()`
(`Client.ts:2885`), so `deltime` is 20 for the life of a healthy session and update and draw are
hard-coupled. `setTargetedFramerate()` clamps to 50 (`GameShell.ts:258-260`) and the `tfps` sleep
only fires when `tfps < 50` (`GameShell.ts:206-211`), so `::fps` can only ever slow the client down.
50 draws per second is the structural ceiling.

**The 600 ms server tick is not in the loop.** It arrives on `ServerProt.PLAYER_INFO`, where patches
20 and 21b fire `onGameTickCallback()` and increment `hookGameTick`. Entity motion is already
interpolated between server ticks by the existing movement code. The camera is a client-cycle
quantity and is the thing this entry interpolates.

**The camera distance formula lives at two sites.** `pitch * 3 + 600` is computed at the runtime
call (`Client.ts:6572`, inside `camFollow`) and baked again into the startup visibility precompute
(`Client.ts:3489-3497`, `offset = angle * 3 + 600`, fed to `World.resetVisCalc`). A zoom factor
applied at only one of them desynchronises the runtime camera from the `visBacking` table and
mis-culls tiles. This is the single most load-bearing fact in the entry.

**The far clip is not the binding draw-distance constraint.** `World.testPoint` rejects `pz > 3500`
(`World.ts:938`), but `renderAll` never looks outside a hard-coded plus-or-minus-25 tile window
(`World.ts:982-1000`), and 25 tiles times 128 units is 3200. The two are matched by design and
raising 3500 alone changes nothing. `visBacking` is `TypedArray4d(8, 32, 51, 51)` (`World.ts:116`),
so 51 is 2 times 25 plus 1 and the table's own dimensions encode the same radius.

Two smaller facts the design leans on. There is **no wheel handler anywhere in `client/src`**;
`Client.scrollCycle` is a left-button-held scrollbar repeat, not a wheel. And **the client has no
Escape behaviour at all, and Escape never reaches the key queue.** `KeyCodes.ts:21` maps Escape to
`ch 27` with `keyCode.code` 27, and `GameShell.ts:444-446` runs `if (ch < 30) { ch = 0; }` **before**
the remap chain at `:448-464`, whose cases are 37, 39, 38, 40, 17, 8, 127, 9 and 10. Code 27 matches
none of them, so `ch` is 0 by the time the `if (ch > 4)` queue test at `:470` runs.
`handleInputKey()` does not ignore Escape; it never sees it. "Escape clears the line" is therefore
new client behaviour that has to be handled **above** the clamp (section 6.5), and not a re-route of
an existing queued value.

The same clamp is why the **function keys are already queued.** `KeyCodes.ts:30-36` maps F1 to F7 to
`ch` 1008 to 1014, far above 30, so the clamp does not touch them. They fail `ch > 0 && ch < 128` so
no `keyHeld` slot is set, but they pass `ch > 4` and are written into `keyQueue` today, reaching
`pollKey()` and every `handleInputKey()` branch. Section 6.6 is written against that being true
rather than against the opposite.

## 3. The shape, in one paragraph

Seven settings live in one new **Display** section of the `config` panel, persisted per browser under
`cs.` keys, pushed into every open client session through **one** new hooks method `setDisplay()`.
Inside the client they land in three places: a **draw clock** split out of `GameShell`'s loop so
`mainredraw()` runs on `requestAnimationFrame` while `mainloop()` keeps its 20 ms accounting; a
**camera block** where zoom multiplies the distance formula at both its sites and the pitch clamp
reads a field; and an **input mode** that routes keys to the camera or to the chat input and reports
its transitions back to the shell as a new hooks event, which is what the shell-drawn "Press Enter to
chat" hint listens to. Scene drawing stays behind one call so a WebGL backend can replace it, and the
draw clock is written so a backend can drive it at any rate.

## 4. The Display section

### 4.1 Settings, defaults and keys

Every key is a bare `cs.` key written straight to `localStorage`, the idiom `cs.size` and `cs.filter`
already use in this panel (`web/src/main.ts:50-51`, `144-145`). They are never renamed. They are
outside the `cs.plugin.` prefix that `web/src/plugins/settings.ts:94` enumerates, so the Firestore
mirror never sees them and they stay per browser, which is what D41's wording asks for.

| Setting | Key | Type | Default | Range |
|---|---|---|---|---|
| Camera zoom | `cs.cam.zoom` | number, 2 dp | `1.00` | `0.50` to `2.00`, step `0.05` |
| Mouse wheel zoom | `cs.cam.wheel` | `'0'` / `'1'` | `'1'` | - |
| Pitch limit | `cs.cam.pitchMax` | integer | `383` | `383` to `512`, step `1` |
| WASD camera | `cs.cam.wasd` | `'0'` / `'1'` | `'0'` (off, per D41) | - |
| Draw distance | `cs.draw.radius` | integer, tiles | `25` | five stops, `15` / `25` / `32` / `40` / `50` (section 9) |
| Frame rate target | `cs.fps.target` | `'50'` / `'60'` / `'unlocked'` | `'50'` | - |
| Smooth camera | `cs.fps.interpolate` | `'0'` / `'1'` | `'1'` | - |

Every default reproduces today's behaviour, with two deliberate exceptions. `cs.cam.wheel` defaults
on. That is not quite "cannot regress anything", which is what the first draft claimed: section 5.2
calls `preventDefault()` whenever the handler acts, so inside the 4,4 to 516,338 viewport rectangle
the wheel stops scrolling the host page and starts zooming, for every player who never opens the
Display section. That is the behaviour the owner asked for and it is taken over deliberately, but it
is a change to an existing input and it is named as one. Outside that rectangle nothing changes. And
`cs.fps.interpolate` defaults on even though the target defaults to 50, because at 50 the draw clock
is `requestAnimationFrame` rather than the old cycle-locked draw and frames no longer land exactly on
cycle boundaries; interpolation is what makes that invisible rather than a new source of jitter.
Everything else about a session that has never opened the Display section is the client it is now.

`cs.fps.interpolate` is separated from `cs.fps.target` on purpose: interpolation is the thing most
likely to be found to feel wrong, and it must be switchable off without giving up 60 fps.

**`cs.fps.target` defaulting to `'50'` is the one default that contradicts a sentence the owner
wrote** ("Ideally unlocked fps, but a smooth 60 is a great improvement"), so it is a numbered ruling,
R17, rather than a line covered by the blanket "every default reproduces today's behaviour". The
reason it starts at 50 is that no player who never opens the Display section should have their frame
timing changed by an entry they did not ask for; if 60 clears section 12.2's gate on the reference
machine, flipping the default is one constant in `display.ts`.

### 4.2 The controls, and where they live in the library

All names are shell v2's, which exists after entry 4. Builders are in `web/src/ui/parts.ts`; class
ownership is policed per file by `web/src/styles/families.ts` and `styles.test.ts`.

| Setting | Control | Family |
|---|---|---|
| Camera zoom | `range()` inside a `.setting-row` | `.range*` on `form.css` (new, section 4.3); the row on `layout/panels.css` |
| Pitch limit | `range()` inside a `.setting-row` | as above |
| Draw distance | `range()` inside a `.setting-row` | as above |
| Mouse wheel zoom | `.setting-row` with a `switch` | `layout/panels.css` plus `form.css`'s `.switch` |
| WASD camera | `.setting-row` with a `switch` | as above |
| Frame rate target | `segmented` over 50, 60 and Unlocked, in a `.setting-row` | `tab.css` via `parts.ts` (`.seg`, `.seg-btn`) |
| Smooth camera | `.setting-row` with a `switch` | `layout/panels.css` plus `form.css`'s `.switch` |
| The hint pill | `pill(text, tone, { corner: true })` | `overlay.css` via `parts.ts` |
| The Enter glyph in the hint | bare `kbd` element rule | `base.css` |

**The row is `.setting-row`, not `.field-inline`.** Shell v2's Task 20 assigns `.setting-row` to
`layout/panels.css` and builds the Configuration panel's existing rows from it, so a Display section
built out of `form.css`'s `.field-inline` would stack two different row idioms in one scroll. Both
are library-legal and no test catches the mismatch, which is exactly why it is ruled here rather than
left to the implementer. `range()` therefore returns a `.setting-row` carrying a `.range` input and a
`.range-value` readout.

The design bundle's rule (`docs/design/idlescape-shell-v2/README.md:68`) is that `.ov-pill` is the
only language over the canvas, so the hint is a pill and no class is invented for it. The composition
rule from `.claude/skills/idlescape-plugin/SKILL.md` binds: compose the library, do not extend it
locally, and anything genuinely new goes into the library **and** into `web/styleguide.html` in the
same change. `range()` is the one genuinely new thing and section 4.3 pays for it in full.

**Never a twelfth strip icon.** This is now mechanically enforced and not merely argued: shell v2's
Task 9 narrows `IconName` to exactly eleven names and Task 10 pins the strip order as an
eleven-element array asserted against `main.ts`. A twelfth id fails those tests.

### 4.3 The slider, and its five edits

No slider exists anywhere in the project. `SettingField` (`web/src/plugins/types.ts:4-9`) is a closed
union of boolean, number, select, color and text; `settingsForm.ts`'s `control()` has no range
branch; shell v2's `form.css` defines only `.input*`, `.select*`, `.textarea*`, `.switch` and
`.field*`; and the vendored design bundle ships no slider component, only a `sliders` glyph in the
icon set, which is an icon and not a control.

Ruling R9 builds the real thing. The five edits, all in entry 9's own commit:

1. `web/src/ui/parts.ts` gains a `range(...)` builder returning a `.setting-row` wrapping an
   `input` of type range with class `.range`, plus a `.range-value` readout, with cases in
   `parts.test.ts`.
2. `web/src/styles/form.css` gains `.range`, `.range-value` and the two vendor thumb pseudo-elements
   `::-webkit-slider-thumb` and `::-moz-range-thumb`, which a themed slider cannot do without.
3. `web/src/styles/families.ts` gains `range` on `form.css`'s prefix list, or `styles.test.ts`'s
   "form.css defines only its own family" rule fails on every one of those rules.
4. `web/styleguide.html`'s `#forms` gains a live demo of every `.range*` class, or
   `styleguide.families.test.ts`'s "demonstrates every class each family defines" rule fails. That
   rule reads class attributes only, with the `.sg-code` strips removed, so naming the class in the
   code strip does not satisfy it.
5. The `forms` Playwright screenshot is rebaselined.

A bare element selector on the range input is not a shortcut: `styles.test.ts` polices class prefixes
and an unclassed rule in `form.css` is an unowned selector.

Three settings consume it, not one, which is what makes the library work worth doing rather than a
one-off. `SettingField` is **not** extended with a range member and `settingsForm.ts` gains no
branch, because the config panel receives no `PluginContext` and renders none of its controls through
that form. A later plugin that wants a slider adds the sixth edit then.

### 4.4 Section shape

The Display section is one `details` element with class `section` and a `.section-body`, placed below
Game view. `.section` and `.section-body` survive shell v2 as a `card.css` family, so this is
library-legal.

**Game view is left exactly as shell v2's Task 20 Step 2 ships it**, whatever that turns out to be,
and this entry does not re-shape a panel another entry just wrote. The first draft asserted that
Task 20 leaves Game view as flat rows "with no `details` wrapper" and priced R10 on that. The review
checked it and the assertion is an inference, not a fact: `config.ts:31` at HEAD already opens with
`<details class="section" open><summary>Game view</summary>`, and Task 20 Step 2's own text
(`plans/2026-09-07-shell-v2.md:4925`) describes the three rows and the fullscreen button and says
nothing about removing that wrapper either way.

So the shape rule is stated conditionally rather than asserted. **Display is a `details.section` with
a `.section-body`, appended after Game view.** If Task 20 keeps Game view's `details`, the panel is
two matched collapsibles and there is nothing to reconcile. If Task 20 flattens it, the panel is a
flat block above a collapsible one, which is R10's cost if wrong and is four lines to fix in either
direction. The implementer reads `config.ts` as it stands after entry 4 and does not need this
document to have guessed. Display holds seven controls and Game view holds four, so Display is the
half a player wants folded away whichever way that lands.

### 4.5 Files

`web/src/panels/config.ts` is 51 lines today and the ceiling is 400, but the Display section plus its
seven wire-ups is roughly 110 lines of its own, and it is a separable unit with one purpose. It goes
in a new `web/src/panels/configDisplay.ts` exporting `createDisplaySection(deps)`, which `config.ts`
appends. `config.ts` grows by three lines.

The settings themselves, their defaults, their clamps and their fan-out go in a new
`web/src/frame/display.ts`, not in `main.ts`. `main.ts` is 358 lines against a 400 ceiling and shell
v2's Task 10 already rewrites its registration block; it gains three lines here and no more.

## 5. Zoom, pitch and the wheel

### 5.1 Zoom

`cs.cam.zoom` is a multiplier on the camera distance. At the runtime site `Client.ts:6572` the sixth
argument to `camFollow` becomes `((pitch * 3 + 600) * this.camZoom) >> 8`, where `camZoom` is a
fixed-point field (the setting times 256, so `1.00` is 256) so the multiply is integer and no float
enters the camera path. `camFollow`'s existing rotation arithmetic is untouched.

**The visibility table is baked once at startup and zoom never re-runs it** (ruling R1). The naive
form of that, baking the offset at the widest zoom, is **wrong**, and the correction is written out
in full because the plan is written from here and the error is easy to make twice.

`World.testPoint` rejects on **two** clips in one predicate, `if (pz < 50 || pz > 3500)`
(`World.ts:938`), and `resetVisCalc` feeds it `pitchDistance[pitchLevel] + y` (`World.ts:876-882`),
where `pitchDistance` is exactly the quantity a zoom factor multiplies. `pz` rises monotonically with
the baked offset, so the **far** clip rejects more tiles at a wider bake, not fewer. The first draft
argued only about the near clip and concluded the opposite.

Worked at the top pitch bucket, which is where it bites. `angle` 399 gives `offset` 1797 and
`pitchDistance[8]` about 1692, and `sinTable[384]` is about 0.924. At zoom 1.00 the `y` term alone
contributes about 1100 to 2300 to `pz`, and the whole plus-or-minus-26 tile window clears 3500. At
`ZOOM_MAX_FP` the `y` term alone is about 2660 to 3870, leaving roughly 840 of budget for the
`tmp * cosX` term, which cuts the accepted horizontal reach to about 17 tiles. Tiles between about 17
and 25 tiles out at high pitch would be baked as **not** visible and then skipped by `renderAll`'s
`World.visBackingDirty[x + 25 - World.gx][z + 25 - World.gz]` test (`World.ts:1014`) at the
**default** zoom of 1.00. That is under-inclusion, which is a hole at the horizon, and it is exactly
the failure the first draft asserted was impossible.

**What the patch does instead.** The bake keeps today's offset, `angle * 3 + 600`, unchanged, and
`World.testPoint` takes its far clip as a parameter that `resetVisCalc` sets to
`(3500 * ZOOM_MAX_FP) >> 8`, that is 7000 at `ZOOM_MAX_FP = 512`. Two monotonicity facts, not an
assertion, are what make the baked set a superset over the whole slider range:

- Raising zoom raises `pz`, so a tile that clears the 50-unit near clip at a narrower zoom clears it
  at every wider one. The near clip can only reject at the **narrow** end of the range, and the bake
  sits at 1.00, above the 0.50 floor, with that clip unchanged.
- Lowering zoom lowers `pz`, so the far clip can only reject at the **wide** end. Raising the baked
  far clip to cover `ZOOM_MAX_FP` puts the whole range inside it, because the largest `pz` any
  reachable zoom produces is bounded by 3500 times the widest zoom, which is what 7000 is.

The one part of `testPoint` that is **not** monotone in `pz` is the viewport rectangle test on
`viewportY`, because `py` and `pz` both grow with `y` and their ratio does not move in one direction.
That is verified numerically rather than by argument: section 13 carries a client test that runs
`resetVisCalc` at 0.50, 1.00 and 2.00 and asserts the shipped table is a superset of all three. If it
is not, R1's fallback applies and the shape changes; nothing else in this entry depends on it.

Over-inclusion costs a few extra tiles submitted to `renderAll`'s own per-tile occlusion test and
nothing else, so the failure mode of this shape is a little wasted work, never a hole. Zoom then
changes nothing that has to be recomputed and the slider drags at frame rate with no hitch.

Range and default: `0.50` to `2.00`, default `1.00`. RuneLite's Camera plugin expresses zoom the same
way, as a widen-from-baseline delta over the game's own zoom limits rather than an absolute distance
(`CameraConfig.java`, `innerLimit` and `outerLimit`), and this is that idea with one number instead
of two. Past roughly `1.60` the far clip becomes visible as a horizon at the default draw radius,
which is why zoom and draw distance sit next to each other in the panel and why the section's help
line says so.

`cinemaCam` (`Client.ts:5683` onward, guarded at `Client.ts:6560`) drives the camera from the
server's `CAM_*` packets. Zoom, pitch and WASD all no-op while it is set, exactly as the existing
`!this.cinemaCam` guard already arranges. No new guard is written; the settings are read inside the
orbit branch that guard already protects.

### 5.2 The mouse wheel

A `wheel` listener is new code in `GameShell.run()` beside the other canvas handler assignments
(`GameShell.ts:94-95`), registered with `passive: false`. It:

- returns immediately unless `cs.cam.wheel` is on and the pointer is inside the viewport rectangle.
  `insideGame()` (`Client.ts:14406-14412`) takes **no arguments**: it reads `this.mouseX` and
  `this.mouseY`, and it additionally requires `this.ingame`. So the handler either updates those two
  fields from the event before calling it or does the 4,4 to 516,338 hit test itself. The `ingame`
  term means wheel zoom is inert on the title screen, which is wanted, and is stated here rather than
  inherited by accident. The wheel over the side panel and over the chat scrollbar keeps its browser
  behaviour;
- calls `preventDefault()` only when it acted, so a wheel that is not a zoom still scrolls the page;
- steps `camZoom` by `Math.sign(e.deltaY) * 0.05` clamped to the setting's range, and **writes the
  new value back through the same path the slider uses**, so the panel's slider and the wheel are one
  value and the setting persists whichever moved it.

The write-back crosses the iframe boundary, so it is the one place the client pushes a setting rather
than receiving one. It is a **`HookEvents` entry named `zoomChanged`**, not a bridge method: the
hooks surface carries client-to-shell notification only as an event consumed through `on()`
(`hooks/types.ts:39-50`, `:90`), and there is no other shape available. The shell's `display.ts`
subscribes, persists the value and re-renders the panel's slider if it is open. Section 8.1 states
the count and section 12.1 states why it is not on the script surface.

### 5.3 Pitch

The clamp at `Client.ts:5640-5644` keeps its lower bound of 128 and takes `this.camPitchMax` as its
upper bound, where `camPitchMax` is the `cs.cam.pitchMax` setting.

Raising the maximum past 383 is not two constants, and it is not three (ruling R2). `resetVisCalc`
builds visibility in **two** tables, and the first draft's arithmetic was short at every site.

Stage one fills a local raw table, `new TypedArray4d(9, 32, 53, 53, false)` (`World.ts:866`), over
`for (let pitch = 128; pitch <= 384; pitch += 32)` (`World.ts:867`), which is nine values into
buckets 0 to 8. Stage two dilates that into the static `World.visBacking`,
`TypedArray4d(8, 32, 51, 51)` (`World.ts:116`), under
`for (pitchLevel = 0; pitchLevel < 8; ...)` (`World.ts:894`), reading
`visBacking[pitchLevel + 1]` (`World.ts:913`, `:918`), which is why the local table needs exactly one
bucket more than the static one. `renderAll` then indexes
`visBacking[((eyePitch - 128) / 32) | 0]` (`World.ts:974`).

At `eyePitch` 512 that index is `(512 - 128) / 32 = 12`. An array of 12 has indices 0 to 11, so
**12 is not enough**: `visBacking[12]` is `undefined` and the `[yawLevel]` index on it throws a
TypeError on every draw at maximum pitch. The correct coordinated set for a 512 ceiling is five
edits:

| Site | Today | For a 512 ceiling |
|---|---|---|
| `World.ts:116`, the static table's first axis | 8 | **13** (indices 0 to 12) |
| `World.ts:866`, the local raw table's first axis | 9 | **14** (the dilation reads `pitchLevel + 1`) |
| `World.ts:867`, the bake loop bound | `pitch <= 384` | **`pitch <= 544`**, fourteen values |
| `World.ts:894`, the dilation loop bound | `pitchLevel < 8` | **`pitchLevel < 13`** |
| `Client.ts:3489-3494`, the `distance` array and its loop | `Int32Array(9)`, `x < 9` | **`Int32Array(14)`, `x < 14`** |

Miss the dilation bound and buckets 8 to 12 of the widened static table are never written and stay
all false, so every tile is culled above pitch 383 and the world goes black at the top of the new
range. That is the failure R2's cost-if-wrong line says cannot happen, so the bound is named here and
it has its own grep in section 11.

The cost is 13 pitch buckets against 8, that is **62.5 per cent** more table memory in a structure
that is 13 by 32 by `(2r + 1)` squared booleans, and 62.5 per cent more startup precompute in a pass
that already runs once per session. Both are paid unconditionally at boot for whatever radius is
current, because the table is baked once; the pitch setting only decides how much of it is reachable.
Section 9.2 prices the interaction with the draw-distance maximum, which multiplies against this.

Two smaller notes the review pinned down. The local raw table's 53 axis and the dilation's
`x < 25` bound mean index 50 of the static table is never written; `renderAll` only ever reads
indices 0 to 49 (`x` runs from `gx - 25` to `gx + 24`), so that slot is dead in both directions and
the widening does not change it. And section 2's "the table's own dimensions encode the same radius"
is true of the **static** table; the local one is `(2r + 3)` on a side.

**The wire value is clamped independently.** `Client.ts:4526-4536` sends
`ClientProt.EVENT_CAMERA_POSITION` with `orbitCameraPitch` every 20 cycles and the engine reads it as
an anti-macro signal; `MOVE_MINIMAPCLICK` carries `orbitCameraYaw` the same way. The patch clamps the
**sent** pitch to 128..383 while the local camera uses the widened range, so nothing new appears on
the wire and no engine-side validation can be surprised. `engine/` is not edited and does not need to
be.

`cameraPitchClamp` (`Client.ts:5646-5680`), the ground-height floor applied at draw time, is
untouched. It is a floor and the setting moves a ceiling; they cannot meet.

**There is a third pitch ceiling and it is not that one.** Inside `gameDrawMain`'s camera-shake loop,
axis 4 does `this.camPitch += jitter` and then clamps, `if (this.camPitch > 383) this.camPitch = 383`
(`Client.ts:6606-6612`). It only runs while `camShake[4]` is active, but while it does, the pitch
actually handed to `renderAll` is slammed back to 383, so a player sitting at a widened pitch sees
the camera snap down for the duration of the shake. Given this entry's own headline lesson, that the
zoom formula lives at two sites, the same treatment applies: **that clamp reads `camPitchMax` too**,
and it is in patch N+2 with its own grep. The two `cinemaCam` pitch sites (`Client.ts:5744-5745` and
`:8729-8730`) stay at 383 and are correctly out of scope under the existing `!this.cinemaCam` guard.

## 6. WASD camera mode

Exactly as D41 and the idea file's round two state it. RuneLite's Key Remapping plugin is the idiom
and section 6.7 says where this deliberately differs from it.

### 6.1 The state machine

Two modes, one boolean. `typing` is false in camera mode and true in typing mode. The client boots
into camera mode whenever `cs.cam.wasd` is on, which is what RuneLite's `startUp` does
(`KeyRemappingPlugin.java`).

```
                  cs.cam.wasd off
    +---------------------------------------------+
    |                                             |
    v                                             |
[ disabled ]  --- setting on --->  [ CAMERA ] <---+
   (today's                          |   ^
    behaviour,                Enter  |   |  Enter (sends) or Escape (clears)
    unchanged)                       v   |
                                  [ TYPING ]
                                     ^  |
      prompt opens (auto-enter)  ----+  +----  prompt closes (auto-exit)
```

**Auto-entry** is computed from three fields that already exist, with no new state:

```
promptOpen = socialInputOpen                                   // name entry, private message
          || dialogInputOpen                                   // the withdraw-X amount prompt
          || (mainModalId !== -1 && mainModalId === reportAbuseComId)
```

`dialogInputOpen` is set by `ServerProt.P_COUNTDIALOG` (`Client.ts:9168-9179`) and cleared at
`Client.ts:5424`, `1761`, `4210`, `8331`, `8358` and `8400`. `socialInputOpen` is set in
`clientButton()` (`Client.ts:13373`, `13380`, `13393`, `13400`) and on the friend-message path
(`11667`), cleared at `5352` and `4212`. `promptOpen` is evaluated once per cycle at the top of
`handleInputKey()`; a rising edge forces `typing` true and a falling edge restores `typing` false.

**Slash and Colon enter typing mode as well, which is what makes the owner's `::` command line
work** (ruling R15). `KeyRemappingListener.java` makes Enter, Slash and Colon the three keys that
enter typing mode, and the owner's round-two words name the `::` command line as one of the three
things that should put the player there. The first draft of this spec refused Colon and asked the
player to press Enter first. That was the one place the design came out strictly worse than the
RuneLite idiom D41 invokes, for a saving of one entry in the entry-key set, so it is reversed.

The difference from Enter is what happens to the keystroke. Enter is **consumed**: it switches the
mode and does not also reach the chat branch (section 6.4). Slash and Colon are **not** consumed:
they switch the mode and are then queued normally, so the character lands in `chatInput` and a player
who types `::fps 60` gets all of it. Every other printable key stays swallowed in camera mode, and
the auto-entry edges below are unchanged.

**A chat modal is not a trigger** (ruling R6). `chatModalId !== -1` discards every key today
(`Client.ts:5427` has no else branch), so camera mode is harmless there, and being able to rotate the
camera while reading an NPC's dialogue is a feature rather than a bug.

### 6.2 The key list camera mode swallows

Stated as ranges over the client's `ch` value, not as a mood.

**Swallowed in camera mode** (not queued, so `handleInputKey()` never sees them): `ch` in the
inclusive range 32 to 126, the printable ASCII range, plus 8 (backspace) and 9 (tab). Nothing lands
in the chat input by accident, which is the whole point of the setting.

**Never swallowed, in either mode:**

| `ch` | Key | Why |
|---|---|---|
| 1, 2, 3, 4 | Left, right, up, down arrows | They are the camera |
| 5 | Ctrl | `keyHeld[5]` is run (`Client.ts:8225`, `2131-2146`) |
| 10, 13 | Enter | Enters typing mode, or sends |
| 27 | Escape | It never reaches the queue at all (section 2). Handled above the clamp, section 6.5 |
| 47, 58 | Slash, Colon | They enter typing mode and are then queued (section 6.1, R15) |
| 1008 to 1014 | F1 to F7 | Sidebar tabs, in both modes (section 6.6). **Queued today already** |
| 1000 to 1003, 1015 to 1019, 65535 | Home, End, PageUp, PageDown, F8 to F12, CapsLock, Meta | Above the printable range, so the 32-to-126 test never matches them. Listed so the predicate is written as a range test and not as "everything not on this list" |
| 0 | Shift (`ch` 6), Alt (`ch` 7), everything else under 30 | `GameShell.ts:444-446` zeroes these and they never queue. **The F-keys are not in this row**: they are `ch` 1008 to 1014 and they do queue |

**W, A, S and D are intercepted before the swallow** and written to `keyHeld[3]`, `keyHeld[1]`,
`keyHeld[4]` and `keyHeld[2]` on keydown, cleared on keyup. This follows the precedent touch panning
already set: `Client.ts:14350-14377` writes `keyHeld[1..4]` from pointer deltas and releases them at
`14247-14256` and `14328-14333`, and `followCamera()` is not touched. Two things come free from
following it: `EVENT_CAMERA_POSITION` already fires on any of `keyHeld[1..4]`
(`Client.ts:4526-4528`), and `onblur` already zeroes all 128 slots (`GameShell.ts:550-557`), so a tab
switch with W held does not leave the camera spinning.

Case does not matter: the interception is on `e.code` (`KeyW`, `KeyA`, `KeyS`, `KeyD`), so shift-W
and caps lock behave the same. Ctrl-W, Ctrl-A and every other modified chord is passed through
untouched, so the browser's own shortcuts are not stolen.

### 6.3 Typing mode

Typing mode is today's client, unchanged. `handleInputKey()`'s four-mode router
(`Client.ts:5315-5583`) runs exactly as it does now: report abuse, `socialInputOpen`,
`dialogInputOpen`, then the `chatModalId === -1` chat input and `::` command line. The patch adds no
branch inside those four; it only decides whether a key reaches `pollKey()` at all.

### 6.4 Enter

- **Camera mode:** Enter is not queued to the chat input. It sets `typing` true and emits the
  transition. It is consumed and does not also reach the chat branch, which is where this differs
  from RuneLite (`KeyRemappingListener.java` deliberately does not consume the triggering keystroke,
  because RuneLite's chatbox is a RuneScript widget with its own listener and ours is not).
- **Typing mode:** Enter is queued and reaches `Client.ts:5439` unchanged, which sends the line when
  `chatInput.length > 0`. On send, `typing` returns to false and the transition is emitted. On an
  **empty** line Enter is already a no-op in the client, and it returns to camera mode too, which
  gives a player who pressed Enter by mistake a one-key way out.

### 6.5 Escape, and the panic-key contract

**Which layer sees Escape first, in order:**

1. The **canvas's own `onkeydown` inside the iframe** (`GameShell.ts:426-478`). It is the event
   target's handler, so it runs first.
2. The **iframe's inner document**, where `web/src/frame/stage.ts:196-207` `forwardEscape` listens
   and re-dispatches a synthetic bubbling Escape on the **parent** document.
3. The **parent document**, where `web/src/frame/runBanner.ts:260-265` pauses the run if and only if
   the last state was `running`.

**All three still happen on one press, and that is the design, not a tolerated collision.** A player
who hits Escape during a moving run wants the run paused whatever the chat line held. The client's
action is local (clear the line, close the interface, return to camera mode) and the shell's action
is unconditional-when-running and knows nothing about typing mode. Neither can starve the other
because neither is a condition on the other.

**Two things the client patch must not do**, and the patch's grep proves both:

- It must **not** call `stopPropagation()` on Escape. `forwardEscape` listens on the inner
  **document**, so a `stopPropagation` on the canvas cuts the panic key while a script is running,
  invisibly to every unit test in the project.
- It must **not** remove the existing `e.preventDefault()` (`GameShell.ts:475-477`). Escape is not in
  `CanvasEnabledKeys` (`F11` and `F12` only, `KeyCodes.ts:6`) and preventing its default is what
  stops the browser acting on it under the canvas.

**No change is made to `runBanner.ts` and none to `localTransport`'s Escape exclusion**
(`localTransport.ts:22`, `66-76`), and that is deliberate: any condition added to `runBanner.onKey`
is a new way for the panic key to be conditionally dead.

**What Escape does inside the client**, which is entirely new behaviour (section 2):

| State | Escape does |
|---|---|
| Typing mode, chat line non-empty | Clears `chatInput`, returns to camera mode |
| Typing mode, chat line empty | Returns to camera mode |
| Typing mode entered by a prompt | Cancels the prompt the way its own close path does, which restores camera mode through the falling edge of `promptOpen` |
| Camera mode, an interface open | Closes the open interface (D42, section 6.6) |
| Camera mode, nothing open | Nothing locally; the shell still sees it |
| WASD setting off | Closes the open interface only (D42); everything else is unchanged |

Escape is handled where `ch` is still 27, before the under-30 clamp at `GameShell.ts:444-446`, and
routed as a dedicated signal rather than through `pollKey()`, because `pollKey`'s consumers are the
four typing branches and none of them should have to learn about it. RuneLite makes the same call in
the opposite direction: its `KeyRemappingListener` **does** consume Escape in typing mode, explicitly
so camera-mode hotkeys do not also fire. We consume it for the client's own routing and still let the
DOM event bubble, because our second listener is a safety mechanism and RuneLite has no analogue of
it.

### 6.6 The two sprint 3 items D42 folds in

D42 folds sprint 3 entry 2's client patch into this entry's key-routing patch "with the typing-mode
precedence written there", so **the same numbered patch batch this entry ships also delivers sprint 3
entry 2's client-patch half**. Sprint 3 keeps that row's other two halves, the armed login and the
shell command line. Written here:

- **Function keys F1 to F7 switch sidebar tabs.** They are active in **both** modes and typing mode
  does not swallow them, because a function key is never text and a player mid-sentence who presses
  F3 means the tab. **They do not arrive as `ch` 0.** `KeyCodes.ts:30-36` maps them to `ch` 1008 to
  1014, above the under-30 clamp, so they are queued today and already reach `pollKey()` and every
  `handleInputKey()` branch. Routing them from `e.code` (`F1` to `F7`) alongside the WASD
  interception is still the right shape, but the patch must **also** stop the existing `ch` 1008 to
  1014 queue entries from reaching `handleInputKey()`, or one press switches the tab twice. F11 and
  F12 stay in `CanvasEnabledKeys` and are not taken.
- **Escape closes the open interface.** Section 6.5's table places it: in typing mode, clearing the
  line wins and the interface stays open, so one Escape does one thing and a second closes the
  interface. That is the precedence D42 asks for, and it is the ordering a player expects from every
  other client.

Both are active whether or not `cs.cam.wasd` is on, because neither depends on camera mode. They add
no patch of their own: they ride **patch N+4** (section 11), so the numbered patch batch this entry
ships delivers sprint 3 entry 2's client-patch half as well. Sprint 3's row for them is marked
"delivered by Dragon Slayer entry 9 (D42)", and that row's other two halves, the armed login and the
shell command line, stay in sprint 3 and are not touched here.

**Which layer sees each key first.** Section 6.5 states the order for Escape; the two folded keys
are placed against it here, because a key that reaches a layer at all is what decides whether an arm
can fire.

| Key | 1st: canvas `onkeydown` inside the iframe (`GameShell.ts:426-478`) | 2nd: the client's key queue and `handleInputKey()` | 3rd: the iframe's inner document (`stage.ts:196-207` `forwardEscape`) | 4th: the parent document (`runBanner.ts:260-265`) |
|---|---|---|---|---|
| F1 to F7 | Routed from `e.code`, switches the sidebar tab, and the matching `ch` 1008 to 1014 queue entry is suppressed | Never reached, by construction: suppressing it is what stops one press switching the tab twice | Not reached. `forwardEscape` tests `key !== 'Escape'` and returns, so no function key ever crosses the frame boundary | Not reached |
| Escape | Handled at `ch` 27 above the under-30 clamp, as a dedicated signal: the typing arm and then the interface arm, in that order | Never reached. Escape is not queued (section 2) and `pollKey`'s four consumers never learn about it | Re-dispatched as a synthetic bubbling Escape on the **parent** document. The client patch must not `stopPropagation()`, which is why section 11's N+4 grep pins that count at 0 | Pauses the run **if and only if** `last?.state === 'running'`. Unconditional otherwise, and it knows nothing about either mode |
| Every printable key, `ch` 32 to 126 | Swallowed in camera mode; passed in typing mode | Reached in typing mode only | Not reached | Not reached |

**The precedence, as a table.** Four arms can want one Escape press: camera mode's, typing mode's,
the folded interface-close, and the shell's panic key. The first three are client-local and mutually
exclusive; the fourth is not an alternative to any of them and fires alongside whichever won.

| The player's state | Camera-mode arm | Typing-mode arm | Interface-close arm (D42) | Shell panic arm (a run is moving) |
|---|---|---|---|---|
| Camera mode, nothing open, no run moving | Nothing locally | n/a | Nothing to close | Silent: `last.state` is not `running` |
| Camera mode, an interface open, no run moving | Yields to the interface arm | n/a | **Closes the interface** | Silent |
| Camera mode, an interface open, a run moving | Yields | n/a | **Closes the interface** | **Pauses the run.** Both happen on the one press |
| Camera mode, nothing open, a run moving | Nothing locally | n/a | Nothing to close | **Pauses the run** |
| Typing mode, chat line non-empty, an interface open | n/a | **Clears the line and returns to camera mode; wins** | Does not fire. A second Escape, now in camera mode, closes the interface | Pauses the run if one is moving |
| Typing mode, chat line empty, an interface open | n/a | **Returns to camera mode; wins** | Does not fire. A second Escape closes the interface | Pauses the run if one is moving |
| Typing mode entered by a prompt | n/a | **Cancels the prompt** its own close path's way; camera mode returns on the falling edge of `promptOpen` | Does not fire; the prompt is what the press cancelled | Pauses the run if one is moving |
| `cs.cam.wasd` off (no modes at all), an interface open | n/a | n/a | **Closes the interface.** This is the whole of the client's new Escape behaviour for a player who never turns the setting on | Pauses the run if one is moving |

Read down the last column and it is one sentence: **the panic key is never a branch of anything
above it.** It is not made conditional on typing mode, on an open interface, or on the interface
arm having found something to close. That is the ruling section 6.5 already makes about typing mode,
and the interface arm is added under it on the same terms rather than beside it, so no condition is
ever added to `runBanner.onKey`. Read across a row and it is one more: **at most one client-local
arm fires per press**, so one Escape never both clears a line and closes an interface, and a player
who wants both presses twice. That ordering, typing before the interface, is the one D42 asks for
and the one every other client teaches.

### 6.7 Where this differs from RuneLite, on purpose

RuneLite's swallow is narrow: a `blockedChars` set populated only for the keys it just remapped, each
behind its own config toggle (`KeyRemappingPlugin.java`). D41's rule is broader, swallowing every
printable key, and this spec implements D41. The reason the broader rule is right here is that our
chat input has no focus concept: RuneLite can ask `client.getFocusedInputFieldWidget() != null` as a
general escape hatch, and our fork has no such call, so a narrow swallow would leak every unremapped
letter into `chatInput`. The broad swallow plus the three-flag `promptOpen` computation is the
equivalent guarantee built from what the fork actually exposes.

### 6.8 The hint

"Press Enter to chat" is drawn by the shell over the canvas, never by a client patch, so the patch
stays a key-routing change. RuneLite substitutes its own "Press Enter to Chat..." text directly into
the chatbox input widget (`setChatboxWidgetInput`); our chat is not a RuneScript widget, so an
overlay is the right analogue.

`web/src/frame/overlays.ts` gains a fourth slot, `setHint(text: string | null)`, rendered as
`pill(text, 'neutral', { corner: true })` with the word Enter inside a `kbd`. It is a frame concern
rather than a plugin overlay because its setting lives in a panel that receives no `PluginContext`.
It is written against shell v2's Task 13 rewrite of that layer, not against `overlays.ts` as it reads
today.

**The hint is exempt from Hide overlays** (ruling R16). The first draft argued the opposite, that
living inside `#overlays` means the hint inherits the Configuration panel's Hide overlays switch
"for free". Verified at `1fe96f16`: `main.ts:147` is
`toggleOverlays: () => { const o = byId('overlays'); o.classList.toggle('hidden'); ... }` and
`overlays.ts` exposes `setHidden` on the same root, so hiding overlays would hide every slot
including this one. Inheriting that is not free, it is wrong: a player who hid the overlays for an
unrelated reason would get camera mode's full `ch` 32 to 126 swallow with nothing on screen saying
why their typing does nothing, which is the single confusion the owner asked the hint to prevent. So
`setHint` renders into its own `#hint` element, a sibling of `#overlays` in the same stacking
context, styled as the same `.ov-pill` and untouched by `toggleOverlays`.

**Corner: bottom left, nearest the chat line.** The owner's words are "a hint in the chatbox";
section 15 supersedes the placement because the shell cannot draw into the client's chat area, but
the meaning of the request is that the player sees it where they were about to type. A hint that
lands top right keeps the letter of that supersession and loses its point. Section 13's
`camera.pw.test.ts` asserts the corner rather than leaving it to the implementer.

Shown when all four hold: `cs.cam.wasd` is on, the last `inputMode` event said typing false, a
session is active, and that session is logged in. Hidden otherwise. It is driven by the event and
never by a timer, which is section 8's whole reason for making `inputMode` an event.

### 6.9 Camera mode and a running script

`web/src/agent/localTransport.ts:71-83` attaches an `onHuman` handler to the client canvas for
mousedown and keydown, excluding only Escape, and `web/src/tasks/humanInput.ts:60-63` turns any such
event into `pause()` with reason `human-input` while a run is running. With WASD on, every camera
nudge would pause the running script and show "You took over" (`runBanner.ts:53`).

Ruling R5: **the four arrow keys are excluded from the human-input detector unconditionally, the way
Escape already is, and W, A, S and D are excluded when `cs.cam.wasd` is on.**

The split is the correction. The first draft gated all eight on `cs.cam.wasd`, which defaults to
`'0'` (section 4.1), so the arrow keys would keep pausing a moving run with reason `human-input` for
every player who never opens the Display section, which is every player by default. The arrows are
camera keys whatever the WASD setting says, and `onHuman` (`localTransport.ts:71-76`) already
special-cases one key with no setting behind it. The transport is built per session at
`web/src/tasks/wire.ts:38`, so it takes a getter and reads `cs.cam.wasd` live for the WASD half only.

The arrow keys have this defect **today**, and this entry fixes it. That is what makes the arrows
unconditional rather than an afterthought hanging off a setting they have nothing to do with.

## 7. The display-rate draw loop

### 7.1 The split

`mainloop()` keeps its 20 ms `setTimeout` accounting, its catch-up loop and its ratio and count
arithmetic (`GameShell.ts:145-197`) exactly as they are. That arithmetic is what keeps game logic
time-correct when draws are slow and it must keep owning `mainloop()`.

Only the `await this.mainredraw()` call at `GameShell.ts:203` moves. It goes into a new
`client/src/hooks/DrawLoop.ts` (R18), a small module `GameShell` composes rather than more lines
inside `GameShell`:

| Member | Purpose |
|---|---|
| `start(draw)` | Begins a self-rescheduling `requestAnimationFrame` chain over the supplied draw function |
| `setTarget(50 or 60 or 'unlocked')` | A frame is drawn when `now - last >= 1000 / target` |
| `stop()` | Cancels the chain |
| `frames()` | Rolling one-second count of **completed** draws, for `ClientState.fps` |

**`mainredraw()` is `async`, so `DrawLoop` needs an explicit in-flight rule.** It is declared
`override async` (`Client.ts:3538`) and awaits inside itself (`await this.titleScreenDraw()`,
`:3554`), and today `GameShell.ts:203` awaits it, which is what serialises draws. A
`requestAnimationFrame` chain does not serialise anything by itself, and a callback arriving while a
draw is still pending is the normal case on a slow machine at Unlocked, which is the case section 7.5
is about. **A callback that arrives while a draw is pending is dropped, not queued**, and
`frames()` counts completed draws only. Without that rule two draws interleave inside `Pix2D.cls()`
and `areaGame.setPixels()`. `DrawLoop.test.ts` carries the case.

**`MapView` is the second `GameShell` subclass and it is in scope.**
`export class MapView extends GameShell` (`MapView.ts:14`) overrides both `mainredraw()` (`:322`) and
`mainloop()` (`:437`), so moving the draw call out of `GameShell`'s loop changes its scheduling too,
and the deleted `tfps` sleep and the raised `setTargetedFramerate` clamp apply to it as well. The
expected effect is benign, the map view simply draws on the display clock, but it is named here
because the first draft's file lists, patch table and test plan mentioned it nowhere and a plan
following section 7.1 would discover it mid-task. Patch N's `PATCHES.md` entry says the composition
lives in `GameShell` and therefore covers both subclasses.

Unlocked draws on every `requestAnimationFrame` callback, which is the display's own rate. There is
no free-running loop and no zero-delay `setTimeout` spin: the browser's vsync is the clock, which is
what unlocked means in every client that offers it and is also what keeps a background tab cheap.

The `tfps` sleep at `GameShell.ts:206-211` is **deleted**. It can only ever slow the loop down and
the loop no longer owns the draw.

### 7.2 The two clocks, and what stays on which

This is the correctness heart of the change, and the first draft got it wrong. It named
`Client.drawCycle` and `Pix3D.cycle` as the two counters that must move to the game clock. Neither is
a frame-timing quantity, and the two that are went unmentioned. Read at `1fe96f16`:

- **`Client.drawCycle`** is a static (`Client.ts:175`), incremented at `Client.ts:3550`, and read in
  exactly one place in the tree: a `console.log` inside `lag()` (`Client.ts:5593`). Nothing is keyed
  on it. Moving it changes no behaviour at all, so it **stays where it is**, in `mainredraw()`, where
  its name is still honest.
- **`Pix3D.cycle`** is not a frame counter. It is declared at `Pix3D.ts:30` and incremented once per
  texture acquisition at `Pix3D.ts:148` (`this.texCycle[id] = this.cycle++`), and it is consumed as
  an LRU eviction stamp by the scan at `Pix3D.ts:158-166` (`this.texCycle[t] < cycle`). It is
  incremented nowhere in `Client.ts` or `GameShell.ts`. Moving it to the 20 ms clock would break
  texture eviction ordering outright and also break `textureRunAnims`'s guard
  `Pix3D.texCycle[17] >= cycle` (`Client.ts:7174`, `:7194`), which compares an LRU stamp against a
  snapshot of the same counter taken at `Client.ts:6616`. It is a **cache-presence test**, not a
  clock. It is **not touched**.
- The stated hazard, that a 60 target would speed texture animation up by 20 per cent, **does not
  exist**. The shift is `texture.wi * this.worldUpdateNum * 2` (`Client.ts:7181`, `:7200`), and
  `worldUpdateNum` is incremented once per game cycle (`Client.ts:4561`) and reset to 0 once per draw
  at the end of `gameDraw()` (`Client.ts:6547`). It already means "game cycles elapsed since the last
  draw", so it is frame-rate independent by construction.

The two quantities the split actually has to reason about:

| Quantity | What it is | What the split does |
|---|---|---|
| `worldUpdateNum` (`Client.ts:340`, `++` at `:4561`, `= 0` at `:6547`) | An accumulate-and-reset delta: game cycles since the last draw | **Left exactly as it is.** It is already correct at any frame rate, because the sum over a second still equals the number of game cycles. What changes is that a draw can now see `worldUpdateNum === 0`, which never happened before |
| `sceneCycle` (`Client.ts:459`, `++` at `:6551`) | A genuine per-**draw** counter | Its two timing consumers move to the game clock; its dedupe use stays |

**The rule for a zero delta.** Under a display-rate loop, draws that fall between game cycles see
`worldUpdateNum === 0`. Every consumer must be a no-op at zero and none may divide by it. The list is
`textureRunAnims` (`:7181`, `:7200`, shift of 0), `proj.move(this.worldUpdateNum)` (`:6760`),
`spot.update(this.worldUpdateNum)` (`:6799`), `animateInterface(..., this.worldUpdateNum)` (`:6307`,
`:6349`, `:7232`, `:7237`) and the inventory autoscroll arithmetic (`:12399-12415`). The plan reads
each and the patch's own test asserts a draw at zero delta changes nothing.

**What `sceneCycle` drives, and why it moves.** `this.sceneCycle % 20 < 10` picks the hitsplat and
headicon flash colours (`Client.ts:7107-7111`), and `sceneCycle` is passed as the phase to
`centreStringWave` for overhead text (`:7145-7146`). Those advance once per **draw**, so at 60 they
run 1.2 times fast and unlocked on a 144 Hz display about 2.9 times fast. Both read
`Client.loopCycle` instead, which is the idiom the same file already uses two dozen lines away for
the hint headicon (`Client.ts:7166`, `Client.loopCycle % 20 < 10`). `sceneCycle`'s other use, the
`tileLastOccupiedCycle` dedupe at `:6689`, `:6693`, `:6723` and `:6727`, is a per-draw stamp and is
correct at any rate, so `sceneCycle` keeps incrementing per draw and keeps that job.

| Advances on the 20 ms game clock | Advances on the display clock |
|---|---|
| `Client.loopCycle` | The rasterised pixels |
| The hitsplat and headicon flash phase, and `centreStringWave`'s phase (both re-pointed at `loopCycle`) | `Client.sceneCycle`, as the `tileLastOccupiedCycle` dedupe stamp only |
| `worldUpdateNum`, unchanged, and every consumer of it | `Client.drawCycle`, unchanged, read only by `::lag` |
| `camShakeCycle` (`Client.ts:4710`) | - |
| Entity positions, projectiles, animations | - |
| The anti-macro offset timer (`Client.ts:4737-4740`) | - |
| `Pix3D.cycle`, which is a texture LRU stamp and not a clock at all | - |

### 7.3 What is interpolated

**The camera, and only the camera** (ruling R3). `followCamera()` eases `orbitCameraX`,
`orbitCameraZ`, `orbitCameraPitch` and `orbitCameraYaw` once per 20 ms cycle. The patch keeps the
previous cycle's four values alongside the current ones, and `gameDrawMain()` resolves the eye from a
linear blend at alpha equal to `(now - lastCycleAt) / 20` clamped to 0..1 before calling `camFollow`.
Yaw blends the short way around the 2048-unit wrap. When `cs.fps.interpolate` is off, alpha is pinned
to 1 and the draw uses the current cycle's values, which is today's behaviour exactly.

**Not interpolated, and why:**

- **Entity positions.** They are already interpolated between the 600 ms server ticks by the existing
  movement code, and they advance on the 20 ms cycle. Interpolating them again means holding a second
  copy of every entity's position and is where a bug that looks like rubber-banding comes from. The
  visible artefact of leaving them is a 20 ms step on moving entities against a smooth camera, which
  is a far smaller error than the one the camera had.
- **Camera shake** (`Client.ts:6588-6592` and `:6631-6635`). It is deliberate per-cycle noise and
  interpolating it smooths it into nothing. One clause the review added: the jitter is computed in
  the **draw** path at `Client.ts:6594` and contains a fresh `Math.random()` per call, so under a
  display-rate loop it re-rolls two or three times per game cycle at 60 and more when unlocked, and
  the shake's noise frequency would track the frame rate even though its
  `sin(camShakeCycle * amp)` term does not. That is a behaviour change this entry has not signed up
  for, so **the random term is sampled once per game cycle and held across the frames of that
  cycle**, which restores the shake to exactly today's feel at every target.
- **The 2D interface layer, the minimap and the chat.** They are redrawn from the same state; nothing
  about them is continuous.

Entity interpolation is named in section 10 as a door the WebGL entry opens, not as a thing this
entry defers by accident.

### 7.4 The frame target, and `::fps`

`setTargetedFramerate()`'s clamp rises from 50 to 999, matching the range RuneLite's GPU plugin uses
for `fpsTarget` (`GpuPluginConfig.java`, 1 to 999, default 60), and it now writes `DrawLoop`'s target
rather than the deleted `tfps` sleep. So `::fps <n>` (`Client.ts:5455-5468`) keeps working, keeps its
syntax, and drives the same knob the Display section drives. `::fpson` and `::fpsoff` keep their
present meaning, the fps counter.

`::fps` does **not** persist: it is a session override, and the Display section's value is restored
on the next boot. That is the same relationship `::` commands have to every other setting and it
keeps a debugging command from silently rewriting a stored preference.

The three panel positions are 50, 60 and Unlocked. There is no free-running number in the panel,
because a number the rasteriser cannot reach is a setting that lies. **Unlocked carries a one-line
warning in the panel**: the GPU spike (`2026-09-05-sp2b-gpu-spike-findings.md`) found that software
rasterising to a 144 Hz display is not reachable without a GPU backend, so Unlocked means "as fast as
this machine manages" and not 144.

### 7.5 A slow machine

The two clocks are independent, so a slow machine degrades in one direction only.

- **A slow draw** means `requestAnimationFrame` fires and the frame takes longer than its budget. The
  browser simply calls back less often. `mainloop()` keeps its own `setTimeout` and the game clock
  does not drift. **This is the opposite of today**, where a slow draw stretches the 20 ms cycle
  because both are in one call chain, and it is the main reason to make the split at all.
- **A starved game clock**, where the tab is throttled or the machine cannot keep up, hits the
  existing ratio and count arithmetic and behaves exactly as it does now: count under 256 bounds the
  catch-up, ratio is clamped to 25..256, and the client falls behind rather than freezing.
- JavaScript is single-threaded, so independent means "not in the same call chain", not "parallel". A
  very long frame still delays the next `setTimeout`. The guarantee this entry makes is narrower and
  true: **a slow draw never advances the game clock and never causes a dropped or duplicated game
  cycle**.
- The render-suspend guard (patch 26, `Client.ts:3546-3548`) sits inside `mainredraw()` and keeps
  working; a suspended background tab still runs its game clock and draws nothing, which is what SP7
  wanted.

### 7.6 `ClientState.fps` changes meaning

`ClientState.fps` is `GameShell`'s derived ratio number today (`GameShell.ts:199-201`, read at
`Client.ts:13910`), not a measured frame count. Under a display-rate loop that number describes the
game clock and says nothing about what the player sees. It becomes **`DrawLoop.frames()`, a true
rolling one-second count of drawn frames**, which is what both of its consumers already claim it is:
`web/src/main.ts:264` renders it in the footer and `web/src/panels/connect.ts:82` in the connection
line. Both are display-only, so nothing breaks and both get more honest. The old derived ratio is not
re-exposed, because nothing read it for its actual meaning.

## 8. Hooks, and the shell fan-out

### 8.1 One method, not seven

`ClientHooks` gains exactly one method, `setDisplay(opts)`, taking a partial of this shape:

| Field | Type | Meaning |
|---|---|---|
| `zoom` | number | 0.50 to 2.00 |
| `wheel` | boolean | Wheel zoom on |
| `pitchMax` | number | 383 to 512 |
| `wasd` | boolean | Camera mode on |
| `radius` | number | Draw distance in tiles |
| `fpsTarget` | 50, 60 or `'unlocked'` | The draw clock's target |
| `interpolate` | boolean | Camera interpolation on |

Its closure goes inside the existing `installHooks` literal that opens at `Client.ts:698`, beside
`setRenderSuspended` (`Client.ts:733-739`) and `setAttended` (`Client.ts:740-742`), so it rides an
anchor a numbered patch already owns. Partial application means the wheel's write-back and a single
slider drag each send one field. Note that `setRenderSuspended` is declared **twice** in
`hooks/types.ts`, once on `ClientHooks` (`:72`) and once on `HookBridge` (`:98`, the shape of that
literal), so `setDisplay` is declared twice as well and section 11's grep says 2.

`HookEvents` gains **two** entries, not one:

| Event | Payload | Direction |
|---|---|---|
| `inputMode` | one boolean field, `typing` | Emitted on transition only, never on a timer |
| `zoomChanged` | one number field, `zoom` | Emitted by the wheel handler's write-back only (section 5.2) |

The first draft said "exactly one method" and "one entry" and then required an `onZoomChanged`
callback that had no declared home on either interface. `zoomChanged` is an event because
client-to-shell notification on this surface exists only as a `HookEvents` entry consumed through
`on()` (`hooks/types.ts:39-50`, `:90`); `ClientHooks` still gains **exactly one method**,
`setDisplay`. Both events need their mirror in `web/src/clientTypes.ts`, and neither is added to
`localTransport.ts`'s `EVENTS` list (section 12.1).

### 8.2 Why the mode is an event and not a `ClientState` field

`getState()` is refreshed by the `state` hook event, which fires once per `PLAYER_INFO`, that is once
per 600 ms server tick (`clientTypes.ts:69-70`). A polled hint would lag a keypress by up to 600 ms,
and appearing the instant the player leaves typing mode is the hint's entire job. The event costs one
name in `client/src/hooks/types.ts`, its mirror in `web/src/clientTypes.ts`, and one entry in the
terser reserved list for its payload field.

**It costs no entry in `localTransport.ts`'s `EVENTS` list**, and the first draft said otherwise,
which contradicted section 12.1 in the same document. `EVENTS` (`localTransport.ts:16-17`) is exactly
the set of hook events a Worker-resident script receives through the transport's `onEvent`; section
12.1 rules `inputMode` off that set, and the shell's hint listens through `ctx.client().on(...)`,
which needs no `EVENTS` entry at all. Neither `inputMode` nor `zoomChanged` is added to it.

The shell also **cannot infer the mode itself**, which is what makes the event required rather than
merely nicer. Typing mode is entered by the client when it opens a text prompt, and the three flags
that decide that are private to `Client.ts` inside `handleInputKey()` (`Client.ts:5333`, `5340`,
`5400`). Inferring it from `getWorldState().interfaceTexts` is not attempted.

### 8.3 The fan-out, and the three traps

`setDisplay` is called in exactly two places:

1. **On boot**, beside `setAttended(true)` at `web/src/sessions/manager.ts:188`, the same catch-up
   point `stage.syncClientPlugins` uses (`web/src/frame/stage.ts:208-213`).
2. **On change**, through a new `Stage.applyDisplay()` that loops `sessions.list()`, shaped like
   `stage.toggleClientPlugin` (wired at `main.ts:188`).

It is **not** called on tab switch, because display settings are per browser and not per session
(ruling R8). That is the one place this differs from `setRenderSuspended`, which is re-applied inside
`show()` at `manager.ts:222` precisely because it **is** per session.

Three traps the plan must carry:

- **Terser.** `setDisplay` and every settings field name, plus the two event payload fields `typing`
  and `zoom`, must be added to the reserved array at `client/bundle.ts:82-107` or the production
  bundle mangles them while `build:dev` keeps working. Event **names** are string literals and
  survive; payload **field** names do not. (`zoom` is a new reserved name; `fps` is already there.)
- **The mirror.** `web/src/clientTypes.ts:1` says "Mirror of client/src/hooks/types.ts; keep
  identical". Both files change in the same commit.
- **Re-subscription.** `ctx.client()` is a different object after a tab switch (`main.ts:165`), so
  whatever listens to `inputMode` re-subscribes. `stage.syncChrome` (`frame/stage.ts:220-244`)
  already runs on every tab switch and close and is the hook point.

## 9. Draw distance

### 9.1 What the slider does now

`renderAll` computes `minX`, `maxX`, `minZ` and `maxZ` from a hard-coded plus-or-minus-25 window
(`World.ts:982-1000`), then clamps to `maxTileX` and `maxTileZ`. The patch replaces the literal 25
with a field read per frame.

**The slider ships five stops, 15, 25, 32, 40 and 50 tiles, default 25, maximum 50** (ruling R11).
Those are the D40 spike's numbers, not this document's. The first draft shipped 15 to 25 and
described the spike as an unmet prerequisite; the spike has since run and reported, and its
conclusion is appended to the idea file as "Draw-distance spike (2026-09-07)" with the evidence in
its workspace. Its recommendation is a five-stop slider at 15, 25, 32, 40 and 50, default 25, with
**no engine change and no rebuild-policy override**, and it independently confirms both of this
document's own corrections, that the far clip is not the binding bound and that the window and
`visBacking` are.

**Why 50 is a real ceiling rather than a picked number**, from the spike: the built scene is 104
tiles across, so 52 is its half width, and the guard borders the code already assumes (`groundh` and
`occlusionCycle` are `SIZE + 1`, and `resetVisCalc` works over `(2r + 3)` squared) make 50 the
largest clean radius that fits. Above it the window simply clamps to the scene edge and the quadratic
visibility pass is paid for tiles that are not there. Anything beyond 50 needs a larger built scene,
which is a `REBUILD_NORMAL` protocol change and out of scope.

**The honest line about pop-in, which the panel carries in one sentence of help text.** The engine
rebuilds only when the player leaves a reload box
(`engine/server/src/engine/entity/BuildArea.ts:57-96`): the box spans zone offsets -4 to +5 and the
scene spans -6 to +6, so **the guaranteed margin from the player to the scene edge is 16 tiles**,
and today's client already draws to 25. Seeing the scene edge
in flat open ground on the far side of a reload box is existing upstream 274 behaviour, not something
the slider introduces. A larger radius makes that edge visible somewhat more often and, most of the
time, shows a great deal more world. That is a trade the player chooses, and the section says so
rather than promising a guarantee the engine does not make.

**Reducing rebuilds nothing.** The bounds are recomputed per frame from the field, so a radius at or
below the radius the table was baked for simply reads a smaller part of a table that is already
there. A drag downward is smooth and takes effect on the next frame.

### 9.2 What the maximum costs, now that the spike has reported

The two numbers this document added to the spike's brief (D51) both survived it, and the spike
returned two more.

- **The clip is not the bound.** Raising the `pz > 3500` test (`World.ts:938`) alone changes nothing,
  because `renderAll` never looks outside the tile window. Confirmed.
- **The table cost.** `visBacking` is pitch buckets times 32 times `(2r + 1)` squared booleans, at
  about 4 bytes per V8 slot: roughly 2.7 MB at r = 25 with today's 8 buckets, 10.4 MB at r = 50.
  **With this entry's 13 pitch buckets those multiply**: 13 by 32 by 101 by 101 is about 4.2 million
  booleans, on the order of 17 MB, with a boot precompute around five times today's rather than the
  four times a radius-only estimate gives. That is why the table is dimensioned for the **current**
  setting and not for the maximum (section 9.3), and it is the lever R2's 448 fallback exists for.
- **`resetVisCalc` is not free.** The spike puts it at 288 orientations over `(2r + 3)` squared tiles
  with up to 11 `testPoint` samples each, estimated 0.1 to 0.3 s at r = 25 and 0.4 to 1.0 s at
  r = 50. So a radius change above the baked radius applies on release and never during a drag.
- **`Model.ts:1723` moves with the window.** Section 9.3.

**The guaranteed no-pop-in radius is a scene-rebuild question, not a clip question, and the answer is
16 tiles.** The client holds a 104-tile square region (`BuildArea.SIZE = 13 << 3`,
`CollisionMap.ts:9`) and the server decides when to rebuild it: `ServerProt.REBUILD_NORMAL`
(`Client.ts:9214-9250`) carries the new centre zone and drops `sceneState` to 1, and `checkScene()`
(`Client.ts:7479-7517`) promotes it back and calls `mapBuild()`. Nothing in the client decides when
to rebuild. The spike worked the margin out from `BuildArea.ts:57-96` and got 16 tiles guaranteed,
decaying to that from 48 to 55 straight after a rebuild.

**The spike also ruled against changing that policy, and this entry follows it.** Tightening the
reload box to plus or minus one zone would raise the guarantee to 40 tiles but shrink the box from 72
tiles across to 24, roughly tripling rebuilds, and each rebuild is on the order of 400,000 tile
iterations plus about 440 KB of fresh allocation plus a full entity shift, with the scene unusable
while `sceneState === 1`. Trading a rare visible horizon for three times as many scene hitches is a
bad trade. So: no engine change, no private-world override, and nothing under `engine/` is touched.

### 9.3 When the maximum does rise

Raising the radius above the radius the table was baked for re-dimensions `visBacking`'s last two
axes and re-runs `World.resetVisCalc`, which the spike prices at 0.4 to 1.0 s at r = 50. **It is
applied at the next scene rebuild, not immediately**, so the player sees the new distance when they
next cross a zone boundary rather than a freeze mid-step. The panel says so in one line. Reducing
needs no rebuild and is live on the next frame.

**The live per-model far clip moves with the window, and this is the piece the first draft missed.**
`Model.worldRender` rejects any model with `midZ >= 3500` on **every frame for every model**
(`client/src/dash3d/Model.ts:1723`). Section 2 establishes that 25 tiles times 128 units is 3200
against that 3500, so any window above about 27 tiles is cut by the model clip while the ground under
it still draws: **locs vanish over terrain that is still there**, which is precisely the pop-in
artefact the owner's sentence is about. So `Model` reads a `static farClip` that moves with
`World`'s radius, `dash3d/Model.ts` joins `dash3d/World.ts` in patch N+3's file list with its own
anchor and its own grep, and it joins the changed-files table in section 16. Nothing in the 15-to-25
range is affected, which is why this reads as a gap in the forward-looking half rather than a bug in
what ships first.

The two constants are the whole shape the spike recommended and this entry adopts: **one
`static drawRadius` on `World` with every `+ 25` and `- 25` derived from it, and one
`static farClip` read by `Model`.** Two files, two anchors, two greps, rather than the roughly
twenty-five scattered `25` literals in `World.ts`.

`Client.lowMem` gates scene detail and forces a rebuild on level change (`Client.ts:7455-7462`), and
the shell boots the client with a `lowmem` argument. The draw-distance setting is clamped by `lowMem`
rather than fighting it: with `lowMem` set the effective radius is the smaller of the setting and 25,
so the two upper stops are unreachable on a low-memory session and the panel greys them.

## 10. The renderer doors

Three doors, all required to stay open by the sprint row and by D41, and each of them a thing this
entry does rather than a thing it promises.

**Scene drawing stays behind one call.** It already is: `this.world?.renderAll(...)` at
`Client.ts:6623`, inside `gameDrawMain()`. The first draft defined the seam as "that call plus its
camera-shake bracket" and, two sentences later, as "nothing after `renderAll`". Those are not the
same boundary and the code has the second shape, not the first: the shake save is at
`Client.ts:6588-6592` and the restore at `:6631-6635`, and **between** `renderAll` and the restore
sit `this.world?.removeSprites()` (`:6624`), `this.entityOverlays()` (`:6625`), `this.coordArrow()`
(`:6626`), `this.textureRunAnims(cycle)` (`:6627`), `this.otherOverlays()` (`:6628`) and
`this.areaGame?.draw(4, 4)` (`:6629`), which are exactly the 2D layer this section says a backend
must not replace.

**So the seam is `renderAll` and the clear that precedes it, and nothing else.** The patch extracts
`Pix2D.cls()` (`:6622`) plus `this.world?.renderAll(...)` (`:6623`) into a named private method
`Client.drawScene(level: number): void`; the camera-shake save, apply and restore stay in
`gameDrawMain()` around the call, exactly where they are today. That gives the seam a name a later
entry can search for and a signature a backend can implement, and it draws the boundary where the
document's own sentence always meant it: everything before is scene population (`addPlayers`,
`addNpcs`, `addProjectiles`, `addMapAnim`, `Client.ts:6553-6558`) and everything after is 2D overlay
onto the same `areaGame` PixMap. A later entry can rely on that as written; it could not rely on the
first draft's version.

**The loop is drivable at any rate.** `DrawLoop` takes the draw function as a parameter and owns only
the scheduling. A backend that wants to drive frames from its own presentation clock calls
`DrawLoop.stop()` and calls the same draw function itself. Nothing in `mainloop()` needs to know.

**The dormant client-plugin frame capability is not wired** (ruling R12).
`client/src/plugins/capability.ts:6-9` already declares `renderer.set` and `current`,
`frame.onBeforeDraw` and `onAfterDraw`, `scene.project` and `menu.onBuild`, with `renderer.set`
throwing for anything but software and `scene.project` returning null. D18 declares that tier dormant
and nothing calls `_fireBeforeDraw` or `_fireAfterDraw`. This entry does not wake it, and it does not
make the seam harder to reach than it is now: `drawScene` is the method those fire points would
bracket when a later entry needs them.

**What a WebGL backend would replace**, stated so the later entry's scope line can be written from
here: `Client.drawScene` and nothing else in this entry. The 2D interface layer, the minimap, the
chat and every overlay stay on the software path and on the same `areaGame` PixMap. The camera
resolution (`camFollow`), the interpolation and the input mode are all backend-independent and are
reused as they stand. Entity interpolation (section 7.3) is the one piece of work that entry inherits
rather than finds finished.

## 11. The client patches

Numbering is at 28 today (`client/PATCHES.md`) and SP8c adds more before this entry, so these are
**the next free patch numbers, N through N plus 5**, never a literal. Each gets its `PATCHES.md`
entry with number, purpose, the surrounding code that anchors it and a grep with a stated expected
count. `scripts/patches-check.ps1` does not exist (audit C24, sprint entry 3), so the greps are run
by hand until entry 3 lands.

The order matters: the key-routing patch depends on the hooks patch existing, and the three camera
patches are independent of each other.

Every grep below is a literal runnable command with a count taken against the **post-patch** file.
The first draft's table failed that on four rows: it grepped for `this.drawCycle++` against a static
field, for `TypedArray4d(12, 32` against a dimension that is wrong and a site that exists twice, for
`25` with no file argument, and for `setDisplay` counting 1 in a file that declares the method twice.
Those are the entry's machine checks, so an unsatisfiable grep is a defect and each is corrected.

| # | Purpose | Files | Grep, with expected count |
|---|---|---|---|
| N | The display-rate draw loop: `mainredraw` moves to `DrawLoop`, the `tfps` sleep is deleted, the in-flight guard, `sceneCycle`'s two timing consumers re-pointed at `loopCycle` | `src/client/GameShell.ts`, new `src/hooks/DrawLoop.ts`, `src/client/Client.ts` | `grep -c "drawLoop.start(" src/client/GameShell.ts` is 1; `grep -c "tfps" src/client/GameShell.ts` is 0; `grep -c "Client.loopCycle % 20 < 10" src/client/Client.ts` is 4 (the three re-pointed flash sites at `:7107-7111` plus the pre-existing one at `:7166`); `grep -c "this.sceneCycle" src/client/Client.ts` is 5, the increment at `:6551` plus the four `tileLastOccupiedCycle` lines and nothing else |
| N+1 | Zoom: the factor at the runtime formula site, `testPoint`'s far clip parameterised for the bake, the wheel handler | `src/client/Client.ts`, `src/client/GameShell.ts`, `src/dash3d/World.ts` | `grep -c "camZoom" src/client/Client.ts` is 4, the field, the `camFollow` call, the wheel step and the `setDisplay` closure; `grep -c "ZOOM_MAX_FP" src/client/Client.ts` is 2; `grep -c "addEventListener('wheel'" src/client/GameShell.ts` is 1; `grep -c "farClip" src/dash3d/World.ts` is 3, the parameter, the `testPoint` compare and the `resetVisCalc` call |
| N+2 | Pitch: the two clamps read `camPitchMax`, both visibility tables and both loop bounds widened, the wire value clamped to 383 | `src/client/Client.ts`, `src/dash3d/World.ts` | `grep -c "camPitchMax" src/client/Client.ts` is 4, the field, the orbit clamp at `:5640-5644`, the camera-shake clamp at `:6606-6612` and the `setDisplay` closure; `grep -c "TypedArray4d(13, 32, 51, 51" src/dash3d/World.ts` is 1, the static table; `grep -c "TypedArray4d(14, 32, 53, 53" src/dash3d/World.ts` is 1, the local table; `grep -c "pitch <= 544" src/dash3d/World.ts` is 1; `grep -c "pitchLevel < 13" src/dash3d/World.ts` is 1; `grep -c "Math.min(383" src/client/Client.ts` is 1, the `EVENT_CAMERA_POSITION` write |
| N+3 | Draw distance: `World.drawRadius` replaces the window literals, `Model.farClip` moves with it, both clamped by `lowMem` | `src/dash3d/World.ts`, `src/dash3d/Model.ts`, `src/client/Client.ts` | `grep -c "World.drawRadius" src/dash3d/World.ts` is 4, one per bound at `:982-1000`; `grep -c "static drawRadius" src/dash3d/World.ts` is 1; `grep -c "Model.farClip" src/dash3d/Model.ts` is 1, the `worldRender` compare at `:1723`; `grep -c "3500" src/dash3d/Model.ts` is 0. Note that `renderAll` legitimately **keeps** two literal `25`s at `:1014` as the `visBacking` index offset, so there is no zero-count grep over that block |
| N+4 | Camera mode and typing mode: the WASD interception, the swallow, Enter, Slash, Colon, Escape, F1 to F7, the prompt edges | `src/client/GameShell.ts`, `src/client/Client.ts`, new `src/hooks/InputMode.ts` | `grep -c "inputMode" src/client/Client.ts` is 3 or more; `grep -c "stopPropagation" src/client/GameShell.ts` is **0**; `grep -c "preventDefault" src/client/GameShell.ts` is unchanged from the pre-patch count; `grep -c "InputMode" src/client/GameShell.ts` is 2 or more |
| N+5 | Hooks: `setDisplay`, the `inputMode` and `zoomChanged` events, the terser reserved names | `src/client/Client.ts` (the `installHooks` literal at `:698`), `src/hooks/types.ts`, `src/hooks/install.ts`, `bundle.ts` | `grep -c "setDisplay" src/hooks/types.ts` is **2**, once on `ClientHooks` and once on `HookBridge`, matching how `setRenderSuspended` appears at `:72` and `:98`; `grep -c "setDisplay" src/hooks/install.ts` is 1; `grep -c "setDisplay" bundle.ts` is 1; `grep -c "'typing'" bundle.ts` is 1; `grep -c "'zoomChanged'" src/hooks/types.ts` is 0 (it is a key, not a string) and `grep -c "zoomChanged" src/hooks/types.ts` is 1 |

The N+4 greps are the load-bearing ones. A count of 0 for `stopPropagation` is the panic-key contract
expressed as a check a machine can run, and it is the assertion most likely to be broken by a
well-meaning later edit.

**All six sit behind entry 3's client-fork gate.** None of them may be written before entry 3 makes a
numbered patch checkable, and all six ride SP8c's batch so the fork is rebased once rather than
twice.

### 11.1 This entry is the fork's first numbered patch outside `Client.ts`

Ruling R18, and it needs saying in the open because two documents currently say it cannot happen.
`client/PATCHES.md:32-33` reads "Everything else in `client/` is the pristine 274 tree **except** the
call sites below, all in `src/client/Client.ts`", and the `idlescape-client-patch` skill's zone table
repeats it verbatim ("everything else | Pristine 274 | Changed only through the numbered call-site
patches, all in `src/client/Client.ts`"). This entry's patches touch `src/client/GameShell.ts` (N,
N+1, N+2 by way of the clamps, N+4), `src/dash3d/World.ts` (N+1, N+2, N+3), `src/dash3d/Model.ts`
(N+3) and `bundle.ts` (N+5). The D40 spike raised exactly this and said the spec must rule before the
first such patch is written.

**The ruling, in three parts:**

1. The convention is widened, not broken. **One anchor per file, one grep per anchor**, which is what
   section 11's table is now shaped as, and what keeps the upstream re-application checklist
   tractable. `dash3d/World.ts` and `dash3d/Model.ts` each get exactly one new static and every other
   edit derives from it, which is the shape the spike recommended.
2. `client/PATCHES.md`'s preamble is amended **in the same change**, from "all in
   `src/client/Client.ts`" to "in `src/client/Client.ts`, and from patch N onward in
   `src/client/GameShell.ts`, `src/dash3d/World.ts`, `src/dash3d/Model.ts` and `bundle.ts`; every
   patch entry names its file". The skill's zone table gets the same one-line amendment. Leaving
   either false after this entry lands would mean every future upstream bump re-applies changes in
   files the checklist says do not exist.
3. **The two new modules go in `client/src/hooks/`, not `client/src/client/`.** The skill's standing
   preference is "preferring to call into `client/src/hooks/` rather than to put logic in
   `Client.ts`", and `src/hooks/` is the zone declared ours and exempt from upstream bumps, so
   `DrawLoop.ts` and `InputMode.ts` placed there collide with nothing on a bump. Both are pure
   modules with no `Client` reference, which is what makes that placement honest rather than a
   filing trick. The 400-line ceiling applies to `src/hooks/` and both are well inside it.

## 12. Security, the sandbox and the performance budget

### 12.1 A script may never toggle camera or typing mode

D24 rules that a Worker-resident script is trusted as the account's own code, so this is a scope line
rather than a security boundary, and it is written as one:

Two of these are real mechanisms and two of them were not, so the list is restated as what the code
actually provides.

- **`inputMode` and `zoomChanged` are kept off `localTransport.ts`'s `EVENTS` allowlist** (`:16-17`,
  today `['login','logout','disconnect','xp','inventory','chat','tick','action']`). That array is
  exactly the set of hook events a Worker-resident script receives through `onEvent`, so leaving a
  name off it is a real gate. Nothing in the script API needs to know which mode the player is in,
  and knowing would only tempt a script to wait on it.
- **The settings are `localStorage` keys under `cs.`**, read only by the parent frame's `display.ts`
  and never by a Worker.
- **`setDisplay` never enters `Transport`, and that, not an allowlist, is the guarantee.** The first
  draft said `setDisplay` is "not added to the scoped script transport's allowlist". There is no
  allowlist: `workerContext.ts:85-89` builds the scoped transport as
  `{ ...d.transport, onState, relogin: <refused>, logout: <refused> }`, a spread with two deny
  overrides, and the comment at `:74-84` says so. Anything added to `Transport` reaches a script by
  default. `setDisplay` is a **hooks** method and is never added to `Transport`, and
  `workerContext.test.ts` pins the member list, which is the assertion that would fail if a later
  entry tried. Stating it as an allowlist would have implied a gate that does not exist.
- **There is no `forbidden_api` scan to add a name to.** The first draft said `setDisplay` joins it
  "the same guardrail-not-boundary treatment `relogin` and `logout` get". `grep -rn forbidden_api`
  over `web/src`, `server/src` and `scripts` returns nothing; every hit in the repository is inside
  `2026-09-07-script-api-docs-design.md`, `2026-09-07-script-api-survey-and-standard-design.md` and
  `2026-09-07-script-studio-design.md`, all three of which `docs/README.md:95-97` records as drafts
  awaiting owner review, uncommitted and unapproved. Row 9 cannot add a name to a list entries 5 and
  6 have not been approved to create. Restated as a **forward requirement**, the way D44 states its
  requirement on entry 13: *if and when entry 5's `forbidden_api` scan is approved and built, its
  name list includes `setDisplay`.* Nothing in this entry depends on it.

The panic key is the other half of this. Section 6.5 states its ordering and section 11 makes the
zero `stopPropagation` count a grep, so a script that pauses on Escape keeps working whatever the
input mode is.

### 12.2 The budget

Stated in the terms the software rasteriser makes true.

| Quantity | Budget | Why |
|---|---|---|
| Game cycle | 20 ms, unchanged | The catch-up arithmetic is untouched |
| Draw at target 50 | median frame time under 20 ms | Must equal today's behaviour |
| Draw at target 60 | median frame time under 16.6 ms at zoom 1.00, radius 25, camera rotating | The gate for shipping the 60 position |
| Boot cost of the wider pitch table | under 100 ms added to `resetVisCalc` at radius 25 | 13 static buckets against 8; a one-off at boot. The spike puts the whole pass at 0.1 to 0.3 s today, so 62.5 per cent of that is the bar |
| Draw cost against radius | roughly `(r / 25)` squared in tile submissions, and the spike's reasoned 1.5x to 2.5x frame time from r = 25 to r = 50 | The measurement the top two stops are judged against on the reference machine |
| Target 50 with interpolation off | returns today's frame timing exactly | The regression guard |

### 12.3 How it is measured

`ClientState.fps` becomes a true rolling one-second count of drawn frames (section 7.6), which is
what makes any of this measurable from outside the client at all. The harness is
`web/e2e/frameRate.pw.test.ts`: it boots a session, sets each target through the Display section,
holds W for five seconds, and samples `getState().fps` and `performance.now()` deltas. It **reports
and does not assert** on CI, because CI's machine is not the reference machine and a frame-rate
assertion there is a flaky test.

It asserts exactly **one** thing, that the count is non-zero. The first draft also asserted "that
target 50 produces fewer frames than Unlocked on the same machine" and called that
machine-independent. It is not: section 1 and section 7.4 both establish that the software rasteriser
cannot be assumed to reach any particular rate, and on any runner that sustains under 50 fps at zoom
1.00 and radius 25 the two targets produce the same count and the assertion flakes, which is the
failure the paragraph exists to avoid. The comparison is reported, not asserted.

Two harness details the plan needs and the first draft left implicit. Headless Chromium's
`requestAnimationFrame` cadence under Playwright is not a given: an unthrottled backgrounded page and
a 60 Hz virtual display give different answers, so the harness runs the page foregrounded and records
which it saw in its report line. And the key has to reach the canvas **inside the character iframe**,
which `page.keyboard.down` alone does not do: the idiom is `canvasClick(page, x, y)` from
`web/e2e/helpers.ts` first, which focuses the canvas (`tabIndex -1`), exactly as
`web/e2e/gameplay.pw.test.ts:46-49` already does for the chat test.

## 13. Testing

**Client, `bun test` in `client/`:**

- `src/hooks/InputMode.test.ts`, the new one that matters. `InputMode.ts` is written as a pure
  module so this needs no `Client` instance: given the mode, `promptOpen`, `ch` and `code` it returns
  the next mode, whether to swallow, which `keyHeld` slots to write and whether to emit. Cases: every
  boundary of the 32 to 126 swallow range; `ch` 1 to 5 and 10 passing through; W, A, S and D to
  `keyHeld[3]`, `[1]`, `[4]` and `[2]` and their releases; Enter both ways, consumed; Slash and
  Colon entering typing mode **without** being consumed (R15); Escape arriving as `code` 27 above the
  clamp rather than as a queued `ch`, in each of section 6.5's six rows; `ch` 1008 to 1014 for F1 to
  F7 in both modes, each dispatched exactly once; the values above 126 that are never printable
  (`ch` 1000 to 1003, 1015 to 1019, 65535) falling through untouched; the rising and falling edges of
  `promptOpen` for each of its three flags; the setting off, where every case reduces to today's
  behaviour.
- `src/hooks/DrawLoop.test.ts`: target arithmetic against a fake clock, that `stop()` cancels, and
  that a callback arriving while a draw is still pending is **dropped rather than queued** and is not
  counted by `frames()` (section 7.1).
- `src/dash3d/World.test.ts` gains the superset case R1 turns on: bake the table with the shipped
  parameters, bake three reference tables at zoom 0.50, 1.00 and 2.00 with the unmodified far clip,
  and assert every true cell of each reference is true in the shipped table.
- `src/hooks/` gains cases for `setDisplay`'s partial application and the `inputMode` and
  `zoomChanged` event shapes.

**Web, vitest:**

- `web/src/frame/display.test.ts`: the seven defaults, each key's clamp, that an out-of-range or
  garbage `localStorage` value falls back to the default rather than reaching the client, and that
  `applyDisplay` reaches every session in `sessions.list()`.
- `web/src/panels/configDisplay.test.ts`: every control renders, each writes its key, and the section
  composes only library classes.
- `web/src/ui/parts.test.ts`: the `range()` builder.
- `web/src/styles/styles.test.ts` and `styleguide.families.test.ts` pass with the new range prefix.
  These two are the ones that fail loudly if edit 3 or edit 4 of section 4.3 is skipped.

**Playwright, `web/e2e/camera.pw.test.ts`:**

1. WASD on, the hint appears, **in the bottom-left corner** (section 6.8).
2. With Hide overlays on, the hint is still visible (R16), while the XP line and the status line are
   not.
3. Press W, the camera yaw changes and no character reaches the chat line.
4. Press Enter, the hint disappears; type, the text lands in the chat line.
5. Press Colon from camera mode: the hint disappears and the colon itself lands in the chat line
   (R15).
6. Press Escape, the line clears and the hint returns.
7. Open a withdraw-X prompt, the hint disappears **without a keypress**; close it, the hint returns.
   This is the prompt auto-entry test and it is the one the bank interaction depends on.
8. With a run moving, press Escape: the run banner pauses. This is the panic contract, and it is
   asserted in this file rather than left to the banner's own tests, because it is this entry that
   could break it.
9. With a run moving and `cs.cam.wasd` **off**, press an arrow key: the run is **not** paused with
   reason `human-input` (R5), while any other key still pauses it.

**Frame rate:** `web/e2e/frameRate.pw.test.ts`, section 12.3.

## 14. Rulings, each with what it costs if wrong

The owner ruled the scope (D41) and the WASD behaviour (D41, the idea file's round two). Everything
below is the spec author's ruling under D11 and is reversible by the owner.

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | The visibility table is baked once at **today's** offset, with `World.testPoint`'s far clip parameterised to `(3500 * ZOOM_MAX_FP) >> 8` for the bake, and zoom never re-runs it. Baking the **offset** wide, which the first draft ruled, is wrong: `pz` rises with the offset and the far clip then rejects more tiles at the widest zoom, under-including at the default one (section 5.1). | The viewport test is not monotone in `pz`, so if the superset property fails, tiles pop at the horizon and the client test in section 13 catches it before a player does. The fallback is to call `resetVisCalc` on zoom change, which the D40 spike prices at 0.1 to 0.3 s at r = 25, so the slider becomes stepped and applies on release. Half a day. |
| R2 | Pitch widens to 512 through five coordinated edits: the static table to **13** buckets, the local raw table to **14**, the bake loop to `pitch <= 544`, the dilation loop to `pitchLevel < 13`, and the `distance` array to 14. The camera-shake clamp at `Client.ts:6606-6612` reads `camPitchMax` too. The value sent on `EVENT_CAMERA_POSITION` is clamped to 383 regardless. | 62.5 per cent more table memory and boot precompute, paid unconditionally, and multiplying against the draw radius (section 9.2). If that boot cost is measurable, drop the maximum to 448, which is 11 static buckets, 12 local, `pitch <= 480`, `pitchLevel < 11` and a 12-entry distance array; or abandon the widening and keep the setting as a user-lowerable cap inside 128 to 383, which is one constant. The wire clamp means no engine-side risk is taken either way. |
| R3 | The draw clock is `requestAnimationFrame`; `worldUpdateNum` is left exactly as it is and every consumer must be a no-op at a zero delta; `sceneCycle`'s two timing consumers move to `Client.loopCycle`; `Client.drawCycle` and `Pix3D.cycle` are **not** touched, because neither carries frame timing. The camera is the only thing interpolated. | If a consumer of `worldUpdateNum` misbehaves at zero, the artefact is a stalled animation on some frames and the fix is a guard at that call site. If entity motion reads as juddering against a smooth camera at 60, the fix is a second position pair per entity, which is a real change and would be its own entry. Turning `cs.fps.interpolate` off is the immediate escape hatch and it is why that setting exists separately. |
| R4 | Camera mode swallows `ch` 32 to 126 plus 8 and 9; it never swallows 1 to 5, 10, 13, 27 or F1 to F7. | Too broad and a key a player needs stops working, which is one range edit. Too narrow and a character leaks into the chat line, which is the exact failure the setting exists to prevent, so the range errs broad on purpose. |
| R5 | The four arrow keys are excluded from the human-input detector **unconditionally**; W, A, S and D are excluded only when `cs.cam.wasd` is on. Gating the arrows on a setting that defaults off would leave today's defect in place for every default configuration. | A player who meant to take over a run by pressing an arrow or W has to click or press any other key first. Every other key and Escape keep the takeover path. One predicate to revert, and the arrow half can be re-gated separately from the WASD half. |
| R6 | A chat modal (`chatModalId !== -1`) is not an auto-typing-mode trigger; the three triggers are `socialInputOpen`, `dialogInputOpen` and the report-abuse modal. | The camera rotates while an NPC dialogue is open. If that is unwanted, add the chat-modal test to `promptOpen`, one clause. |
| R7 | The mode surfaces as a new `inputMode` hook event, not a `ClientState` field. | A `ClientState` field would lag by up to 600 ms and the hint would flicker on a timer. If the event proves noisy, coalesce it in the shell rather than move it to state. |
| R8 | One `setDisplay` method taking a partial, fanned out on boot and on change but not on tab switch, because settings are per browser. | If a player wants per-character display settings, the fan-out moves to `manager.show()` and the keys gain a character suffix, which renames keys and section 4.1 forbids renaming. That is the expensive direction and it is why per browser is chosen while it is still free. |
| R9 | A real `range()` slider goes into the library (five edits), rather than reusing a number input. | Five edits of library work for three consumers. If the budget bites, the fallback is a number input with min, max and step, which `settingsForm.ts:30` already renders, and it is one edit. The owner asked for a slider in the words D41 quotes, which is why the library work is chosen. |
| R10 | The Display section is one collapsible `details.section` appended after Game view, and Game view is left exactly as shell v2 ships it, **whatever that is**. This document does not assert that Task 20 removes the `details` wrapper `config.ts:31` has today; that assertion was an inference and it is withdrawn. | If entry 4 flattens Game view, the panel is a flat block above a collapsible one. Four lines to wrap it, and the note that doing so re-shapes a panel entry 4 just wrote. |
| R11 | The draw-distance slider ships the D40 spike's five stops, 15, 25, 32, 40 and 50, default 25, maximum 50, with no engine change and no rebuild-policy override. At or below the baked radius it rebuilds nothing and is live; above it, `resetVisCalc` and `Model.farClip` apply at the next scene rebuild. | The spike's 1.5x to 2.5x frame-time estimate for r = 25 to r = 50 is reasoned, not measured, and the 17 MB table at 13 pitch buckets and r = 50 is arithmetic on a V8 slot size. If either bites on a real machine, dropping the top stop is one array entry and dropping the pitch ceiling to 448 is R2's lever. The default is unchanged either way, so no player who never opens the section is affected. |
| R12 | The dormant frame capability's `_fireBeforeDraw` and `_fireAfterDraw` are not wired; the seam is the named `Client.drawScene` method. | A later WebGL entry adds the fire points itself, which is where they belong, and D18 stays intact. |
| R13 | `ClientState.fps` becomes a measured draws-per-second count rather than `GameShell`'s derived ratio. | Both consumers are display-only footer text, so nothing breaks. If something later wants the game-cycle ratio it is added as a second field rather than reverting this one. |
| R14 | `::fps <n>` keeps working, drives the same target the Display section drives, and does not persist. | If a player expects `::fps` to stick, they set it in the panel instead, which is one sentence of help text. The alternative, letting a debugging command rewrite a stored preference, is worse and is why it was not chosen. |
| R15 | Slash and Colon enter typing mode alongside Enter, matching `KeyRemappingListener.java`, and unlike Enter they are **not** consumed, so the character lands in `chatInput`. This reverses the first draft's refusal of the `::` command line as a trigger. | If a player finds Slash annoying because they meant to swallow it, it is one entry removed from the entry-key set, and Enter still reaches the command line. The owner named the `::` command line explicitly, which is why the reversal went this way rather than staying with the smaller surface. |
| R16 | The "Press Enter to chat" hint is **exempt** from the Configuration panel's Hide overlays switch: it renders into its own `#hint` element beside `#overlays`, not inside it. The first draft treated that inheritance as a free benefit. | A player who wants a completely clean canvas keeps one small pill. If that is unwanted, moving `#hint` inside `#overlays` is one line, and the cost of the other direction is a player in camera mode with no explanation of why their typing does nothing, which is the confusion the hint exists to prevent. |
| R17 | `cs.fps.target` defaults to `'50'`, which is today's behaviour, even though the owner wrote "Ideally unlocked fps, but a smooth 60 is a great improvement". The 60 position ships only if it clears section 12.2's gate on the reference machine. | This is the one default that contradicts a sentence the owner wrote, and it is recorded so the owner can reverse it. If 60 clears the 12.2 gate, flipping the default is one constant in `display.ts`. The reason it starts at 50 is that no player who never opens the Display section should have their frame timing changed by an entry they did not ask for. |
| R18 | This entry is the fork's first numbered patch outside `src/client/Client.ts`. The convention is **widened** with one anchor and one grep per file, `client/PATCHES.md`'s preamble and the `idlescape-client-patch` skill's zone table are amended in the same change, and the two new modules go in `client/src/hooks/` rather than `client/src/client/`. Section 11.1. | Every future upstream bump re-applies changes in four more files. The alternative, keeping the patches inside `Client.ts`, is not available: the draw window, the visibility table and the model far clip are in `dash3d/`, and the loop and the key handler are in `GameShell.ts`. Leaving the two documents un-amended is the only genuinely bad outcome and it is the one this ruling prevents. |
| R19 | The two sprint 3 items D42 folds in ride **patch N+4** and add no arm to `runBanner.onKey`: F1 to F7 are routed from `e.code` with their `ch` 1008 to 1014 queue entries suppressed, and Escape's three client-local arms are ordered typing mode first, interface close second, camera mode's nothing last, **at most one firing per press**, with the shell's panic key firing alongside whichever won. Section 6.6. | Miss the queue suppression and one F3 switches the tab twice, which is one predicate. Invert the ordering and an Escape meant to clear a half-typed line closes the bank instead, which is one branch to swap and the reason the order is written down rather than left to the patch to invent. The expensive failure is the third: making the interface arm a condition on the shell arm, or reaching for `stopPropagation()` to keep one press from doing two things, kills the panic key while a script is running and no unit test in this project sees it. That is why the arms are ordered inside the client and why section 11's N+4 grep pins `stopPropagation` at **0**. |

Five of these cross entries. Three are already recorded in `docs/superpowers/decisions.md` as D49,
D50 and D51: the `range()` library work that binds entry 4's library and its two family tests (R9),
the `ClientState.fps` meaning change that touches two shell surfaces (R13), and the two numbers this
spec added to the D40 spike's brief (R11 and section 9.2, now superseded by the spike's own report).
Two are added by this revision and recorded as **D56** (the fork-convention widening, R18) and
**D57** (the draw-distance stops and maximum the spike returned, R11).

## 15. What this supersedes in the idea file

The idea file stays the record of the owner's intent and its four stages still stand. Three of its
statements are corrected here and this document wins on all three:

- **"The far clip is 3500 units, about 27 tiles. Raising it is a constant."** It is not. The
  plus-or-minus-25 tile window in `renderAll` is the binding bound and the clip is matched to it by
  design (section 2, section 9.2).
- **"Camera distance is `pitch * 3 + 600` (`Client.ts:6572`); a factor plus a wheel handler is one
  numbered patch."** The formula is at two sites and the second one bakes the visibility table
  (section 5.1). It is still one patch, but not for the reason given.
- **"A one-word hint in the chatbox."** The hint is drawn over the canvas by the shell's overlay
  layer as an `.ov-pill`, not in the chatbox, because the shell cannot draw into the client's chat
  area and the design bundle rules `.ov-pill` the only language over the canvas (section 6.8).

- **"A one-word hint in the chatbox."** Superseded on placement, as above. The replacement is named
  in full rather than left open: an `.ov-pill` in the **bottom-left** corner, nearest the chat line,
  in its own `#hint` element so Hide overlays does not silence it (section 6.8, R16).

One thing the idea file left open and this spec answers: its question 2, "interpolation in the draw
loop, camera only or entity positions too", is ruled camera only (R3). Its question 1, the rebuild
policy, is answered by the D40 spike, which ruled against changing it and whose answer this document
adopts in section 9.2. Its question 3 belongs to the later renderer entry.

**What this spec no longer supersedes.** The first draft refused the owner's `::` command line as an
auto-typing trigger without recording it as a ruling or listing it here. That refusal is reversed by
R15, so the owner's sentence stands as written and there is nothing to supersede.

## 16. File structure, all under 400 lines

New:

| File | Lines, roughly | Purpose |
|---|---|---|
| `client/src/hooks/DrawLoop.ts` | 100 | The display clock. Start, stop, target, frame count, the in-flight guard. No client knowledge. In `hooks/` per R18. |
| `client/src/hooks/DrawLoop.test.ts` | 80 | Fake-clock cases, including the dropped re-entrant callback. |
| `client/src/hooks/InputMode.ts` | 140 | The pure key state machine and the swallow predicate. No `Client` reference. In `hooks/` per R18. |
| `client/src/hooks/InputMode.test.ts` | 220 | Section 13's case list. |
| `web/src/frame/display.ts` | 130 | The seven keys, defaults, clamps, the settings shape, the fan-out. |
| `web/src/frame/display.test.ts` | 120 | Defaults, clamps, fan-out. |
| `web/src/panels/configDisplay.ts` | 110 | The Display section's markup and wire-up. |
| `web/src/panels/configDisplay.test.ts` | 90 | Renders and writes. |
| `web/e2e/camera.pw.test.ts` | 150 | Six scenarios. |
| `web/e2e/frameRate.pw.test.ts` | 80 | Reported, not asserted. |

Changed, with the size each ends at:

| File | Now | After | Change |
|---|---|---|---|
| `client/src/client/GameShell.ts` | 657 | about 675 | The wheel listener, the `DrawLoop` composition, the `InputMode` call in the key handlers. **It is already over the 400 ceiling and this entry does not make that worse by more than 20 lines**, which is exactly why the new logic lives in two new modules rather than inline. |
| `client/src/client/Client.ts` | 14481 | about 14540 | Held under 60 lines total across six patches. Unsplittable by this entry and not attempted. |
| `client/src/dash3d/World.ts` | **2484** | about 2495 | The `drawRadius` static, `testPoint`'s far-clip parameter, and both table dimensions plus both loop bounds. The first draft gave the base as "about 1080", which is out by more than a factor of two; `wc -l` at `1fe96f16` is 2484. **It is far over the 400 ceiling already**, and this entry adds about eleven lines and no new responsibility, which is the same honest accounting `GameShell.ts` gets above. |
| `client/src/dash3d/Model.ts` | 2425 | about 2428 | The `farClip` static read by `worldRender` at `:1723` (section 9.3). Also already over the ceiling; three lines. |
| `client/src/hooks/types.ts` and `install.ts` | - | plus 18 | `setDisplay` on both `ClientHooks` and `HookBridge`, and the `inputMode` and `zoomChanged` entries on `HookEvents`. |
| `client/bundle.ts` | - | plus 10 | Reserved names. |
| `web/src/clientTypes.ts` | 134 | about 150 | The mirror, in the same commit. |
| `web/src/panels/config.ts` | 51 | 54 | Appends the Display section. |
| `web/src/frame/overlays.ts` | 23 | about 50 | `setHint`, plus the `#hint` element that sits outside the `hidden`-toggled root (R16). |
| `web/src/frame/stage.ts` | 332 | about 345 | `applyDisplay`. |
| `web/src/sessions/manager.ts` | - | plus 1 | One call at `:188`. |
| `web/src/agent/localTransport.ts` | - | plus 6 | The camera-key exemption. |
| `web/src/ui/parts.ts`, `styles/form.css`, `styles/families.ts`, `styleguide.html` | - | plus 50 total | `range()`, its rules, its prefix, its demo. |
| `web/src/main.ts` | 358 | 361 | Three lines. It is the ceiling pressure point and section 4.5 keeps it there. |

Also changed, and named because R18 requires it in the same commit: `client/PATCHES.md`'s preamble
and `.claude/skills/idlescape-client-patch/SKILL.md`'s zone table, one line each.

Two files this entry never touches and the plan must not let it drift into: anything under `engine/`
or `engine/content`, and `web/src/frame/runBanner.ts`.

## 17. Dependencies and placement

**Placement: sprint row 9, after SP8c.** Restating why, because the plan reads this line and not the
sprint document:

- **After entry 3**, which is what makes a numbered patch checkable at all. Six of this entry's
  changes are numbered patches and their greps are worth nothing until entry 3's gate exists.
- **After entry 8 (SP8c)**, so the six patches land in one batch with SP8c's rather than in two, and
  the fork is rebased once.
- **After entry 4 (shell v2)**, because the Display section composes that library, its `range()`
  builder goes into that library, and a settings section written before the library exists is a
  settings section written twice. Section 4.4's shape rule is written against shell v2's Task 20
  Step 2 output, not against `config.ts` as it reads today.
- **Independent of D40's spike, which has in any case reported.** The spike supplied one number, the
  slider's maximum, and section 9 now carries it. This entry never waited on the spike and does not
  now.

**Decomposition: one plan, client patches first.** The sprint's convention (sprint spec section 5) is
that `superpowers:writing-plans` runs against an approved spec and produces one plan executed by
subagent-driven development, and this entry stays inside it. The tasks are ordered client-patches
first, N through N+5 in that order, then the shell fan-out, for one reason that is not taste: the
shell half has nothing to call until N+5 lands `setDisplay` and the two events, and the shell tests
that matter (`display.test.ts`'s fan-out case, `camera.pw.test.ts`'s six scenarios) all assert
against a client that already speaks the new surface. The two halves have different gates, entry 3
plus entry 8 for the patches and entry 4 for the shell, but both gates are cleared before row 9 runs,
so there is nothing for a split to buy. If the patch half stalls, the plan's checkpoint after N+5 is
the place a second session picks it up.

It touches no engine or content code and appends to no pack, so it does not compete with the two
content entries for the overlay, and it is the cheapest row below entry 8.

## 18. What this does not do

- **No WebGL backend.** Section 10 keeps its door open and names what it would replace, and that is
  all. The renderer has no row and no spec in this sprint; it stays a candidate with osrs.world's
  renderer, by the same author as upstream's never-merged `225-gpu` branch, named in the idea file as
  the reference.
- **No fog, anti-aliasing, texture filtering or any 2007-era look.** All four are GPU-only and all
  four are stage four of the idea file. The Display section is laid out so they arrive as further
  rows in it rather than as a new surface.
- **No free camera and no detaching the camera from the player.** The orbit camera keeps its target.
  A free camera is the standalone viewer idea, not this entry.
- **Nothing under `engine/` or `engine/content`, and no content pack.** The scene-rebuild policy is
  engine-side and this entry reports on it (section 9.2) rather than changing it. The wire clamp in
  section 5.3 exists precisely so no engine change is needed.
- **No new panel and no twelfth strip icon.** Section 4.2.
- **No entity interpolation.** Section 7.3, and it is named as the WebGL entry's door.
- **No change to `runBanner.ts`, to `localTransport`'s Escape exclusion, or to the recovery ladder.**
  Section 6.5, and the zero `stopPropagation` grep in section 11 is how it stays that way.
- **No `SettingField` range member and no `settingsForm.ts` branch.** Section 4.3. The config panel
  renders none of its controls through that form.
- **It does not choose the draw-distance maximum, and it does not need to.** The maximum is 50 and
  it is the D40 spike's number, adopted in section 9 rather than invented here. What this entry does
  not do is enlarge the built scene or change the engine's rebuild policy, both of which the spike
  ruled against.
- **No `forbidden_api` entry.** Section 12.1. That scan does not exist; the requirement on it is
  stated forward, for entry 5, and nothing here depends on it.
- **It does not wake the client plugin tier.** D18 stands (R12).
