# content-custom/

`engine/content` is a pinned, git-ignored clone of the upstream
[Content](https://github.com/LostCityRS/Content) repo (see `scripts/upstream.lock`). It is
never hand-edited: every checkout/bump replaces it wholesale, so anything we add directly
inside it would be silently lost on the next `scripts/setup.ps1` run.

This directory is the alternative: a **tracked** overlay that adds or replaces files in the
content tree without touching the pristine clone. It mirrors `engine/content`'s top-level
layout (one folder per line below, matching the 274 pin) so a file placed at
`content-custom/scripts/areas/foo.rs2` lands at `engine/content/scripts/areas/foo.rs2`.

```
binary/  fonts/  jingles/  maps/  models/  pack/  scripts/  songs/  sprites/  synth/
textures/  title/  wordenc/
```

`.git*`, `.vscode/`, `.github/` and similar tooling directories that exist at the root of the
Content clone are deliberately not mirrored here — they are upstream repo plumbing, not
content an overlay would ever need to add to or override. Each directory above starts out
empty (holding only a `.gitkeep` so git tracks it); real overlay files go inside them,
following the same relative path they should land at under `engine/content`.

## How it's applied

`scripts/content-overlay.ps1` copies every real file under this directory's subfolders on top
of the matching path in `engine/content/`, creating destination directories as needed. `README.md`,
`PATCHES.md`, `manifest.json` and `.gitkeep` are bookkeeping and are skipped at any depth, the same
list `scripts/engine-overlay.ps1` uses. Files at the root of this directory are never copied at all,
only files inside the subfolders.

`deploy/docker/engine.Dockerfile`'s copy of this directory (its `find` at `:51`) is close but not
identical, and three differences are still open: it has no depth floor, so a root-level file here
lands in the image and not in a local clone; it does not skip `PATCHES.md`, so a nested one lands in
the image and not locally; and it matches `README*` case-insensitively rather than exactly
`README.md`, so a `readme.txt` lands locally and not in the image. The engine half of that
Dockerfile (its `find` at `:67-68`) does match `scripts/engine-overlay.ps1` exactly. Nothing in the
tree exercises any of the three today; aligning the Dockerfile is that file's own change.

Re-running is safe: byte-identical files are left untouched and changed files are overwritten.
A file **deleted** from this directory is removed from the clone on the next apply, restored to
upstream's copy where one exists and deleted where it does not. The record is a `.overlay-manifest`
sidecar in the clone root, which is git-ignored and survives `scripts/setup.ps1`'s force checkout.
Every file here must be listed in `manifest.json`; one that is not **fails the apply**, because
`-Check` only ever walks manifest entries and an unlisted file would be checked by nothing.

It runs automatically:
- from `scripts/setup.ps1`, after the upstream checkout and before the pack step, and
- from `scripts/start-stack.ps1`'s dev path, on every start, so the engine's content watcher
  always sees a consistent tree.

You can also run it by hand: `powershell -File scripts/content-overlay.ps1`.

Because `engine/` is git-ignored in this repo, the files the overlay writes into
`engine/content/` will show up if you `git status` *inside that clone's own `.git`* — that is
expected and harmless; `engine/content` itself is not tracked by our repo, and
`scripts/upstream.lock` remains the source of truth for the pinned base.

## manifest.json

Every file the overlay contributes must be listed in `manifest.json` so a future upstream
revision bump can be checked for conflicts:

```json
{
  "base": "2b62ae68dfed02b441bae47987a01d6bcbaeb358",
  "files": [
    { "path": "scripts/areas/foo.rs2", "kind": "replace", "baseSha256": "<sha256 of the upstream blob this override was authored against>" },
    { "path": "scripts/areas/bar.rs2", "kind": "new", "baseSha256": null }
  ]
}
```

- `base` - the upstream Content revision every `baseSha256` below was recorded at, which is the
  commit `scripts/upstream.lock` pins. Its engine sibling is `engine-custom/manifest.json:2`.
- `path` - the file's location relative to both `content-custom/` and `engine/content/`
  (forward slashes).
- `kind` - `replace` when upstream has a file at `path` that this entry overrides, so
  `baseSha256` is required and is compared on every check; `new` when upstream has no file
  there, so `baseSha256` is `null` and the entry is skipped.
- `baseSha256` - the SHA-256 of the **upstream** file this override replaces, recorded at the
  time the override was written, and `null` for a `kind: "new"` entry.

Run `scripts/content-overlay.ps1 -Check` after bumping `scripts/upstream.lock` and re-running
setup: it rehashes each listed upstream blob at the clone's HEAD and reports any that drifted
from what was recorded, meaning the overlay may need to be reviewed against the new upstream
content before it's trusted again.

`-Check` hashes the upstream GIT BLOB for each recorded path at the clone's current HEAD, not the
file as it sits in `engine/content`: after an apply, that file is our own copy for every `replace`
entry, so the working tree cannot answer "what does upstream say?". **It exits 1 on drift**, the
same contract as `scripts/engine-overlay.ps1 -Check`, and `scripts/verify.ps1` runs both in its
overlay step. Entries with `kind: "new"` are not hash-compared, but if upstream now has a file at
that path the check reports a collision and exits 1, so a replace entry relabelled `new` cannot
make its drift disappear; a `replace` entry with no recorded hash is an error rather than a skip.

Both scripts share that hashing, in `scripts/lib/OverlayHash.ps1`, whose `Assert-OverlayHashing`
self-test runs on every invocation and proves the answer does not move when the working tree does.
A recorded hash is recoverable with
`git -C engine/content -c core.autocrlf=false show HEAD:pack/<name>.pack | sha256sum`.

## Packing

The engine's `npm run build` refuses to pack a config the original 2004 cache did not have (it
checks each packed client config against a hard-coded CRC). Anything this overlay adds must be
packed with the overlay's own entry point instead:

```sh
powershell -File scripts/content-overlay.ps1
cd engine/server && npx tsx tools/pack/BuildOverlay.ts
```

`scripts/setup.ps1` already does exactly this. See engine-custom/PATCHES.md, "Packing a config
the 2004 cache does not have", for what the relaxed check gives up.

`pack/*.pack` files are byte-pinned. `.gitattributes` carries `*.pack text eol=lf`, so the blob
and every checkout are canonical LF on every platform. Under a bare `text=auto` a Windows checkout
lands CRLF, the engine's first pack run rewrites the file to LF, and `tools/pack/packGuard.ts`
reports that byte change as an obj-id renumbering. `eol=lf` closes that checkout half, and the
`text` attribute closes the other half by normalising a CRLF-authored line back to LF on
`git add`, which matters because sprint entries 10 and 11 append `<id>=<name>` lines by hand.
`obj.pack`, `inv.pack` and `loc.pack` are verbatim copies of upstream 274 with nothing appended
yet; those entries append the ids the sprint spec's section 3 allocates, and
`engine-custom/src/idlescape/packIds.test.ts` fails if any of them lands on the wrong number.
