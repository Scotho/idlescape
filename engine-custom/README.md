# engine-custom/

`engine/server` is a pinned, git-ignored clone of the upstream
[Engine-TS](https://github.com/LostCityRS/Engine-TS) repo (`scripts/upstream.lock`, currently
`1d25566cb53e7af1b1cb18ade8af996316c19614`, revision 274). It is never hand-edited: every
checkout or revision bump replaces it wholesale, so anything written directly inside it is
silently lost on the next `scripts/setup.ps1` run.

This directory is the alternative, and the exact counterpart of `content-custom/` for the
server half: a **tracked** overlay that adds or replaces files in the engine tree without
touching the pristine clone. It mirrors `engine/server`'s layout, so a file at
`engine-custom/src/web.ts` lands at `engine/server/src/web.ts`.

Two kinds of file live here:

- **Replacements** - whole copies of an upstream file with our hunks applied. Kept whole (not
  as patch files) so `npx tsc --noEmit` and the editor see real code. Every one is recorded in
  `manifest.json` with the sha256 of the upstream file it was authored against.
- **New files** - everything under `src/idlescape/`, which upstream has no opinion about.
  Where a change can be made from a new file instead of a replacement (by patching a prototype
  or wrapping a public method at boot), it is: a runtime patch that stops matching upstream is
  caught by an `anchors` entry in `manifest.json`, whereas a 2,300-line copy of `Player.ts`
  would rot invisibly.

`PATCHES.md` is the authority on what each change is, where its anchor is, and how to verify
it is still present, the same contract as `client/PATCHES.md`.

## How it is applied

`scripts/engine-overlay.ps1` copies every real file under this directory's subdirectories on
top of `engine/server/`; root-level files, and `README.md`, `PATCHES.md`, `manifest.json` and
`.gitkeep` at any depth, are bookkeeping and are skipped. It runs automatically from
`scripts/setup.ps1` (after checkout, before the pack) and from `scripts/start-stack.ps1` (before
the engine starts). Run it by hand with PowerShell
(`powershell -File scripts/engine-overlay.ps1`).

Re-running is safe: byte-identical files are left untouched and changed files are overwritten.
A file **deleted** from this directory is removed from the clone on the next apply, restored to
upstream's copy where one exists and deleted where it does not. The record is a `.overlay-manifest`
sidecar in the clone root, which is git-ignored and survives `scripts/setup.ps1`'s force checkout.
Every file here must be listed in `manifest.json`; one that is not **fails the apply**, because
`-Check` only ever walks manifest entries and an unlisted file would be checked by nothing.

`powershell -File scripts/engine-overlay.ps1 -Check` **exits non-zero** on drift.
`scripts/verify.ps1` runs it in its overlay step (step 2, after the clone pin check and the
apply), so a revision bump that invalidates a patch fails verification instead of shipping.

What it guarantees, precisely: for every path recorded in `manifest.json` (both `files` entries
of kind `replace` and every `anchors` entry), it rehashes the **pinned upstream blob** at the
clone's current `HEAD` and compares that to the recorded hash. It fails if any of those blobs
has changed or has disappeared from the tree. So bumping `scripts/upstream.lock` to a revision
that touches a file we replace, or that touches a file a runtime patch is anchored to, fails
verification.

What it does **not** guarantee:

- It says nothing about hand edits to `engine/server`. It deliberately reads the git blob and
  not the file on disk, because by the time it runs the overlay has already overwritten the
  working-tree copy of every `replace` file with ours. (A working-tree file matching neither
  upstream nor our overlay copy is reported as a non-fatal warning, not a failure.)
- It does not check that the patch still *works*, only that the code it was written against is
  unchanged. `PATCHES.md` carries the greps for actual presence.
- `kind: "new"` entries have no hash to compare, so `-Check` asks the other question of them: if
  upstream now has a file at that path (a replace entry relabelled `new`, or a bump that added the
  path), that is reported as a collision and the check exits 1, because the apply would overwrite
  it on every run and nothing would ever compare the two.

Because the hashes are of git blobs, they are **not** the hash of the file on disk: this clone
is checked out with `core.autocrlf=true`, so the working tree is CRLF while the blob is LF and
the two hash differently. Record a new entry's `baseSha256` from the blob:

```sh
git -C engine/server -c core.autocrlf=false show HEAD:src/web.ts | sha256sum
```
