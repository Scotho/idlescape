---
name: idlescape-content-overlay
description: Use when adding or changing a pack id, an obj/inv/loc/npc config, a RuneScript file, an interface, or a map under engine/content. The clone is never edited; changes go in content-custom/ as a tracked overlay, and pack ids are pinned by hand.
user-invocable: true
---

# Changing game content

`engine/content` is a pinned, **git-ignored** clone of LostCityRS/Content at revision 274, sha
`2b62ae68dfed02b441bae47987a01d6bcbaeb358` (`scripts/upstream.lock`). It is replaced wholesale on
every checkout, so **anything written directly inside it is silently lost.** `content-custom/` is
the tracked overlay.

## Read first

- `content-custom/README.md` - the layout, how the overlay is applied, and the `manifest.json`
  shape.
- `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` section 3 - **the pinned pack-id
  allocation**, reproduced below. That section is the authority; this table is a copy for
  convenience and must be re-read there before you allocate.
- `docs/OPERATIONS.md` - the stack, and why the overlay runs before the engine starts.

## The pack ids that are already allocated

Pinned by hand, by name, in the sprint spec's section 3.

The sprint entry numbers here are the **current** ones. They were renumbered by decisions D39 and
D41; time candy is entry **10** and battlebots is entry **11**. If you find 4 and 5 in a copy of
this table, that copy is stale and the ids are still right.

| Pack | Id | Name | Sprint entry |
|---|---|---|---|
| `obj` | 3894 | `time_candy` | 10, time candy |
| `obj` | 3895 | `time_candy_filled` | 10, time candy |
| `inv` | 217 | `bb_stash_inv` | 11, battlebots |
| `inv` | 218 | `bb_stash_worn` | 11, battlebots |
| `inv` | 219 | `time_candy_keep` | 10, time candy |
| `loc` | 4671 | `bb_portal` | 11, battlebots |

**All four allocated packs are tracked**, since entry 3: `content-custom/pack/` holds `obj.pack`,
`inv.pack`, `loc.pack` and `varp.pack`, so there is a file to append to and a test that reads it.
None of the six names above exists yet; entries 10 and 11 write them.

Upstream maxima at the 274 pin: `obj` 3893, `inv` 216, `loc` 4670, `map` 1007, `interface` 10983,
`dbrow` 1290, and `varp` 358 with our own overlay already holding **359 to 367** (the bank tab
sizes, in `content-custom/pack/varp.pack`). Sprint entry 11 also appends to `map.pack` and extends
`varp.pack`; task 2 of its plan owns those and nothing else in the sprint touches them. **`map.pack`
is not pinned** and neither is the `vars.pack` the same sentence names, which does not exist at the
274 pin at all; entry 11 resolves both (decision D116).

**This table settled a real collision.** Entries 10 and 11 were written independently against
upstream's `inv` maximum of 216 and both claimed 217. Entry 11 kept 217 and 218; entry 10 moved to
219. The ids are pinned by name, so reordering the sprint entries does not move them.

## Rules that are not negotiable

- **Never edit `engine/content` directly.**
- **Allocate a pack id in the sprint spec's section 3 before you write it anywhere else.** Then copy
  it here. Two entries allocating in their own specs is how the 217 collision happened.
- **Pack ids are pinned by name, and a renumber is a data-corruption event.** `BuildOverlay.ts` runs
  with `Environment.build.verify = false`, so a name the `.pack` file does not know auto-registers
  and rewrites the file. A renumbered `.pack` renumbers obj ids **already written into every `.sav`
  and every owner-bank JSON**, turning one item into another in save data that has already shipped.
  The build itself is not silent about it - see "Verification" below for exactly what the guard
  catches and what it misses - but nothing downstream will tell you.
- **Mirror the upstream path exactly.** `content-custom/scripts/areas/foo.rs2` lands at
  `engine/content/scripts/areas/foo.rs2`. Only the top-level directories listed in
  `content-custom/README.md` are mirrored; repo plumbing (`.git*`, `.vscode/`, `.github/`) is
  deliberately not.
- **Every file the overlay contributes goes in `content-custom/manifest.json`,** pairing its path
  with the sha256 of the upstream file it was authored against, so a revision bump that invalidates
  an override is caught.
