---
name: idlescape-engine-overlay
description: Use when changing anything under engine/server/src - the Lost City engine's behaviour, the owner assertion, the staff allow-list, the shared owner bank, or the management routes. The clone is never edited; changes go in engine-custom/ as a tracked overlay.
user-invocable: true
---

# Changing the engine

`engine/server` is a pinned, **git-ignored** clone of LostCityRS/Engine-TS at revision 274, sha
`1d25566cb53e7af1b1cb18ade8af996316c19614` (`scripts/upstream.lock`). It is replaced wholesale by
`scripts/setup.ps1` on every checkout or revision bump, so **anything written directly inside it is
silently lost.** `engine-custom/` is the tracked overlay that survives.

## Read first

- `engine-custom/README.md` - what the overlay is, how it is applied, and what it guarantees.
- `engine-custom/PATCHES.md` - **the authority on every change**: what it does, the surrounding
  code that anchors it, and the typed `patches-check` row that proves it is still applied.
- `engine-custom/manifest.json` - the machine-readable half: every path the overlay contributes,
  with the sha256 of the upstream **git blob** it was authored against, plus `anchors` for upstream
  files the overlay does not replace but whose code a runtime patch depends on.
- `docs/OPERATIONS.md` - ports, the engine's secrets, and how the stack applies the overlay.

## Rules that are not negotiable

- **Never edit `engine/server` or `engine/content` directly.** Ever. Not to try something, not
  temporarily.
- **Prefer a new file to a replacement.** Everything under `src/idlescape/` is ours and upstream has
  no opinion about it. Where a change can be made by patching a prototype or wrapping a public
  method at boot (`src/idlescape/install.ts`), do that and record an `anchors` entry. A 2,300-line
  copy of `Player.ts` rots invisibly; a runtime patch whose anchor moved fails `-Check` loudly.
- **A replacement is a whole file, not a patch file.** Kept whole so `tsc --noEmit` and the editor
  see real code.
- **Every overlay file must be `git add`ed.** The overlay is copied into a throwaway clone, so an
  un-added file still applies and still passes every suite on your machine while being absent from
  the repository. `verify.ps1`'s "overlay manifest paths are git-tracked" sub-step catches this,
  across both overlays; do not make it find something.
- **Every change gets a `PATCHES.md` entry with a typed `patches-check` row that returns a stated
  count** after the overlay is applied. Line numbers drift; anchors do not. `scripts/patches-check.ps1`
  runs every row inside `npm run verify`, and a row whose target file is missing is a failure, never
  a skip.
- **Both engine secrets have a 32-character floor** enforced at boot. An empty
  `ENGINE_MANAGEMENT_SECRET` means the management routes are simply not registered, which is the
  intended safe state, not a bug.
- **Files under 400 lines**, test files included. Three suites here were split purely to hold that
  line.

## Working modes

### Adding or changing an overlay file

1. Read the upstream file in `engine/server` and decide: new file under `src/idlescape/`, runtime
   patch plus an anchor, or whole-file replacement. In that order of preference.
2. Write it at the mirrored path: `engine-custom/src/web.ts` lands at `engine/server/src/web.ts`.
3. Record it in `manifest.json`. For a replacement, `baseSha256` is the sha256 of the upstream
   **git blob** (`git -c core.autocrlf=false show <sha>:<path>`), not of the file on disk: the
   clone is checked out with `core.autocrlf=true`, so the two differ.
4. Write the `PATCHES.md` entry, with the anchoring code and a `patches-check` row that asserts it.
5. `git add` the file. Then apply and check.

### Applying and checking

```powershell
powershell -File scripts/engine-overlay.ps1           # apply, idempotent
powershell -File scripts/engine-overlay.ps1 -Check    # exits 1 on drift
```

`-Check` rehashes the blob for every recorded path at the clone's current HEAD, which is
deliberately not the working tree: by the time `-Check` runs, the overlay has already overwritten
the working-tree copy of every replaced file. A `kind: "new"` entry is not hash-compared, but if
upstream now has a file at its path the check reports a collision and exits 1, because the apply
would overwrite it unchecked. That is only worth anything if the clone is at the pinned sha,
which is why `Assert-ClonePins` (`scripts/lib/UpstreamLock.ps1`) compares both clones
to `scripts/upstream.lock` first, in `verify.ps1` and in `start-stack.ps1`. On a stale clone every
recorded hash agrees with the blob it was taken from and the drift check passes vacuously.

Two things the apply path does that it did not used to:

- **It removes what the overlay stopped owning.** Each apply writes a `.overlay-manifest` sidecar
  into the clone root. A path in the previous sidecar that is not in the current source set is
  restored from the clone's git objects where upstream has one, and deleted where it does not. The
  sidecar is untracked (`.gitignore:8` anchors `/engine/`) and survives `setup.ps1`'s force
  checkout, which is what makes it useful. Delete an overlay file and re-apply; do not hand-delete
  it from the clone.
- **An overlay source file that is in no manifest is a hard failure**, not the printed note it was.
  Add the entry, or the apply exits 1.

The overlay is applied automatically by `scripts/setup.ps1` (after checkout, before the pack) and
by `scripts/start-stack.ps1` (before the engine starts).

### After a revision bump

`-Check` exits 1 and names every path whose upstream base changed. That is the whole point. Re-read
each named upstream file, re-apply the hunk, update `baseSha256`, and re-run
`scripts/patches-check.ps1`. Do not update a hash without re-reading the file it describes. The
standing procedure for a whole revision bump is `docs/OPERATIONS.md` section 10.

## Verification

```powershell
powershell -File scripts/engine-overlay.ps1           # apply
powershell -File scripts/engine-overlay.ps1 -Check    # must exit 0
```

Then, from `engine/server`:

```powershell
npx tsc --noEmit
npx tsx --test --test-force-exit src/idlescape/<name>.test.ts
```

Pass the suite paths **relative** to `engine/server`, never absolute. An absolute path carries
whatever drive casing the caller typed; node then holds two specifiers for the same file, evaluates
the engine's circular module graph twice, and three suites die at load with `Cannot access 'Player'
before initialization`. `--test-force-exit` is required too, or the run hangs on an event loop the
engine's worker threads never drain.

`verify.ps1`'s overlay step runs all of this plus the clone pin check, the content overlay's apply
and `-Check`, the manifest-git-tracked check across both overlays, and `scripts/patches-check.ps1`,
which asserts `engine-custom/PATCHES.md`'s rows against the applied clone. The rows there are typed
data now (`<tag> | <mode> | <expected> | <file> | <literal>`), not shell greps: write one per
change, and run `powershell -File scripts/patches-check.ps1` rather than pasting anything into a
shell. That step passing is the bar; see `docs/VERIFICATION.md`.