- **Restart the engine after changing the overlay.** Its content watcher wants a consistent tree
  from the first pack.

## Working modes

### Adding content

1. Allocate any new pack id in the sprint spec's section 3, by name, and say which entry owns it.
2. Write the file at the mirrored path under `content-custom/`.
3. Append the id to the matching `content-custom/pack/*.pack` file **by hand**, as a literal line.
   Do not let the builder allocate it.
4. Add the file to `content-custom/manifest.json`.
5. Apply the overlay, then **pack it with the overlay's own entry point**, then restart the engine.
   These are the two commands, and `content-custom/README.md:74-86` is their authority:

   ```powershell
   powershell -File scripts/content-overlay.ps1
   cd engine\server
   npx tsx tools/pack/BuildOverlay.ts
   ```

   **Never the engine's own `npm run build`** for anything this overlay adds: it checks each packed
   client config against a hard-coded CRC of the 2004 cache and aborts. `scripts/setup.ps1` already
   runs exactly this pair; `start-stack.ps1` applies the overlay on every start.

### Applying and checking

```powershell
powershell -File scripts/content-overlay.ps1           # apply, idempotent
powershell -File scripts/content-overlay.ps1 -Check    # exits 1 on drift; does not touch the clone
```

The overlay is applied automatically by `scripts/setup.ps1` (after checkout, before the pack) and
by `scripts/start-stack.ps1` on every start.

## Verification

```powershell
powershell -File scripts/content-overlay.ps1 -Check
```

**Know what this proves.** `-Check` rehashes every manifest entry against the **clone's pinned git
blob**, reports the entries whose upstream base changed, the ones whose base file vanished, and
the `kind: "new"` entries whose path upstream now carries a file (a collision the apply would
otherwise overwrite unchecked), and **exits 1** on any of the three. It is gated: `verify.ps1`'s
overlay step applies the overlay and then runs `-Check` and reads the exit code, after
`Assert-ClonePins` has proven both clones sit at `scripts/upstream.lock`'s shas, without which a
drift check on a stale clone passes vacuously (audit C23, closed 2026-09-08). A manifest entry
that is not `kind: "new"` and records no `baseSha256` is now an error rather than a silent skip.
Run it by hand as well after any content change and after any revision bump.

The checks that stand behind a content change:

- `powershell -File scripts/content-overlay.ps1 -Check`, exit code and all.
- `engine-custom/src/idlescape/packIds.ts` and `packIds.test.ts` (audit C22), which read the
  **tracked** files under `content-custom/pack/`, not the clone. They assert the intact upstream
  prefix and the recorded last upstream line of each pack, the nine shipped `banktab_size_N` varps
  positively, and each of the six allocated ids **both ways conditionally**: if the id line exists
  its name must match, and if the name appears its id must match. Nothing asserts presence until
  entries 10 and 11 append.
- `checkPackDir` (the `checkPack` scan of a whole pack directory) on both `packAll` paths,
  `engine-custom/tools/pack/BuildOverlay.ts` and `engine-custom/src/app.ts`, called before AND
  after the pack in each, on top of the sha-delta guard. The four `patches-check` rows in
  `engine-custom/PATCHES.md` assert all four calls.
- The engine starting and reaching `World ready` in `logs/engine.log` with your content packed.

**`.pack` files are `text eol=lf` in `.gitattributes`.** The blob is canonical LF because a CRLF
working-tree line is normalised on `git add`, and every checkout lands LF on every platform. Do not
remove that line: a CRLF checkout parses fine, but `save()` rewrites it to LF, the sha-delta guard
sees the file move, and the build exits 1 accusing you of renumbering obj ids.

**What the `BuildOverlay.ts` guard does and does not catch.** It sha256s every `*.pack` in the pack
directory **before** `packAll` and again after, and exits 1 naming every file that moved
(`engine-custom/tools/pack/packGuard.ts`). So a rewrite - the auto-registration that
`verify = false` allows - **is** caught, loudly, with instructions. Two things it cannot catch:

- A `packAll` that **throws** exits at the catch before the comparison, so a half-finished run
  names no files. Fix the failure and run it again to find out whether anything moved.
- A **wrong id that never moves** is byte-identical to a right one. A clean build is not evidence
  that an id is correct. Read the `.pack` line.
